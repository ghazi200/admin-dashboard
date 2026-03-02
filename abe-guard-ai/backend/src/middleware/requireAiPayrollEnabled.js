module.exports = async function requireAiPayrollEnabled(req, res, next) {
  try {
    // ✅ Get tenantId from authenticated user (JWT token) or query/header for super_admin
    const role = req.admin?.role || req.user?.role;
    const isSuperAdmin = role === "super_admin";

    let tenantId;
    if (isSuperAdmin) {
      // Super admin can access any tenant via query/header
      tenantId =
        req.query?.tenantId ||
        req.headers["x-tenant-id"] ||
        req.admin?.tenant_id ||
        req.admin?.tenantId ||
        req.user?.tenant_id ||
        req.user?.tenantId;
    } else {
      // Regular admin/guard: only use tenant from JWT token (security)
      tenantId =
        req.admin?.tenant_id ||
        req.admin?.tenantId ||
        req.user?.tenant_id ||
        req.user?.tenantId;
    }

    if (!tenantId) return res.status(400).json({ message: "Missing tenantId" });

    const { Tenant } = req.app.locals.models;
    const tenant = await Tenant.findByPk(tenantId);
    if (!tenant) return res.status(404).json({ message: "Tenant not found" });

    if (!tenant.ai_payroll_enabled) {
      return res.status(403).json({ message: "AI payroll assistant is disabled for this tenant" });
    }

    req.tenant = tenant; // keep consistent
    next();
  } catch (e) {
    return res.status(500).json({ message: e.message });
  }
};
