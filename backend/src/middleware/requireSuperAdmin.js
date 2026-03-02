/**
 * Middleware: Require Super-Admin Role
 * 
 * Only allows access if the authenticated admin has role === "super_admin"
 */
module.exports = (req, res, next) => {
  if (!req.admin) {
    return res.status(401).json({ message: "Authentication required" });
  }

  if (req.admin.role !== "super_admin") {
    return res.status(403).json({
      message: "Super-admin access required",
      required: "super_admin",
      current: req.admin.role,
    });
  }

  next();
};
