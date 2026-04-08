/**
 * Middleware to require a specific permission
 *
 * - super_admin and admin: full bypass (same as historical behavior). Tenant isolation is
 *   enforced in controllers via tenant_id; org-level RBAC for admins can be layered later
 *   without breaking existing tenant admins who have an empty permissions array.
 * - supervisor / other roles: must have the permission in their array.
 */
function requireAccess(permission) {
  return (req, res, next) => {
    const role = String(req.admin?.role || "").toLowerCase();
    if (role === "super_admin" || role === "admin") return next();

    const perms = Array.isArray(req.admin?.permissions) ? req.admin.permissions : [];

    if (!perms.includes(permission)) {
      return res.status(403).json({ message: "Forbidden" });
    }

    next();
  };
}

module.exports = { requireAccess };
