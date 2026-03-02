module.exports = function requirePayrollMode(allowedModes = [], opts = {}) {
  const actor = opts.actor || "admin"; // "admin" | "guard"

  return async function (req, res, next) {
    try {
      let tenantId = null;

      if (actor === "admin") {
        const role = req.admin?.role || req.user?.role;
        const isSuperAdmin = role === "super_admin";

        if (isSuperAdmin) {
          // ✅ Super admins can access any tenant via query/header
          tenantId =
            req.query?.tenantId ||
            req.headers["x-tenant-id"] ||
            req.admin?.tenant_id ||
            req.admin?.tenantId;
        } else {
          // ✅ Regular admins can ONLY access their own tenant (from JWT token)
          // Do NOT trust query/header for regular admins - security restriction
          tenantId = req.admin?.tenant_id || req.admin?.tenantId || req.user?.tenant_id || req.user?.tenantId;
        }
      }

      if (actor === "guard") {
        // ✅ SECURITY: Do NOT trust query/header for guards - only use authenticated guard's tenant
        // Note: guardAuth sets req.user (not req.guard) with tenant_id
        tenantId = req.user?.tenant_id || req.user?.tenantId;
      }

      if (!tenantId) {
        return res.status(400).json({ message: "Missing tenantId" });
      }

      const { Tenant } = req.app.locals.models;
      const tenant = await Tenant.findByPk(tenantId);

      if (!tenant) return res.status(404).json({ message: "Tenant not found" });

      const mode = tenant.payroll_mode;

      if (!allowedModes.includes(mode)) {
        return res.status(403).json({
          message: `Payroll mode '${mode}' does not allow this action`,
          payroll_mode: mode,
          allowed: allowedModes,
        });
      }

      req.tenant = tenant;
      next();
    } catch (e) {
      return res.status(500).json({ message: e.message });
    }
  };
};
