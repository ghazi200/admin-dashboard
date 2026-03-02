const jwt = require("jsonwebtoken");

module.exports = function adminAuth(req, res, next) {
  const hdr = req.headers.authorization || "";
  if (!hdr.startsWith("Bearer ")) {
    console.log("❌ auth middleware: Missing Authorization header");
    return res.status(401).json({ message: "Missing Authorization header" });
  }

  try {
    const token = hdr.replace("Bearer ", "");
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Accept either adminId OR id (covers older tokens too)
    const adminId = decoded.adminId ?? decoded.id;

    if (!adminId) {
      console.log("❌ auth middleware: Token missing adminId. Decoded:", decoded);
      return res.status(401).json({ message: "Invalid admin token (missing adminId)" });
    }

    req.admin = {
      id: adminId,
      role: decoded.role || "admin",
      permissions: decoded.permissions || [],
    };

    req.user = req.admin; // Also set as user for compatibility with requireRole
    req.user.tenant_id = decoded.tenant_id || null;

    console.log("✅ auth middleware: Authenticated admin:", adminId, "role:", decoded.role);
    return next();
  } catch (e) {
    // Only log non-expired errors to reduce noise (expired tokens are expected)
    if (!e.message.includes("expired")) {
      console.log("❌ auth middleware error:", e.message);
    } else {
      console.log("⚠️  auth middleware: JWT expired");
    }
    
    if (e.message.includes("secret")) {
      return res.status(401).json({ message: "Invalid token signature - JWT_SECRET mismatch" });
    }
    if (e.message.includes("expired")) {
      return res.status(401).json({ message: "JWT expired", error: "Token has expired. Please log in again." });
    }
    return res.status(401).json({ message: "Invalid or expired token", error: e.message });
  }
};
