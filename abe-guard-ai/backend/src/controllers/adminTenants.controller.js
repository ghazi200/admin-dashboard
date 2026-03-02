// backend/src/controllers/adminTenants.controller.js
const { Op } = require("sequelize");

/**
 * Supports TWO modes:
 * 1) If models.Tenant / models.Site exist -> use them
 * 2) Else fallback to distinct tenant_id / site_id from policy_documents
 */

exports.listTenants = async (req, res) => {
  try {
    const models = req.app.locals.models || {};
    const Tenant = models.Tenant;
    const PolicyDocument = models.PolicyDocument;

    // Mode 1: Tenant model exists
    if (Tenant) {
      const rows = await Tenant.findAll({ order: [["created_at", "DESC"]], limit: 200 });
      return res.json({
        ok: true,
        rows: rows.map((t) => ({
          id: t.id,
          name: t.name || t.company_name || t.title || String(t.id),
        })),
        source: "Tenant",
      });
    }

    // Mode 2: fallback to policy_documents
    if (!PolicyDocument) return res.json({ ok: true, rows: [], source: "none" });

    const docs = await PolicyDocument.findAll({
      attributes: ["tenant_id"],
      where: { tenant_id: { [Op.ne]: null } },
      group: ["tenant_id"],
      limit: 500,
    });

    const rows = docs
      .map((d) => d.tenant_id)
      .filter(Boolean)
      .map((id) => ({ id, name: id }));

    return res.json({ ok: true, rows, source: "policy_documents" });
  } catch (e) {
    console.error("listTenants error:", e);
    return res.status(500).json({ message: "Server error" });
  }
};

exports.listSites = async (req, res) => {
  try {
    const models = req.app.locals.models || {};
    const Site = models.Site;
    const PolicyDocument = models.PolicyDocument;
    const { tenantId } = req.query;

    // Mode 1: Site model exists
    if (Site) {
      const where = tenantId ? { tenant_id: tenantId } : {};
      const rows = await Site.findAll({ where, order: [["created_at", "DESC"]], limit: 500 });
      return res.json({
        ok: true,
        rows: rows.map((s) => ({
          id: s.id,
          tenant_id: s.tenant_id,
          name: s.name || s.title || String(s.id),
        })),
        source: "Site",
      });
    }

    // Mode 2: fallback to policy_documents
    if (!PolicyDocument) return res.json({ ok: true, rows: [], source: "none" });

    const where = {
      site_id: { [Op.ne]: null },
      ...(tenantId ? { tenant_id: tenantId } : {}),
    };

    const docs = await PolicyDocument.findAll({
      attributes: ["tenant_id", "site_id"],
      where,
      group: ["tenant_id", "site_id"],
      limit: 1000,
    });

    const rows = docs
      .map((d) => ({ id: d.site_id, tenant_id: d.tenant_id, name: d.site_id }))
      .filter((x) => x.id);

    return res.json({ ok: true, rows, source: "policy_documents" });
  } catch (e) {
    console.error("listSites error:", e);
    return res.status(500).json({ message: "Server error" });
  }
};
