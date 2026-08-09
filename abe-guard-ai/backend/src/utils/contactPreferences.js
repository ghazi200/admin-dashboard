/**
 * Load per-guard ContactPreferences for callout channel selection.
 * Shared Postgres table with admin backend (no FK).
 */
const { sequelize } = require("../config/db");

const TYPE_TO_KEY = {
  Email: "email",
  SMS: "sms",
  Phone: "phone",
  InApp: "in_app",
};

function defaultPrefs() {
  return { email: true, sms: true, phone: true, in_app: true };
}

async function getGuardContactPreferences(guardId) {
  if (!sequelize || !guardId) return defaultPrefs();
  try {
    const [rows] = await sequelize.query(
      `SELECT "contactType", "active" FROM "ContactPreferences" WHERE "guardId" = $1::uuid`,
      { bind: [guardId] }
    );
    if (!rows?.length) return defaultPrefs();
    const out = { email: false, sms: false, phone: false, in_app: false };
    for (const row of rows) {
      const key = TYPE_TO_KEY[row.contactType];
      if (key) out[key] = Boolean(row.active);
    }
    return out;
  } catch (e) {
    console.warn("getGuardContactPreferences:", e.message);
    return defaultPrefs();
  }
}

/**
 * Map prefs → notifyGuards channel list: SMS | EMAIL | CALL | APP
 */
function prefsToChannels(prefs, { hasConsent = false } = {}) {
  const channels = [];
  if (prefs?.email) channels.push("EMAIL");
  if (prefs?.sms && hasConsent) channels.push("SMS");
  if (prefs?.phone && hasConsent) channels.push("CALL");
  if (prefs?.in_app) channels.push("APP");
  return channels;
}

module.exports = {
  defaultPrefs,
  getGuardContactPreferences,
  prefsToChannels,
};
