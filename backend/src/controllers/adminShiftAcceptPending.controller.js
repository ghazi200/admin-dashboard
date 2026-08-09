/**
 * Admin override / list for pending shift accepts.
 */
const {
  listPendingAccepts,
  overridePendingAccept,
  finalizePendingAccepts,
  overrideWindowMinutes,
} = require("../services/shiftAcceptPending.service");
const { getTenantFilter } = require("../utils/tenantFilter");

function requireAdminOrSupervisor(req, res, next) {
  const role = String(req.admin?.role || "").toLowerCase();
  if (role === "super_admin" || role === "admin" || role === "supervisor") {
    return next();
  }
  return res.status(403).json({ message: "Admin or supervisor only" });
}

exports.requireAdminOrSupervisor = requireAdminOrSupervisor;

exports.listPendingAccepts = async (req, res) => {
  try {
    const sequelize = req.app.locals.models?.sequelize;
    // Super admin → null (all tenants); others → their tenant only
    const tenantId = getTenantFilter(req.admin);
    const rows = await listPendingAccepts(sequelize, { tenantId });
    return res.json({
      data: rows,
      windowMinutes: overrideWindowMinutes(),
    });
  } catch (e) {
    console.error("listPendingAccepts:", e);
    return res.status(500).json({ message: e.message || "Failed to list pending accepts" });
  }
};

exports.overridePendingAccept = async (req, res) => {
  try {
    const shiftId = String(req.params.shiftId || "").trim();
    const { action, guardId, reason } = req.body || {};
    const result = await overridePendingAccept(req.app, {
      shiftId,
      adminId: req.admin?.id || null,
      admin: req.admin || null,
      action: action || "reassign",
      guardId: guardId || null,
      reason: reason || null,
    });
    return res.json({ success: true, ...result });
  } catch (e) {
    const status = e.status || 500;
    return res.status(status).json({ message: e.message || "Override failed" });
  }
};

exports.finalizePendingAcceptsNow = async (req, res) => {
  try {
    const result = await finalizePendingAccepts(req.app, {
      shiftId: req.body?.shiftId || req.query?.shiftId || null,
      force: String(req.body?.force || req.query?.force || "") === "true",
    });
    return res.json({ ok: true, ...result });
  } catch (e) {
    return res.status(500).json({ message: e.message });
  }
};
