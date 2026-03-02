// backend/src/middleware/guardAuth.js
const jwt = require("jsonwebtoken");

module.exports = function guardAuth(req, res, next) {
  const hdr = req.headers.authorization || "";
  if (!hdr.startsWith("Bearer ")) {
    console.log("❌ guardAuth: Missing Authorization header");
    return res.status(401).json({ message: "Missing Authorization header" });
  }

  try {
    const token = hdr.replace("Bearer ", "");
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Accept either guardId OR id (covers older tokens too)
    const guardId = decoded.guardId ?? decoded.id;

    if (!guardId) {
      console.log("❌ guardAuth: Token missing guardId. Decoded:", decoded);
      return res.status(401).json({ message: "Invalid guard token (missing guardId)" });
    }

    req.user = {
      id: guardId, // Also set as id for compatibility
      guardId,
      tenant_id: decoded.tenant_id || null, // Include tenant_id from JWT
      role: decoded.role || "guard",
      permissions: decoded.permissions || [],
    };

    console.log("✅ guardAuth: Authenticated guard:", guardId);
    return next();
  } catch (e) {
    // Only log non-expired errors to reduce noise (expired tokens are expected)
    if (!e.message.includes("expired")) {
      console.log("❌ guardAuth error:", e.message);
    } else {
      console.log("⚠️  guardAuth: JWT expired");
    }
    
    if (e.message.includes("expired")) {
      return res.status(401).json({ message: "JWT expired", error: "Token has expired. Please log in again." });
    }
    return res.status(401).json({ message: "Invalid or expired token", error: e.message });
  }
};
