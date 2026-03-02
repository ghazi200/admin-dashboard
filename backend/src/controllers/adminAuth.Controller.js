const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { validatePassword, getPolicyDescription } = require("../utils/passwordPolicy");
const { addToHistory, isPasswordReused } = require("../utils/passwordHistory");
const mfaService = require("../services/mfa.service");

/**
 * POST /api/admin/register
 * Body: { name, email, password, role? }
 */
exports.register = async (req, res) => {
  try {
    const { Admin } = req.app.locals.models;

    const name = (req.body.name || "Admin").trim();
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");

    // Optional: allow creating supervisors from register (you can lock this down later)
    const role = req.body.role && ["admin", "supervisor"].includes(req.body.role)
      ? req.body.role
      : "admin";

    // Baseline permissions for supervisors (admin bypasses permissions anyway)
    const permissions =
      role === "supervisor"
        ? ["dashboard:read", "guards:read", "shifts:read"]
        : [];

    if (!email || !email.includes("@")) {
      return res.status(400).json({ message: "Valid email is required" });
    }
    const pwdCheck = validatePassword(password);
    if (!pwdCheck.valid) {
      return res.status(400).json({ message: pwdCheck.message || "Password does not meet policy" });
    }

    const existing = await Admin.findOne({ where: { email } });
    if (existing) {
      return res.status(409).json({ message: "Email already registered" });
    }

    const hash = await bcrypt.hash(password, 10);

    // ✅ Multi-tenant: Accept tenant_id from request body (optional for migration period)
    const tenant_id = req.body.tenant_id || null;

    const admin = await Admin.create({
      name,
      email,
      password: hash,
      role,
      permissions,
      tenant_id, // ✅ Set tenant_id if provided
    });
    const sequelize = req.app.locals.models?.sequelize;
    if (sequelize) await addToHistory(sequelize, admin.id, hash);
    console.log("JWT_SECRET seen by auth controller:", process.env.JWT_SECRET);

    // ✅ Multi-tenant: Include tenant_id in JWT token
    const token = jwt.sign(
      { 
        adminId: admin.id, 
        role: admin.role, 
        permissions: admin.permissions || [],
        tenant_id: admin.tenant_id || null, // ✅ Include tenant_id for multi-tenant support
      },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    return res.json({
      token,
      admin: {
        id: admin.id,
        name: admin.name,
        email: admin.email,
        role: admin.role,
        permissions: admin.permissions || [],
      },
    });
  } catch (e) {
    return res.status(500).json({ message: "Register failed", error: e.message });
  }
};

/**
 * POST /api/admin/login
 * Body: { email, password }
 */
exports.login = async (req, res) => {
  try {
    const { Admin } = req.app.locals.models;

    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");

    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required" });
    }

    const admin = await Admin.findOne({ where: { email } });
    if (!admin) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    const ok = await bcrypt.compare(password, admin.password);
    if (!ok) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    // ✅ MFA: if enabled, send code and return mfaToken instead of session token
    const sequelize = req.app.locals.models?.sequelize;
    if (admin.mfa_enabled && sequelize && (admin.mfa_channel === "sms" || admin.mfa_channel === "email")) {
      const destination = admin.mfa_channel === "sms"
        ? (admin.mfa_phone || "")
        : (admin.email || "");
      if (!destination) {
        return res.status(400).json({ message: "MFA is enabled but no phone/email is set. Contact support." });
      }
      const { code } = await mfaService.createAndStoreCode(sequelize, admin.id, "login");
      const sent = await mfaService.sendCode(sequelize, admin.id, admin.mfa_channel, destination, code);
      if (!sent) {
        return res.status(503).json({ message: "Could not send verification code. Try again or use the other method." });
      }
      const mfaToken = jwt.sign(
        { adminId: admin.id, purpose: "mfa_verify" },
        process.env.JWT_SECRET,
        { expiresIn: `${mfaService.CODE_EXPIRY_MINUTES}m` }
      );
      return res.json({
        requiresMfa: true,
        mfaToken,
        channel: admin.mfa_channel,
      });
    }

    const adminWithTenant = await Admin.findByPk(admin.id);
    const tenantId = adminWithTenant?.tenant_id || admin.tenant_id || null;

    // Single session: increment so any previous session is invalidated
    const nextVersion = (Number(adminWithTenant?.session_token_version) || 0) + 1;
    await Admin.update(
      { session_token_version: nextVersion },
      { where: { id: admin.id } }
    );

    const tokenPayload = {
      adminId: admin.id,
      role: admin.role,
      permissions: admin.permissions || [],
      sessionTokenVersion: nextVersion,
    };
    if (tenantId) tokenPayload.tenant_id = tenantId;

    const token = jwt.sign(tokenPayload, process.env.JWT_SECRET, { expiresIn: "7d" });

    return res.json({
      token,
      admin: {
        id: admin.id,
        name: admin.name,
        email: admin.email,
        role: admin.role,
        permissions: admin.permissions || [],
        tenant_id: tenantId,
      },
    });
  } catch (e) {
    return res.status(500).json({ message: "Login failed", error: e.message });
  }
};

/**
 * POST /api/admin/mfa/verify-login
 * Body: { mfaToken, code }
 * After login returned requiresMfa, client sends the code; on success returns token + admin.
 */
exports.verifyMfaLogin = async (req, res) => {
  try {
    const { Admin } = req.app.locals.models;
    const sequelize = req.app.locals.models?.sequelize;
    const mfaToken = String(req.body.mfaToken || "").trim();
    const code = String(req.body.code || "").trim();

    if (!mfaToken || !code || !sequelize) {
      return res.status(400).json({ message: "mfaToken and code are required" });
    }

    let payload;
    try {
      payload = jwt.verify(mfaToken, process.env.JWT_SECRET);
    } catch {
      return res.status(401).json({ message: "Verification expired. Please log in again." });
    }
    if (payload.purpose !== "mfa_verify" || !payload.adminId) {
      return res.status(401).json({ message: "Invalid verification. Please log in again." });
    }

    const valid = await mfaService.verifyCode(sequelize, payload.adminId, code, "login");
    if (!valid) {
      return res.status(401).json({ message: "Invalid or expired code" });
    }

    const admin = await Admin.findByPk(payload.adminId);
    if (!admin) return res.status(401).json({ message: "Admin not found" });

    const tenantId = admin.tenant_id || null;

    // Single session: increment so any previous session is invalidated
    const nextVersion = (Number(admin.session_token_version) || 0) + 1;
    await Admin.update(
      { session_token_version: nextVersion },
      { where: { id: admin.id } }
    );

    const tokenPayload = {
      adminId: admin.id,
      role: admin.role,
      permissions: admin.permissions || [],
      sessionTokenVersion: nextVersion,
    };
    if (tenantId) tokenPayload.tenant_id = tenantId;

    const token = jwt.sign(tokenPayload, process.env.JWT_SECRET, { expiresIn: "7d" });

    return res.json({
      token,
      admin: {
        id: admin.id,
        name: admin.name,
        email: admin.email,
        role: admin.role,
        permissions: admin.permissions || [],
        tenant_id: tenantId,
      },
    });
  } catch (e) {
    return res.status(500).json({ message: "Verification failed", error: e.message });
  }
};

/**
 * POST /api/admin/mfa/setup
 * Body: { channel: 'sms' | 'email', phone?, email? }
 * Requires auth. Saves channel + destination, sends test code; client must call verify-setup with that code to enable MFA.
 */
exports.mfaSetup = async (req, res) => {
  try {
    const { Admin } = req.app.locals.models;
    const sequelize = req.app.locals.models?.sequelize;
    const adminId = req.admin?.id;
    if (!adminId || !sequelize) return res.status(401).json({ message: "Unauthorized" });

    const channel = (req.body.channel || "").toLowerCase();
    if (channel !== "sms" && channel !== "email") {
      return res.status(400).json({ message: "channel must be 'sms' or 'email'" });
    }

    const admin = await Admin.findByPk(adminId, { attributes: ["id", "email", "mfa_enabled", "mfa_channel", "mfa_phone"] });
    if (!admin) return res.status(401).json({ message: "Admin not found" });

    let destination;
    if (channel === "sms") {
      const phone = (req.body.phone || admin.mfa_phone || "").trim();
      if (!phone) return res.status(400).json({ message: "Phone number is required for SMS" });
      destination = phone;
      await admin.update({ mfa_channel: "sms", mfa_phone: phone, mfa_enabled: false });
    } else {
      destination = (req.body.email || admin.email || "").trim().toLowerCase();
      if (!destination) return res.status(400).json({ message: "Email is required for email MFA" });
      await admin.update({ mfa_channel: "email", mfa_phone: null, mfa_enabled: false });
    }

    const { code } = await mfaService.createAndStoreCode(sequelize, adminId, "setup");
    const sent = await mfaService.sendCode(sequelize, adminId, channel, destination, code);
    if (!sent) {
      return res.status(503).json({ message: "Could not send verification code. Check configuration (email/SMS)." });
    }

    return res.json({ pendingVerification: true, channel });
  } catch (e) {
    return res.status(500).json({ message: "MFA setup failed", error: e.message });
  }
};

/**
 * POST /api/admin/mfa/verify-setup
 * Body: { code }
 * Requires auth. Verifies the code sent during setup and enables MFA.
 */
exports.mfaVerifySetup = async (req, res) => {
  try {
    const { Admin } = req.app.locals.models;
    const sequelize = req.app.locals.models?.sequelize;
    const adminId = req.admin?.id;
    if (!adminId || !sequelize) return res.status(401).json({ message: "Unauthorized" });

    const code = String(req.body.code || "").trim();
    if (!code) return res.status(400).json({ message: "Code is required" });

    const valid = await mfaService.verifyCode(sequelize, adminId, code, "setup");
    if (!valid) return res.status(401).json({ message: "Invalid or expired code" });

    await Admin.update({ mfa_enabled: true }, { where: { id: adminId } });
    return res.json({ message: "MFA enabled successfully", mfaEnabled: true });
  } catch (e) {
    return res.status(500).json({ message: "Verification failed", error: e.message });
  }
};

/**
 * POST /api/admin/mfa/disable
 * Body: { currentPassword }
 * Requires auth. Disables MFA after verifying current password.
 */
exports.mfaDisable = async (req, res) => {
  try {
    const { Admin } = req.app.locals.models;
    const adminId = req.admin?.id;
    if (!adminId) return res.status(401).json({ message: "Unauthorized" });

    const currentPassword = String(req.body.currentPassword || "");
    if (!currentPassword) return res.status(400).json({ message: "Current password is required" });

    const admin = await Admin.findByPk(adminId, { attributes: ["id", "password"] });
    if (!admin) return res.status(401).json({ message: "Admin not found" });

    const ok = await bcrypt.compare(currentPassword, admin.password);
    if (!ok) return res.status(401).json({ message: "Current password is incorrect" });

    await admin.update({ mfa_enabled: false, mfa_channel: null, mfa_phone: null });
    return res.json({ message: "MFA disabled successfully", mfaEnabled: false });
  } catch (e) {
    return res.status(500).json({ message: "Failed to disable MFA", error: e.message });
  }
};

/**
 * POST /api/admin/change-password
 * Body: { currentPassword, newPassword }
 * Requires auth.
 */
exports.changePassword = async (req, res) => {
  try {
    const { Admin } = req.app.locals.models;
    const sequelize = req.app.locals.models?.sequelize;
    const adminId = req.admin?.id;
    if (!adminId) return res.status(401).json({ message: "Unauthorized" });

    const currentPassword = String(req.body.currentPassword || "");
    const newPassword = String(req.body.newPassword || "");

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: "Current password and new password are required" });
    }

    const pwdCheck = validatePassword(newPassword);
    if (!pwdCheck.valid) {
      return res.status(400).json({ message: pwdCheck.message || "New password does not meet policy" });
    }

    const admin = await Admin.findByPk(adminId, { attributes: ["id", "password"] });
    if (!admin) return res.status(401).json({ message: "Admin not found" });

    const currentOk = await bcrypt.compare(currentPassword, admin.password);
    if (!currentOk) {
      return res.status(400).json({ message: "Current password is incorrect" });
    }

    const reused = sequelize
      ? await isPasswordReused(sequelize, adminId, newPassword, admin.password, bcrypt.compare.bind(bcrypt))
      : false;
    if (reused) {
      return res.status(400).json({ message: "New password cannot be the same as your current or any of your last 5 passwords" });
    }

    const hash = await bcrypt.hash(newPassword, 10);
    admin.password = hash;
    await admin.save();

    if (sequelize) await addToHistory(sequelize, adminId, hash);

    return res.json({ message: "Password updated successfully" });
  } catch (e) {
    return res.status(500).json({ message: "Failed to change password", error: e.message });
  }
};

/**
 * POST /api/admin/logout-other-devices
 * Increments session_token_version so all other tokens are invalid; returns new token so this device stays logged in.
 */
exports.logoutOtherDevices = async (req, res) => {
  try {
    const { Admin } = req.app.locals.models;
    const adminId = req.admin?.id;
    if (!adminId) return res.status(401).json({ message: "Unauthorized" });

    const admin = await Admin.findByPk(adminId, {
      attributes: ["id", "name", "email", "role", "permissions", "tenant_id", "session_token_version"],
    });
    if (!admin) return res.status(401).json({ message: "Admin not found" });

    const nextVersion = (Number(admin.session_token_version) || 0) + 1;
    await Admin.update(
      { session_token_version: nextVersion },
      { where: { id: adminId } }
    );

    const tenantId = admin.tenant_id || null;
    const tokenPayload = {
      adminId: admin.id,
      role: admin.role,
      permissions: admin.permissions || [],
      sessionTokenVersion: nextVersion,
    };
    if (tenantId) tokenPayload.tenant_id = tenantId;

    const token = jwt.sign(tokenPayload, process.env.JWT_SECRET, { expiresIn: "7d" });

    return res.json({
      token,
      admin: {
        id: admin.id,
        name: admin.name,
        email: admin.email,
        role: admin.role,
        permissions: admin.permissions || [],
        tenant_id: tenantId,
      },
    });
  } catch (e) {
    return res.status(500).json({ message: "Failed to log out other devices", error: e.message });
  }
};

/**
 * GET /api/admin/me
 */
exports.me = async (req, res) => {
  try {
    const { Admin } = req.app.locals.models;

    if (!req.admin?.id) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const admin = await Admin.findByPk(req.admin.id, {
      attributes: ["id", "name", "email", "role", "permissions", "tenant_id", "mfa_enabled", "mfa_channel"],
    });

    if (!admin) {
      return res.status(401).json({ message: "Admin not found" });
    }

    return res.json({
      id: admin.id,
      name: admin.name,
      email: admin.email,
      role: admin.role,
      permissions: admin.permissions || [],
      tenant_id: admin.tenant_id || null,
      mfa_enabled: !!admin.mfa_enabled,
      mfa_channel: admin.mfa_channel || null,
    });
  } catch (e) {
    return res.status(500).json({ message: "Failed to fetch admin", error: e.message });
  }
};
