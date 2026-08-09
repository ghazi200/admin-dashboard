/**
 * GET /api/admin/audit — list audit events
 * GET /api/admin/audit/export — CSV download
 */
const { Op } = require("sequelize");
const { getTenantFilter } = require("../utils/tenantFilter");
const { rowsToCsv } = require("../services/auditEvent.service");

function parseDateBound(v, endOfDay) {
  if (!v) return null;
  const s = String(v).trim();
  if (!s) return null;
  const d = new Date(s.length <= 10 ? `${s}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z` : s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function buildWhere(admin, query) {
  const where = {};
  const tenantId = getTenantFilter(admin);
  if (tenantId) where.tenant_id = tenantId;

  const from = parseDateBound(query.from, false);
  const to = parseDateBound(query.to, true);
  if (from || to) {
    where.created_at = {};
    if (from) where.created_at[Op.gte] = from;
    if (to) where.created_at[Op.lte] = to;
  }

  if (query.action) where.action = String(query.action).trim();
  if (query.entityType) where.entity_type = String(query.entityType).trim();
  if (query.actorType) where.actor_type = String(query.actorType).trim();

  return where;
}

exports.listAuditEvents = async (req, res) => {
  try {
    const { AuditEvent } = req.app.locals.models || {};
    if (!AuditEvent) {
      return res.status(503).json({ message: "AuditEvent model not available" });
    }

    const limit = Math.min(500, Math.max(1, parseInt(req.query.limit || "100", 10) || 100));
    const where = buildWhere(req.admin, req.query);

    const rows = await AuditEvent.findAll({
      where,
      order: [["created_at", "DESC"]],
      limit,
    });

    return res.json({
      ok: true,
      count: rows.length,
      data: rows,
    });
  } catch (e) {
    console.error("listAuditEvents error:", e);
    return res.status(500).json({ message: "Failed to list audit events", error: e.message });
  }
};

exports.exportAuditEvents = async (req, res) => {
  try {
    const { AuditEvent } = req.app.locals.models || {};
    if (!AuditEvent) {
      return res.status(503).json({ message: "AuditEvent model not available" });
    }

    const where = buildWhere(req.admin, req.query);
    const limit = Math.min(10000, Math.max(1, parseInt(req.query.limit || "5000", 10) || 5000));

    const rows = await AuditEvent.findAll({
      where,
      order: [["created_at", "DESC"]],
      limit,
      raw: true,
    });

    const csv = rowsToCsv(rows);
    const from = String(req.query.from || "all");
    const to = String(req.query.to || "all");
    const filename = `audit-events-${from}-to-${to}.csv`.replace(/[^\w.\-]+/g, "_");

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    return res.status(200).send(csv);
  } catch (e) {
    console.error("exportAuditEvents error:", e);
    return res.status(500).json({ message: "Failed to export audit events", error: e.message });
  }
};
