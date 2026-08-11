/**
 * Admin incidents API on the unified admin-dashboard backend
 * (same DB as SOS-created incidents).
 */
const express = require("express");
const router = express.Router();
const authAdmin = require("../middleware/authAdmin");
const { requireAccess } = require("../middleware/requireAccess");
const { Op } = require("sequelize");

router.get(
  "/",
  authAdmin,
  requireAccess("dashboard:read"),
  async (req, res) => {
    try {
      const { Incident, Guard, sequelize } = req.app.locals.models || {};
      if (!Incident && !sequelize) {
        return res.status(503).json({ message: "Models not ready" });
      }

      const role = String(req.admin?.role || "").toLowerCase();
      const isSuper = role === "super_admin";
      let tenantId = null;
      if (isSuper) {
        tenantId = req.query.tenantId || req.query.tenant_id || null;
      } else {
        tenantId = req.admin?.tenant_id || null;
        if (!tenantId) {
          return res.status(400).json({
            message: "Missing tenantId. Tenant admin must be assigned to a tenant.",
          });
        }
      }

      const status = req.query.status ? String(req.query.status).trim().toUpperCase() : null;
      const severity = req.query.severity
        ? String(req.query.severity).trim().toUpperCase()
        : null;
      const type = req.query.type ? String(req.query.type).trim().toUpperCase() : null;
      const limit = Math.min(Number(req.query.limit || 50), 200);

      if (Incident) {
        const where = {};
        if (tenantId) where.tenantId = tenantId;
        if (status) where.status = status;
        if (severity) where.severity = severity;
        if (type) where.type = type;

        const rows = await Incident.findAll({
          where,
          order: [
            [sequelize.literal("COALESCE(reported_at, created_at)"), "DESC"],
          ],
          limit,
        });

        let guardsById = {};
        let sitesById = {};
        if (Guard) {
          const ids = [...new Set(rows.map((r) => r.guardId).filter(Boolean))];
          if (ids.length) {
            const guards = await Guard.findAll({
              where: { id: { [Op.in]: ids } },
              attributes: ["id", "name", "email"],
            });
            guardsById = Object.fromEntries(guards.map((g) => [g.id, g]));
          }
        }
        const { Site } = req.app.locals.models || {};
        if (Site) {
          const siteIds = [...new Set(rows.map((r) => r.siteId || r.site_id).filter(Boolean))];
          if (siteIds.length) {
            const sites = await Site.findAll({
              where: { id: { [Op.in]: siteIds } },
              attributes: ["id", "name", "address_1", "city"],
            });
            sitesById = Object.fromEntries(sites.map((s) => [s.id, s]));
          }
        }

        const out = rows.map((r) => {
          const j = typeof r.toJSON === "function" ? r.toJSON() : r;
          const g = guardsById[j.guardId || j.guard_id];
          const siteId = j.siteId || j.site_id;
          const site = siteId ? sitesById[siteId] : null;
          const siteAddress =
            site &&
            [site.address_1, site.city].filter(Boolean).join(", ");
          return {
            ...j,
            guard_id: j.guardId || j.guard_id,
            site_id: siteId || null,
            tenant_id: j.tenantId || j.tenant_id,
            ai_summary: j.aiSummary || j.ai_summary,
            ai_tags_json: j.aiTagsJson || j.ai_tags_json,
            location_text: j.locationText || j.location_text || siteAddress || null,
            reported_at: j.reportedAt || j.reported_at,
            occurred_at: j.occurredAt || j.occurred_at,
            guard_name: g?.name || g?.email || null,
            site: site
              ? {
                  id: site.id,
                  name: site.name,
                  address_1: site.address_1,
                  city: site.city,
                }
              : null,
          };
        });
        return res.json(out);
      }

      // Raw SQL fallback
      const params = [];
      const clauses = [];
      if (tenantId) {
        params.push(tenantId);
        clauses.push(`tenant_id = $${params.length}`);
      }
      if (status) {
        params.push(status);
        clauses.push(`status = $${params.length}`);
      }
      if (severity) {
        params.push(severity);
        clauses.push(`severity = $${params.length}`);
      }
      if (type) {
        params.push(type);
        clauses.push(`type = $${params.length}`);
      }
      params.push(limit);
      const whereSql = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
      const [rows] = await sequelize.query(
        `
        SELECT i.*, g.name AS guard_name, g.email AS guard_email
        FROM incidents i
        LEFT JOIN guards g ON g.id::text = i.guard_id::text
        ${whereSql}
        ORDER BY COALESCE(i.reported_at, i.created_at) DESC
        LIMIT $${params.length}
        `,
        { bind: params }
      );
      return res.json(rows || []);
    } catch (e) {
      console.error("listIncidents error:", e);
      return res.status(500).json({ message: e.message || "Failed to list incidents" });
    }
  }
);

router.patch(
  "/:id",
  authAdmin,
  requireAccess("dashboard:write"),
  async (req, res) => {
    try {
      const { Incident } = req.app.locals.models || {};
      if (!Incident) return res.status(503).json({ message: "Incident model not ready" });

      const id = req.params.id;
      const incident = await Incident.findByPk(id);
      if (!incident) return res.status(404).json({ message: "Incident not found" });

      const role = String(req.admin?.role || "").toLowerCase();
      if (role !== "super_admin") {
        const tid = req.admin?.tenant_id;
        if (tid && String(incident.tenantId) !== String(tid)) {
          return res.status(403).json({ message: "Forbidden" });
        }
      }

      const { status, ai_summary, aiSummary, severity } = req.body || {};
      if (status != null) incident.status = String(status).toUpperCase();
      if (ai_summary != null || aiSummary != null) {
        incident.aiSummary = ai_summary ?? aiSummary;
      }
      if (severity != null) incident.severity = String(severity).toUpperCase();
      await incident.save();
      return res.json(incident);
    } catch (e) {
      return res.status(500).json({ message: e.message || "Update failed" });
    }
  }
);

module.exports = router;
