/**
 * Guard Incidents Routes
 * 
 * Routes for guards to create incident reports.
 * Requires authentication and validates tenant isolation.
 */

const express = require("express");
const multer = require("multer");
const path = require("path");
const guardAuth = require("../middleware/guardAuth"); // ✅ Use 'guardAuth' not 'authGuard'
const { INCIDENT_UPLOAD_ROOT, ensureIncidentUploadDir, MAX_UPLOAD_BYTES } = require("../config/incidentUploads");

// Ensure upload directory exists
ensureIncidentUploadDir();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, INCIDENT_UPLOAD_ROOT),
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
 * POST /api/guard/incidents (or /incidents for guard UI)
 * multipart/form-data:
 *  - type, severity, description, location_text?, occurred_at?, shift_id?, site_id?
 *  - files[] (optional, max 5 files)
 */
router.post("/", upload.array("files", 5), async (req, res) => {
  try {
    const { Incident, Site, Shift } = req.app.locals.models;

    // ✅ Guard's tenant_id from auth middleware (req.user, not req.guard)
    const tenantId = req.user?.tenant_id;
    
    if (!tenantId) {
      return res.status(400).json({ 
        message: "Guard missing tenant_id. Guard must be assigned to a tenant." 
      });
    }

    const guardId = req.user?.guardId || req.user?.id;
    
    if (!guardId) {
      return res.status(401).json({ message: "Guard ID not found in token" });
    }

    const {
      type,
      severity,
      description,
      location_text = null,
      occurred_at = null,
      shift_id = null,
      site_id = null,
    } = req.body;

    if (!type || !severity || !description) {
      return res.status(400).json({ 
        message: "Missing required fields: type, severity, description" 
      });
    }

    // ✅ Validate site_id belongs to guard's tenant
    let finalSiteId = site_id || null;
    if (site_id) {
      const site = await Site.findOne({ 
        where: { 
          id: site_id, 
          tenant_id: tenantId,  // ✅ Prevents cross-tenant access
          is_active: true 
        } 
      });
      
      if (!site) {
        return res.status(400).json({ 
          message: "Invalid site_id. Site must belong to your tenant and be active." 
        });
      }
      
      finalSiteId = site_id;
    }

    // ✅ Auto-select site from shift if shift_id provided and shift has site_id
    if (!finalSiteId && shift_id) {
      const shift = await Shift.findByPk(shift_id);
      if (shift && shift.site_id && shift.tenant_id === tenantId) {
        finalSiteId = shift.site_id;
      }
    }

    // Process uploaded files
    const attachments = (req.files || []).map((f) => ({
      file_name: f.originalname,
      mime: f.mimetype,
      size: f.size,
      url: `/uploads/incidents/${f.filename}`,
      uploaded_at: new Date().toISOString(),
    }));

    // Create incident
    const incident = await Incident.create({
      tenant_id: tenantId,  // ✅ Enforced from guard's auth token
      guard_id: guardId,
      shift_id: shift_id || null,
      site_id: finalSiteId,
      type: String(type).trim().toUpperCase(),
      severity: String(severity).trim().toUpperCase(),
      status: "OPEN",
      occurred_at: occurred_at ? new Date(occurred_at) : new Date(),
      reported_at: new Date(),
      location_text, // Keep for backward compatibility
      description,
      attachments_json: attachments.length ? attachments : null,
    });

    // 🔔 Real-time: Emit to BOTH tenant room AND super_admin room
    const io = req.app.get("io");
    if (io) {
      const incidentPayload = {
        id: incident.id,
        tenant_id: tenantId,
        guard_id: incident.guard_id,
        shift_id: incident.shift_id,
        site_id: incident.site_id,
        type: incident.type,
        severity: incident.severity,
        status: incident.status,
        reported_at: incident.reported_at,
        location_text: incident.location_text,
        description: incident.description,
      };
      
      // Emit to tenant-specific admin room (tenant admins see it)
      io.to(`admins:${tenantId}`).emit("incidents:new", incidentPayload);
      
      // ALSO emit to super_admin room (super admin sees all incidents)
      io.to("super_admin").emit("incidents:new", incidentPayload);
    }

    return res.json({ ok: true, incident });
  } catch (e) {
    console.error("❌ Error creating incident:", e);
    return res.status(500).json({ message: e.message });
  }
});

module.exports = router;
