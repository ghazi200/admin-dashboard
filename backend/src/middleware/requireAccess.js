/**
 * Middleware to require a specific permission
 * 
 * ✅ ADMINS AND SUPER-ADMINS HAVE ALL PERMISSIONS BY DEFAULT
 * - Admins and Super-Admins bypass all permission checks
 * - Admins can grant permissions to others via the Users API
 * 
 * For non-admins:
 * - Permissions are checked against the user's permission array
 * - Returns 403 Forbidden if permission is missing
 */
function requireAccess(permission) {
  return (req, res, next) => {
    // ✅ ADMIN/SUPER-ADMIN BYPASS - Admins and Super-Admins have all permissions by default
    if (req.admin?.role === "admin" || req.admin?.role === "super_admin") return next();

    const perms = Array.isArray(req.admin?.permissions)
      ? req.admin.permissions
      : [];

    if (!perms.includes(permission)) {
      return res.status(403).json({ message: "Forbidden" });
    }

    next();
  };
}

module.exports = { requireAccess };
