/**
 * Middleware to require a specific permission
 *
 * - super_admin: full bypass (platform).
 * - admin with NO tenant_id: bypass (legacy / single-tenant bootstrap).
 * - admin with tenant_id: must have the permission (tenant org admin — provisioned by super_admin).
 * - supervisor / other roles: must have the permission.
 *
 * Tenant isolation (only seeing own org) is enforced separately in controllers via tenant_id.
 */
function requireAccess(permission) {
  return (req, res, next) => {
    const role = String(req.admin?.role || "").toLowerCase();
    if (role === "super_admin") return next();

    const hasTenant = req.admin?.tenant_id != null && String(req.admin.tenant_id).trim() !== "";
    if (role === "admin" && !hasTenant) return next();

    const perms = Array.isArray(req.admin?.permissions) ? req.admin.permissions : [];

    if (!perms.includes(permission)) {
      return res.status(403).json({ message: "Forbidden" });
    }

    next();
  };
}

module.exports = { requireAccess };
