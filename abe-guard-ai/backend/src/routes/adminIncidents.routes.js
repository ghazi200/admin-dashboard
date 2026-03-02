/**
 * Admin Incidents Routes
 * 
 * Routes for admins to list and update incidents.
 * Supports tenant admins (their tenant) and super admins (all tenants).
 */

const express = require("express");
const adminAuth = require("../middleware/auth"); // ✅ Use 'auth' not 'authAdmin'

const router = express.Router();

// ✅ Admin only routes (require authentication)
router.use(adminAuth);

/**
 * GET /api/admin/incidents?tenantId=...&status=OPEN&severity=HIGH&siteId=...&limit=50
 * Returns incidents for tenant (or all for super admin)
 */
router.get("/", async (req, res) => {
  try {
    const { Incident, Site } = req.app.locals.models;

    const isSuperAdmin = req.admin?.role === "super_admin";

    let tenantId;
    if (isSuperAdmin) {
      // Super admin can specify tenantId or see all
      tenantId = req.query?.tenantId || null;
    } else {
      // Tenant admin restricted to their tenant
      tenantId = req.admin?.tenant_id || req.user?.tenant_id;
      
      if (!tenantId) {
        return res.status(400).json({ 
          message: "Missing tenantId. Tenant admin must be assigned to a tenant." 
        });
      }
    }

    const { status, severity, type, siteId } = req.query;
    const limit = Math.min(Number(req.query.limit || 50), 200);

    const where = {};
    // Only filter by tenant if specified (super admin can see all)
    if (tenantId) {
      where.tenant_id = tenantId;
    }
    
    if (status) where.status = String(status).trim().toUpperCase();
    if (severity) where.severity = String(severity).trim().toUpperCase();
    if (type) where.type = String(type).trim().toUpperCase();
    if (siteId) where.site_id = siteId;  // ✅ Filter by site

    const incidents = await Incident.findAll({
      where,
      order: [["reported_at", "DESC"]],
      limit,
    });

    // ✅ Attach site info to incidents
    const siteIds = Array.from(new Set(incidents.map((i) => i.site_id).filter(Boolean)));
    let sitesById = {};
    
    if (siteIds.length) {
      const siteWhere = { id: siteIds };
      if (tenantId) siteWhere.tenant_id = tenantId; // Ensure tenant isolation for site query
      
      const sites = await Site.findAll({ where: siteWhere });
      sitesById = Object.fromEntries(sites.map((s) => [s.id, s]));
    }

    // ✅ Enrich incidents with site data
    const out = incidents.map((i) => {
      const site = i.site_id ? sitesById[i.site_id] : null;
      return {
        ...i.toJSON(),
        site: site
          ? {
              id: site.id,
              name: site.name,
              address_1: site.address_1,
              address_2: site.address_2,
              city: site.city,
              state: site.state,
              zip: site.zip,
              lat: site.lat ? parseFloat(site.lat) : null,
              lng: site.lng ? parseFloat(site.lng) : null,
            }
          : null,
      };
    });

    return res.json(out);
  } catch (e) {
    console.error("❌ Error listing incidents:", e);
    return res.status(500).json({ message: e.message });
  }
});

/**
 * POST /api/admin/incidents/:id/summarize
 * Generates AI summary, timeline, and risk category for an incident
 */
router.post("/:id/summarize", async (req, res) => {
  try {
    const { Incident, Site, Guard } = req.app.locals.models;
    const { generateIncidentAnalysis } = require("../services/incidentAI.service");

    const isSuperAdmin = req.admin?.role === "super_admin";

    // Build WHERE clause based on admin role
    const where = { id: req.params.id };
    
    if (!isSuperAdmin) {
      // Tenant admin: Can only summarize their tenant's incidents
      const tenantId = req.admin?.tenant_id || req.user?.tenant_id;
      
      if (!tenantId) {
        return res.status(400).json({ 
          message: "Missing tenantId. Tenant admin must be assigned to a tenant." 
        });
      }
      
      where.tenant_id = tenantId;
    }
    // Super admin: No tenant restriction (can summarize any incident)

    const incident = await Incident.findOne({ where });

    if (!incident) {
      return res.status(404).json({ message: "Incident not found" });
    }

    // Fetch related data for context
    let site = null;
    let guard = null;
    
    if (incident.site_id) {
      site = await Site.findOne({ where: { id: incident.site_id } });
    }
    
    if (incident.guard_id) {
      guard = await Guard.findOne({ where: { id: incident.guard_id } });
    }

    // Generate AI analysis
    const analysis = await generateIncidentAnalysis(incident, { site, guard });

    // Update incident with AI analysis
    const updateData = {
      ai_summary: analysis.summary,
      ai_tags_json: {
        timeline: analysis.timeline,
        riskCategory: analysis.riskCategory,
        riskLevel: analysis.riskLevel,
        urgency: analysis.urgency,
        recommendedActions: analysis.recommendedActions,
        generatedAt: new Date().toISOString(),
      },
    };

    await incident.update(updateData);

    // Emit update event
    const io = req.app.get("io");
    if (io) {
      // Emit to tenant room
      io.to(`admins:${incident.tenant_id}`).emit("incidents:updated", {
        id: incident.id,
        ai_summary: analysis.summary,
        ai_tags_json: updateData.ai_tags_json,
      });
      
      // Also emit to super_admin room
      io.to("super_admin").emit("incidents:updated", {
        id: incident.id,
        tenant_id: incident.tenant_id,
        ai_summary: analysis.summary,
        ai_tags_json: updateData.ai_tags_json,
      });
    }

    return res.json({
      ok: true,
      analysis: {
        summary: analysis.summary,
        timeline: analysis.timeline,
        riskCategory: analysis.riskCategory,
        riskLevel: analysis.riskLevel,
        urgency: analysis.urgency,
        recommendedActions: analysis.recommendedActions,
      },
      incident: incident.toJSON(),
    });
  } catch (e) {
    console.error("❌ Error generating AI summary:", e);
    return res.status(500).json({ message: e.message });
  }
});

/**
 * PATCH /api/admin/incidents/:id
 * body: { status?: "ACKNOWLEDGED"|"RESOLVED", ai_summary?: string }
 * Updates incident status or AI summary
 */
router.patch("/:id", async (req, res) => {
  try {
    const { Incident } = req.app.locals.models;

    const isSuperAdmin = req.admin?.role === "super_admin";

    // Build WHERE clause based on admin role
    const where = { id: req.params.id };
    
    if (!isSuperAdmin) {
      // Tenant admin: Can only update their tenant's incidents
      const tenantId = req.admin?.tenant_id || req.user?.tenant_id;
      
      if (!tenantId) {
        return res.status(400).json({ 
          message: "Missing tenantId. Tenant admin must be assigned to a tenant." 
        });
      }
      
      where.tenant_id = tenantId;
    }
    // Super admin: No tenant restriction (can update any incident)

    const incident = await Incident.findOne({ where });

    if (!incident) {
      return res.status(404).json({ message: "Incident not found" });
    }

    const patch = {};
    if (req.body.status) patch.status = String(req.body.status).trim().toUpperCase();
    if (typeof req.body.ai_summary === "string") patch.ai_summary = req.body.ai_summary;

    await incident.update(patch);

    // Emit update event
    const io = req.app.get("io");
    if (io) {
      // Emit to tenant room
      io.to(`admins:${incident.tenant_id}`).emit("incidents:updated", {
        id: incident.id,
        ...patch
      });
      
      // Also emit to super_admin room
      io.to("super_admin").emit("incidents:updated", {
        id: incident.id,
        tenant_id: incident.tenant_id,
        ...patch
      });
    }

    return res.json({ ok: true, incident });
  } catch (e) {
    console.error("❌ Error updating incident:", e);
    return res.status(500).json({ message: e.message });
  }
});

module.exports = router;
