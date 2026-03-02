// backend/src/routes/auth.routes.js
const express = require("express");
const rateLimit = require("express-rate-limit");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { pool } = require("../config/db");
const { loginValidators, handleLoginValidation } = require("../middleware/validateLogin");

const router = express.Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.AUTH_RATE_LIMIT_MAX || "10", 10),
  message: { message: "Too many login attempts; try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * ✅ GUARD LOGIN (Guard UI)
 * POST /auth/login
 * Body: { email, password }
 *
 * Returns token with { guardId: <UUID> } so guardAuth + acceptShift works.
 */
router.post("/login", authLimiter, loginValidators, handleLoginValidation, async (req, res) => {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const password = String(req.body?.password || "");

    // ✅ Query GUARDS (not admins)
    const result = await pool.query("SELECT * FROM guards WHERE lower(email)=lower($1) LIMIT 1", [
      email,
    ]);

    const guard = result.rows[0];
    if (!guard) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    // ✅ Support either password_hash or password (depending on your schema)
    const hash = guard.password_hash || guard.password || "";
    if (!hash) {
      console.error(`❌ Guard ${guard.email} (${guard.id}) missing password_hash`);
      return res.status(401).json({ 
        message: "Account not configured for login. Please contact your administrator to set a password." 
      });
    }

    const valid = await bcrypt.compare(password, hash);
    if (!valid) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    // ✅ IMPORTANT: guardAuth expects guardId (UUID). Include email so admin-dashboard
    // can resolve this guard by email when guardId differs (e.g. different DB).
    const token = jwt.sign(
      {
        guardId: guard.id, // UUID
        email: guard.email || null,
        tenant_id: guard.tenant_id || null,
        role: "guard",
      },
      process.env.JWT_SECRET,
      { expiresIn: "12h" }
    );

    return res.json({
      token,
      user: {
        id: guard.id,
        guardId: guard.id,
        name: guard.name || guard.full_name || guard.fullName || null,
        email: guard.email,
        role: "guard",
      },
    });
  } catch (err) {
    console.error("GUARD LOGIN ERROR:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

/**
 * ✅ ADMIN LOGIN (optional, if you still need admin auth on port 4000)
 * POST /auth/admin/login
 */
router.post("/admin/login", authLimiter, loginValidators, handleLoginValidation, async (req, res) => {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const password = String(req.body?.password || "");

    const result = await pool.query("SELECT * FROM admins WHERE lower(email)=lower($1) LIMIT 1", [
      email,
    ]);

    const admin = result.rows[0];
    if (!admin) return res.status(401).json({ message: "Invalid credentials" });

    const valid = await bcrypt.compare(password, admin.password_hash);
    if (!valid) return res.status(401).json({ message: "Invalid credentials" });

    // ✅ Get role from database (defaults to 'admin' if not set)
    const role = admin.role || "admin";

    const token = jwt.sign(
      {
        adminId: admin.id,
        tenant_id: admin.tenant_id || null,
        role: role, // ✅ Use role from database (admin or super_admin)
      },
      process.env.JWT_SECRET,
      { expiresIn: "12h" }
    );

    return res.json({ token });
  } catch (err) {
    console.error("ADMIN LOGIN ERROR:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
