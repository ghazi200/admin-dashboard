const {
  triggerEmergencySos,
  ensureEmergencyContactsTable,
  toE164,
} = require("../services/emergencySos.service");
const { randomUUID } = require("crypto");

/**
 * POST /emergency/sos
 * Body: { lat?, lng?, accuracy?, notifyPhone? }
 */
exports.triggerEmergencySOS = async (req, res) => {
  try {
    const guardId = req.guard?.id;
    if (!guardId) {
      return res.status(401).json({ message: "Missing guard identity (auth)" });
    }

    const { lat, lng, accuracy, notifyPhone } = req.body || {};
    const result = await triggerEmergencySos(req.app, {
      guardId,
      lat,
      lng,
      accuracy,
      notifyPhoneOverride: notifyPhone,
    });
    return res.status(200).json(result);
  } catch (e) {
    console.error("❌ Emergency SOS error:", e);
    return res.status(e.status || 500).json({
      message: e.message || "Failed to activate emergency SOS",
    });
  }
};

/**
 * GET /emergency/contacts
 */
exports.getEmergencyContacts = async (req, res) => {
  try {
    const guardId = req.guard?.id;
    if (!guardId) return res.status(401).json({ message: "Missing guard identity" });
    const { sequelize } = req.app.locals.models || {};
    if (!sequelize) return res.status(503).json({ message: "Database not ready" });

    await ensureEmergencyContactsTable(sequelize);
    const [rows] = await sequelize.query(
      `SELECT id, guard_id, tenant_id, name, phone, created_at
       FROM emergency_contacts WHERE guard_id = $1
       ORDER BY created_at DESC LIMIT 50`,
      { bind: [guardId] }
    );
    return res.json(rows || []);
  } catch (e) {
    return res.status(500).json({
      message: "Failed to load emergency contacts",
      error: e.message,
    });
  }
};

/**
 * POST /emergency/contacts
 * Body: { name, phone }
 */
exports.addEmergencyContact = async (req, res) => {
  try {
    const guardId = req.guard?.id;
    if (!guardId) return res.status(401).json({ message: "Missing guard identity" });
    const name = String(req.body?.name || "").trim();
    const phone = toE164(req.body?.phone) || String(req.body?.phone || "").trim();
    if (!name || !phone) {
      return res.status(400).json({ message: "name and phone are required" });
    }

    const { sequelize } = req.app.locals.models || {};
    if (!sequelize) return res.status(503).json({ message: "Database not ready" });
    await ensureEmergencyContactsTable(sequelize);

    const id = randomUUID();
    const tenantId = req.guard?.tenant_id || null;
    await sequelize.query(
      `INSERT INTO emergency_contacts (id, guard_id, tenant_id, name, phone, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())`,
      { bind: [id, guardId, tenantId, name, phone] }
    );

    return res.status(201).json({ id, guard_id: guardId, tenant_id: tenantId, name, phone });
  } catch (e) {
    return res.status(500).json({
      message: "Failed to add emergency contact",
      error: e.message,
    });
  }
};
