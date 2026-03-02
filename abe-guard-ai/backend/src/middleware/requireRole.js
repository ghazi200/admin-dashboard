// backend/src/middleware/requireRole.js
module.exports = function requireRole(allowed = []) {
  return (req, res, next) => {
    const role = req.user?.role || req.admin?.role; // supports your existing patterns
    if (!role) return res.status(401).json({ message: "Unauthorized" });

    // ✅ Super admin has access to all roles (unless explicitly blocked)
    if (role === "super_admin" && !allowed.includes("super_admin")) {
      // Super admin can access admin routes, but we still check if explicitly allowed
      if (allowed.includes("admin")) {
        return next();
      }
    }

    if (!allowed.includes(role)) {
      return res.status(403).json({ message: "Forbidden" });
    }
    next();
  };
};
