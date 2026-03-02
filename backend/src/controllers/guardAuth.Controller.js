const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_DURATION_MS = 15 * 60 * 1000; // 15 minutes

/**
 * POST /api/guard/login
 * Body: { email, password }
 * Returns: { token, guard: { id, email, name } } or 423 if locked, 401 if invalid.
 */
exports.login = async (req, res) => {
  try {
    const { Guard } = req.app.locals.models;
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");

    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required" });
    }

    const guard = await Guard.findOne({
      where: { email },
      attributes: ["id", "email", "name", "password_hash", "tenant_id", "failed_login_attempts", "locked_until"],
    });

    if (!guard) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    const now = new Date();
    const lockedUntil = guard.locked_until ? new Date(guard.locked_until) : null;
    if (lockedUntil && lockedUntil > now) {
      return res.status(423).json({
        message: "Account locked due to too many failed attempts. Contact an administrator to unlock.",
        locked_until: lockedUntil.toISOString(),
      });
    }

    const hash = guard.password_hash || guard.password;
    if (!hash) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    const ok = await bcrypt.compare(password, hash);
    if (!ok) {
      const attempts = (Number(guard.failed_login_attempts) || 0) + 1;
      const updates = { failed_login_attempts: attempts };
      if (attempts >= MAX_FAILED_ATTEMPTS) {
        updates.locked_until = new Date(now.getTime() + LOCK_DURATION_MS);
      }
      await Guard.update(updates, { where: { id: guard.id } });
      const remaining = Math.max(0, MAX_FAILED_ATTEMPTS - attempts);
      return res.status(401).json({
        message: remaining > 0
          ? `Invalid email or password. ${remaining} attempt(s) remaining before lock.`
          : "Invalid email or password. Account locked. Contact an administrator to unlock.",
      });
    }

    // Success: clear lock and failed attempts
    await Guard.update(
      { failed_login_attempts: 0, locked_until: null },
      { where: { id: guard.id } }
    );

    const secret = process.env.JWT_SECRET;
    if (!secret) {
      return res.status(500).json({ message: "Server misconfiguration" });
    }
    const token = jwt.sign(
      { guardId: guard.id, tenant_id: guard.tenant_id || null, role: "guard" },
      secret,
      { expiresIn: "12h" }
    );

    return res.json({
      token,
      guard: {
        id: guard.id,
        email: guard.email,
        name: guard.name,
        tenant_id: guard.tenant_id || null,
      },
    });
  } catch (e) {
    console.error("Guard login error:", e);
    return res.status(500).json({ message: "Login failed", error: e.message });
  }
};
