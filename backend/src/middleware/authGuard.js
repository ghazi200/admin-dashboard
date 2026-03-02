const jwt = require("jsonwebtoken");
const { Op } = require("sequelize");

/**
 * Guard Authentication Middleware
 *
 * Verifies JWT tokens for guards (from guard-ui or abe-guard-ai).
 * Token should contain: { guardId, tenant_id, role: "guard" } and optionally email.
 *
 * Resolves the guard from the SAME database (abe_guard) via req.app.locals.models.
 * No second database is used: we only look up Guard by id or email in the existing
 * Sequelize models so messaging participant_id matches the conversation we created.
 */
module.exports = function authGuard(req, res, next) {
  const hdr = req.headers.authorization || "";
  if (!hdr.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Missing Authorization header" });
  }

  const token = hdr.replace("Bearer ", "");
  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch (e) {
    return res.status(401).json({ message: "Invalid or expired token" });
  }

  const guardIdFromToken = decoded.guardId ?? decoded.id;
  if (!guardIdFromToken) {
    return res.status(401).json({ message: "Invalid guard token (missing guardId)" });
  }

  const role = String(decoded.role || "").toLowerCase();

  // Resolve guard from admin-dashboard DB so messaging participant_id matches
  (async () => {
    try {
      const { Guard } = req.app.locals.models || {};
      if (!Guard) {
        req.guard = {
          id: guardIdFromToken,
          role: role || "guard",
          tenant_id: decoded.tenant_id || null,
        };
        return setAdminAndNext();
      }

      let guard = await Guard.findByPk(guardIdFromToken, {
        attributes: ["id", "tenant_id"],
      });
      if (!guard && decoded.email) {
        const email = String(decoded.email).trim().toLowerCase();
        if (email) {
          guard = await Guard.findOne({
            where: { email: { [Op.iLike]: email } },
            attributes: ["id", "tenant_id"],
          });
        }
      }
      if (guard) {
        req.guard = {
          id: guard.id,
          role: role || "guard",
          tenant_id: guard.tenant_id || null,
        };
      } else {
        req.guard = {
          id: guardIdFromToken,
          role: role || "guard",
          tenant_id: decoded.tenant_id || null,
        };
      }

      function setAdminAndNext() {
        if (decoded.adminId || (role && (role === "admin" || role === "super_admin"))) {
          req.admin = {
            id: decoded.adminId || decoded.id,
            role: role,
            permissions: Array.isArray(decoded.permissions) ? decoded.permissions : [],
            tenant_id: decoded.tenant_id || null,
          };
        }
        return next();
      }
      return setAdminAndNext();
    } catch (err) {
      console.error("authGuard resolve guard:", err?.message || err);
      req.guard = {
        id: guardIdFromToken,
        role: role || "guard",
        tenant_id: decoded.tenant_id || null,
      };
      if (decoded.adminId || (role && (role === "admin" || role === "super_admin"))) {
        req.admin = {
          id: decoded.adminId || decoded.id,
          role: role,
          permissions: Array.isArray(decoded.permissions) ? decoded.permissions : [],
          tenant_id: decoded.tenant_id || null,
        };
      }
      return next();
    }
  })();
};
