/**
 * Guard Inspections Routes
 * 
 * Routes for guards to list and submit inspection requests.
 * Requires authentication and validates tenant isolation.
 */

const express = require("express");
const multer = require("multer");
const path = require("path");
const { Op } = require("sequelize");
const guardAuth = require("../middleware/guardAuth");
const {
  INSPECTION_UPLOAD_ROOT,
  ensureInspectionUploadDir,
  MAX_UPLOAD_BYTES,
  MAX_FILES,
} = require("../config/inspectionUploads");
const inspectionService = require("../services/inspection.service");

// Ensure upload directory exists
ensureInspectionUploadDir();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, INSPECTION_UPLOAD_ROOT),
  filename: (req, file, cb) => {
    const safe = String(file.originalname || "file").replace(/[^a-zA-Z0-9._-]/g, "_");
    cb(null, `${Date.now()}_${safe}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_UPLOAD_BYTES },
});

const router = express.Router();

// ✅ Guard only routes (require authentication)
router.use(guardAuth);

/**
 * GET /api/guard/inspections/requests?status=PENDING
 * Returns pending inspection requests for the guard
 */
router.get("/requests", async (req, res) => {
  try {
    const { InspectionRequest, InspectionSubmission, Site, Shift } =
      req.app.locals.models;

    const tenantId = req.user?.tenant_id;
    if (!tenantId) {
      return res.status(400).json({
        message: "Guard missing tenant_id. Guard must be assigned to a tenant.",
      });
    }

    const guardId = req.user?.guardId || req.user?.id;
    if (!guardId) {
      return res.status(401).json({ message: "Guard ID not found in token" });
    }

    const { status } = req.query;
    const where = {
      tenant_id: tenantId,
      guard_id: guardId,
      status: status ? String(status).trim().toUpperCase() : "PENDING",
    };

    const requests = await InspectionRequest.findAll({
      where,
      include: [
        { model: Site, attributes: ["id", "name"] },
        { model: Shift, attributes: ["id", "shift_date", "shift_start", "shift_end"] },
      ],
      order: [["due_at", "ASC"]], // Earliest deadline first
    });

    // Check for existing submissions
    const requestIds = requests.map((r) => r.id);
    const submissions = await InspectionSubmission.findAll({
      where: {
        request_id: { [Op.in]: requestIds },
        guard_id: guardId,
      },
    });

    const submissionsByRequestId = {};
    submissions.forEach((sub) => {
      submissionsByRequestId[sub.request_id] = sub;
    });

    // Enrich with submission status and time remaining
    const now = new Date();
    const out = requests.map((req) => {
      const submission = submissionsByRequestId[req.id];
      const dueAt = new Date(req.due_at);
      const msRemaining = dueAt.getTime() - now.getTime();
      const minutesRemaining = Math.floor(msRemaining / (1000 * 60));

      return {
        ...req.toJSON(),
        hasSubmission: !!submission,
        submission: submission || null,
        minutesRemaining: Math.max(0, minutesRemaining),
        isExpired: msRemaining < 0,
      };
    });

    return res.json(out);
  } catch (e) {
    console.error("❌ Error listing inspection requests:", e);
    return res.status(500).json({ message: e.message });
  }
});

/**
 * POST /api/guard/inspections/submit
 * multipart/form-data:
 *  - request_id (required)
 *  - comment? (optional text)
 *  - files[] (required, max 3 files: selfie + optional badge/signage)
 */
router.post("/submit", upload.array("files", MAX_FILES), async (req, res) => {
  try {
    const { InspectionRequest, InspectionSubmission, TimeEntry } =
      req.app.locals.models;

    const tenantId = req.user?.tenant_id;
    if (!tenantId) {
      return res.status(400).json({
        message: "Guard missing tenant_id. Guard must be assigned to a tenant.",
      });
    }

    const guardId = req.user?.guardId || req.user?.id;
    if (!guardId) {
      return res.status(401).json({ message: "Guard ID not found in token" });
    }

    const { request_id, comment = null } = req.body;

    if (!request_id) {
      return res.status(400).json({ message: "Missing required field: request_id" });
    }

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        message: "At least one photo is required",
      });
    }

    // Validate request exists and belongs to this guard
    const request = await InspectionRequest.findOne({
      where: {
        id: request_id,
        tenant_id: tenantId,
        guard_id: guardId,
      },
    });

    if (!request) {
      return res.status(404).json({
        message: "Inspection request not found or does not belong to this guard",
      });
    }

    // Check if already submitted
    const existingSubmission = await InspectionSubmission.findOne({
      where: { request_id: request.id, guard_id: guardId },
    });

    if (existingSubmission) {
      return res.status(400).json({
        message: "Inspection already submitted for this request",
      });
    }

    // Check if expired
    const now = new Date();
    const dueAt = new Date(request.due_at);
    if (now > dueAt) {
      // Auto-expire the request
      await request.update({ status: "EXPIRED" });
      return res.status(400).json({
        message: "Inspection request has expired",
      });
    }

    // Validate guard is clocked in (if shift_id provided)
    if (request.shift_id) {
      const timeEntry = await TimeEntry.findOne({
        where: {
          shift_id: request.shift_id,
          guard_id: guardId,
          clock_in_at: { [Op.ne]: null },
          clock_out_at: null,
        },
      });

      if (!timeEntry) {
        return res.status(400).json({
          message: "Cannot submit inspection: you must be clocked in for this shift",
        });
      }
    }

    // Process uploaded files: calculate hashes
    const photos = [];
    for (const file of req.files) {
      const hash = await inspectionService.calculateFileHash(file.path);
      photos.push({
        url: `/uploads/inspections/${file.filename}`,
        hash_sha256: hash,
        filename: file.filename,
        originalname: file.originalname,
        size: file.size,
        mime: file.mimetype,
        uploaded_at: new Date().toISOString(),
      });
    }

    // Check for duplicate hashes
    const photoHashes = photos.map((p) => p.hash_sha256);
    const duplicateCheck = await inspectionService.checkDuplicateHashes(
      photoHashes,
      guardId,
      req.app.locals.models
    );

    // Collect metadata
    const ip =
      req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
      req.socket?.remoteAddress ||
      null;

    const meta = {
      device: {
        type: req.body?.deviceType || null,
        os: req.body?.deviceOS || null,
        id: req.body?.deviceId || null,
      },
      ip: ip,
      location: {
        lat: req.body?.lat ? parseFloat(req.body.lat) : null,
        lng: req.body?.lng ? parseFloat(req.body.lng) : null,
        accuracy: req.body?.accuracyM ? parseFloat(req.body.accuracyM) : null,
      },
      duplicateCheck: duplicateCheck,
    };

    // Create submission
    const submission = await InspectionSubmission.create({
      request_id: request.id,
      tenant_id: tenantId,
      guard_id: guardId,
      submitted_at: new Date(),
      photos_json: photos,
      comment: comment || null,
      meta_json: meta,
    });

    // Update request status to SUBMITTED
    await request.update({ status: "SUBMITTED" });

    // Phase 3: Optional AI verification (placeholder for now)
    // const aiResult = await inspectionService.performAIVerification(
    //   req.files.map(f => f.path),
    //   guardId,
    //   request.challenge_code,
    //   req.app.locals.models
    // );
    // await submission.update({
    //   ai_verdict: aiResult.verdict,
    //   ai_confidence: aiResult.confidence,
    //   ai_notes: aiResult.notes,
    // });

    // Emit real-time events
    const io = req.app.get("io");
    if (io) {
      io.to(`admins:${tenantId}`).emit("inspection:submitted", {
        id: submission.id,
        request_id: request.id,
        guard_id: guardId,
        tenant_id: tenantId,
        submitted_at: submission.submitted_at,
        hasDuplicates: duplicateCheck.hasDuplicate,
      });

      io.to("super_admin").emit("inspection:submitted", {
        id: submission.id,
        request_id: request.id,
        guard_id: guardId,
        tenant_id: tenantId,
        submitted_at: submission.submitted_at,
        hasDuplicates: duplicateCheck.hasDuplicate,
      });
    }

    return res.json({
      ok: true,
      submission,
      duplicateWarning: duplicateCheck.hasDuplicate
        ? duplicateCheck.message
        : null,
    });
  } catch (e) {
    console.error("❌ Error submitting inspection:", e);
    return res.status(500).json({ message: e.message });
  }
});

module.exports = router;
