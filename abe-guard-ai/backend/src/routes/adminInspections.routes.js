/**
 * Admin Inspections Routes
 * 
 * Routes for admins to create, list, and approve/reject inspection requests.
 * Supports tenant admins (their tenant) and super admins (all tenants).
 */

const express = require("express");
const { Op } = require("sequelize");
const adminAuth = require("../middleware/auth");
const inspectionService = require("../services/inspection.service");

const router = express.Router();

// ✅ Admin only routes (require authentication)
router.use(adminAuth);

/**
 * POST /api/admin/inspections/requests
 * body: {
 *   site_id, shift_id?, guard_id?, instructions?,
 *   required_items: { selfie?, badge?, signage? },
 *   due_minutes: 10 (default)
 * }
 * Creates a new inspection request
 */
router.post("/requests", async (req, res) => {
  try {
    const { InspectionRequest, Site, Shift, Guard, TimeEntry } = req.app.locals.models;

    const isSuperAdmin = req.admin?.role === "super_admin";
    const tenantId = req.admin?.tenant_id || req.user?.tenant_id;

    if (!isSuperAdmin && !tenantId) {
      return res.status(400).json({
        message: "Missing tenantId. Tenant admin must be assigned to a tenant.",
      });
    }

    const {
      site_id,
      shift_id = null,
      guard_id = null, // null = broadcast to all guards on site
      instructions = null,
      required_items = {},
      due_minutes = 10,
    } = req.body;

    // Validate site_id
    if (!site_id) {
      return res.status(400).json({ message: "Missing required field: site_id" });
    }

    const siteWhere = { id: site_id, is_active: true };
    if (!isSuperAdmin) {
      siteWhere.tenant_id = tenantId;
    }

    const site = await Site.findOne({ where: siteWhere });
    if (!site) {
      return res.status(400).json({
        message: "Invalid site_id. Site must belong to your tenant and be active.",
      });
    }

    // Validate shift_id if provided
    if (shift_id) {
      const shiftWhere = { id: shift_id };
      if (!isSuperAdmin) {
        shiftWhere.tenant_id = tenantId;
      }
      const shift = await Shift.findOne({ where: shiftWhere });
      if (!shift) {
        return res.status(400).json({ message: "Invalid shift_id" });
      }
    }

    // Validate guard_id if provided
    if (guard_id) {
      const guardWhere = { id: guard_id };
      if (!isSuperAdmin) {
        guardWhere.tenant_id = tenantId;
      }
      const guard = await Guard.findOne({ where: guardWhere });
      if (!guard) {
        return res.status(400).json({ message: "Invalid guard_id" });
      }
    }

    // Generate unique challenge code
    let challengeCode;
    let attempts = 0;
    do {
      challengeCode = inspectionService.generateChallengeCode();
      const existing = await InspectionRequest.findOne({
        where: { challenge_code: challengeCode },
      });
      if (!existing) break;
      attempts++;
      if (attempts > 10) {
        return res.status(500).json({ message: "Failed to generate unique challenge code" });
      }
    } while (true);

    // Calculate due_at
    const dueAt = new Date();
    dueAt.setMinutes(dueAt.getMinutes() + parseInt(due_minutes, 10));

    // Determine target guards
    let targetGuardIds = [];
    if (guard_id) {
      // Single guard request
      targetGuardIds = [guard_id];
    } else if (shift_id) {
      // All guards on the shift (if any are clocked in)
      const timeEntries = await TimeEntry.findAll({
        where: {
          shift_id: shift_id,
          clock_in_at: { [Op.ne]: null },
          clock_out_at: null,
        },
        attributes: ["guard_id"],
      });
      targetGuardIds = [...new Set(timeEntries.map((te) => te.guard_id))];
    } else {
      // All guards currently clocked in at the site
      // Find active shifts at this site, then find clocked-in guards
      const activeShifts = await Shift.findAll({
        where: {
          site_id: site_id,
          status: "OPEN",
        },
        attributes: ["id"],
      });

      if (activeShifts.length > 0) {
        const shiftIds = activeShifts.map((s) => s.id);
        const timeEntries = await TimeEntry.findAll({
          where: {
            shift_id: { [Op.in]: shiftIds },
            clock_in_at: { [Op.ne]: null },
            clock_out_at: null,
          },
          attributes: ["guard_id"],
        });
        targetGuardIds = [...new Set(timeEntries.map((te) => te.guard_id))];
      }
    }

    if (targetGuardIds.length === 0) {
      return res.status(400).json({
        message: "No guards found. Ensure guards are clocked in at the site/shift.",
      });
    }

    // Create inspection requests (one per guard if broadcast)
    const requests = [];

    for (const targetGuardId of targetGuardIds) {
      const request = await InspectionRequest.create({
        tenant_id: tenantId,
        site_id: site_id,
        shift_id: shift_id,
        guard_id: targetGuardId,
        requested_by_admin_id: req.admin.id,
        challenge_code: challengeCode, // Same code for all guards in broadcast
        instructions,
        required_items_json: required_items || {},
        due_at: dueAt,
        status: "PENDING",
      });

      requests.push(request);
    }

    // Emit real-time events to guards
    const io = req.app.get("io");
    if (io) {
      for (const request of requests) {
        io.to(`guard:${request.guard_id}`).emit("inspection:request", {
          id: request.id,
          tenant_id: request.tenant_id,
          site_id: request.site_id,
          shift_id: request.shift_id,
          challenge_code: request.challenge_code,
          instructions: request.instructions,
          required_items: request.required_items_json,
          due_at: request.due_at,
          status: request.status,
        });
      }

      // Also emit to admin rooms
      io.to(`admins:${tenantId}`).emit("inspection:request:created", {
        count: requests.length,
        site_id,
        challenge_code: challengeCode,
      });
      if (isSuperAdmin) {
        io.to("super_admin").emit("inspection:request:created", {
          count: requests.length,
          tenant_id: tenantId,
          site_id,
          challenge_code: challengeCode,
        });
      }
    }

    return res.json({
      ok: true,
      requests: requests.length === 1 ? requests[0] : requests,
      count: requests.length,
      challenge_code: challengeCode,
    });
  } catch (e) {
    console.error("❌ Error creating inspection request:", e);
    return res.status(500).json({ message: e.message });
  }
});

/**
 * GET /api/admin/inspections/requests?tenantId=...&status=PENDING&siteId=...&limit=50
 * Returns inspection requests for tenant (or all for super admin)
 */
router.get("/requests", async (req, res) => {
  try {
    const { InspectionRequest, InspectionSubmission, Site, Guard, Admin } =
      req.app.locals.models;

    const isSuperAdmin = req.admin?.role === "super_admin";

    let tenantId;
    if (isSuperAdmin) {
      tenantId = req.query?.tenantId || null;
    } else {
      tenantId = req.admin?.tenant_id || req.user?.tenant_id;
      if (!tenantId) {
        return res.status(400).json({
          message: "Missing tenantId. Tenant admin must be assigned to a tenant.",
        });
      }
    }

    const { status, siteId, guardId } = req.query;
    const limit = Math.min(Number(req.query.limit || 50), 200);

    const where = {};
    if (tenantId) where.tenant_id = tenantId;
    if (status) where.status = String(status).trim().toUpperCase();
    if (siteId) where.site_id = siteId;
    if (guardId) where.guard_id = guardId;

    const requests = await InspectionRequest.findAll({
      where,
      include: [
        { model: Site, attributes: ["id", "name"] },
        { model: Guard, attributes: ["id", "name", "email"] },
        { model: Admin, as: "requestedBy", attributes: ["id", "name", "email"] },
      ],
      order: [["created_at", "DESC"]],
      limit,
    });

    // Attach submission info
    const requestIds = requests.map((r) => r.id);
    const submissions = await InspectionSubmission.findAll({
      where: { request_id: { [Op.in]: requestIds } },
      order: [["submitted_at", "DESC"]],
    });

    const submissionsByRequestId = {};
    submissions.forEach((sub) => {
      if (!submissionsByRequestId[sub.request_id]) {
        submissionsByRequestId[sub.request_id] = [];
      }
      submissionsByRequestId[sub.request_id].push(sub);
    });

    const out = requests.map((req) => ({
      ...req.toJSON(),
      submissions: submissionsByRequestId[req.id] || [],
    }));

    return res.json(out);
  } catch (e) {
    console.error("❌ Error listing inspection requests:", e);
    return res.status(500).json({ message: e.message });
  }
});

/**
 * PATCH /api/admin/inspections/requests/:id
 * body: { status: "APPROVED" | "REJECTED" }
 * Updates inspection request status
 */
router.patch("/requests/:id", async (req, res) => {
  try {
    const { InspectionRequest } = req.app.locals.models;

    const isSuperAdmin = req.admin?.role === "super_admin";

    const where = { id: req.params.id };
    if (!isSuperAdmin) {
      const tenantId = req.admin?.tenant_id || req.user?.tenant_id;
      if (!tenantId) {
        return res.status(400).json({
          message: "Missing tenantId. Tenant admin must be assigned to a tenant.",
        });
      }
      where.tenant_id = tenantId;
    }

    const request = await InspectionRequest.findOne({ where });

    if (!request) {
      return res.status(404).json({ message: "Inspection request not found" });
    }

    const { status } = req.body;
    if (!status || !["APPROVED", "REJECTED"].includes(status.toUpperCase())) {
      return res.status(400).json({
        message: "Invalid status. Must be 'APPROVED' or 'REJECTED'",
      });
    }

    await request.update({ status: status.toUpperCase() });

    // Emit status change event
    const io = req.app.get("io");
    if (io) {
      io.to(`guard:${request.guard_id}`).emit("inspection:status_changed", {
        id: request.id,
        status: request.status,
      });

      io.to(`admins:${request.tenant_id}`).emit("inspection:status_changed", {
        id: request.id,
        status: request.status,
      });

      if (isSuperAdmin) {
        io.to("super_admin").emit("inspection:status_changed", {
          id: request.id,
          tenant_id: request.tenant_id,
          status: request.status,
        });
      }
    }

    return res.json({ ok: true, request });
  } catch (e) {
    console.error("❌ Error updating inspection request:", e);
    return res.status(500).json({ message: e.message });
  }
});

module.exports = router;
