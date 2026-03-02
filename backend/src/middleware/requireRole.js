// src/middleware/requireRole.js
module.exports = (allowedRoles = []) => {
  return (req, res, next) => {
    if (!req.admin) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (!allowedRoles.includes(req.admin.role)) {
      return res.status(403).json({ message: "Forbidden: insufficient role" });
    }

    next();
  };
};
