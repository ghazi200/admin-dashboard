const jwt = require("jsonwebtoken");

module.exports = async function authAdmin(req, res, next) {
  const hdr = req.headers.authorization || "";
  if (!hdr.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Missing Authorization header" });
  }

  try {
    const token = hdr.replace("Bearer ", "");
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Accept either adminId OR id (covers older tokens too)
    const adminId = decoded.adminId ?? decoded.id;

    if (!adminId) {
      return res.status(401).json({ message: "Invalid admin token (missing adminId)" });
    }

    // Single session: reject if this token's version is older than DB (e.g. another device logged in or "log out other devices")
    const tokenVersion = typeof decoded.sessionTokenVersion === "number" ? decoded.sessionTokenVersion : 0;
    const { Admin } = req.app.locals.models || {};
    if (Admin) {
      const admin = await Admin.findByPk(adminId, { attributes: ["session_token_version"] });
      const dbVersion = admin ? (Number(admin.session_token_version) || 0) : 0;
      if (tokenVersion < dbVersion) {
        return res.status(401).json({ message: "Session invalidated (signed in elsewhere or other devices logged out)" });
      }
    }

    // If token doesn't include role, treat it as admin
    const role = String(decoded.role || "admin").toLowerCase();

    req.admin = {
      id: adminId,
      role,
      permissions: Array.isArray(decoded.permissions) ? decoded.permissions : [],
      tenant_id: decoded.tenant_id || null, // ✅ Multi-tenant: Extract tenant_id from JWT
    };

    return next();
  } catch (e) {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
};
