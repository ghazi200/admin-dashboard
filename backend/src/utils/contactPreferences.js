/**
 * Guard contact channel preferences (Email / SMS / Phone / InApp).
 * Stored in "ContactPreferences" (raw SQL, no FK — see server.js).
 */

const CONTACT_TYPES = ["Email", "SMS", "Phone", "InApp"];

const KEY_TO_TYPE = {
  email: "Email",
  sms: "SMS",
  phone: "Phone",
  in_app: "InApp",
  inApp: "InApp",
  Email: "Email",
  SMS: "SMS",
  Phone: "Phone",
  InApp: "InApp",
};

const TYPE_TO_KEY = {
  Email: "email",
  SMS: "sms",
  Phone: "phone",
  InApp: "in_app",
};

function defaultPrefs() {
  return { email: true, sms: true, phone: true, in_app: true };
}

/**
 * Normalize body.contact_preferences into { email, sms, phone, in_app } booleans.
 * Accepts object keys or array of contactType strings / { contactType, active }.
 */
function normalizeContactPreferences(input) {
  if (input == null) return null;

  const out = defaultPrefs();

  if (Array.isArray(input)) {
    // If array of types: those are active; missing = false
    const hasActiveFlag = input.some(
      (x) => x && typeof x === "object" && Object.prototype.hasOwnProperty.call(x, "active")
    );
    if (hasActiveFlag) {
      for (const t of CONTACT_TYPES) out[TYPE_TO_KEY[t]] = false;
      for (const item of input) {
        const type = KEY_TO_TYPE[item.contactType] || KEY_TO_TYPE[item.type];
        if (!type) continue;
        out[TYPE_TO_KEY[type]] = Boolean(item.active);
      }
    } else {
      for (const t of CONTACT_TYPES) out[TYPE_TO_KEY[t]] = false;
      for (const item of input) {
        const raw = typeof item === "string" ? item : item?.contactType || item?.type;
        const type = KEY_TO_TYPE[raw];
        if (type) out[TYPE_TO_KEY[type]] = true;
      }
    }
    return out;
  }

  if (typeof input === "object") {
    for (const [k, v] of Object.entries(input)) {
      const type = KEY_TO_TYPE[k];
      if (!type) continue;
      out[TYPE_TO_KEY[type]] = Boolean(v);
    }
    return out;
  }

  return null;
}

async function ensureContactPreferencesTable(sequelize) {
  if (!sequelize) return;
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS "ContactPreferences" (
      id SERIAL PRIMARY KEY,
      "guardId" UUID NOT NULL,
      "contactType" VARCHAR(32) NOT NULL,
      "active" BOOLEAN DEFAULT true,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await sequelize.query(
    `CREATE INDEX IF NOT EXISTS "contact_preferences_guard_id" ON "ContactPreferences" ("guardId")`
  ).catch(() => {});
  await sequelize.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS "contact_preferences_guard_type_uq"
     ON "ContactPreferences" ("guardId", "contactType")`
  ).catch(() => {});
}

async function getGuardContactPreferences(sequelize, guardId) {
  if (!sequelize || !guardId) return defaultPrefs();
  try {
    await ensureContactPreferencesTable(sequelize);
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
    console.warn("getGuardContactPreferences failed:", e.message);
    return defaultPrefs();
  }
}

async function getContactPreferencesMap(sequelize, guardIds) {
  const map = new Map();
  if (!sequelize || !guardIds?.length) return map;
  try {
    await ensureContactPreferencesTable(sequelize);
    const [rows] = await sequelize.query(
      `SELECT "guardId", "contactType", "active"
       FROM "ContactPreferences"
       WHERE "guardId" = ANY($1::uuid[])`,
      { bind: [guardIds] }
    );
    for (const id of guardIds) {
      map.set(String(id), { email: false, sms: false, phone: false, in_app: false, _hasRows: false });
    }
    for (const row of rows || []) {
      const id = String(row.guardId);
      if (!map.has(id)) {
        map.set(id, { email: false, sms: false, phone: false, in_app: false, _hasRows: true });
      }
      const prefs = map.get(id);
      prefs._hasRows = true;
      const key = TYPE_TO_KEY[row.contactType];
      if (key) prefs[key] = Boolean(row.active);
    }
    // Guards with no rows → defaults (all on)
    for (const [id, prefs] of map.entries()) {
      if (!prefs._hasRows) {
        map.set(id, defaultPrefs());
      } else {
        const { _hasRows, ...clean } = prefs;
        map.set(id, clean);
      }
    }
  } catch (e) {
    console.warn("getContactPreferencesMap failed:", e.message);
  }
  return map;
}

async function setGuardContactPreferences(sequelize, guardId, prefsInput) {
  const prefs = normalizeContactPreferences(prefsInput);
  if (!sequelize || !guardId || !prefs) return null;

  await ensureContactPreferencesTable(sequelize);

  // Replace set for this guard (works with or without unique index)
  await sequelize.query(`DELETE FROM "ContactPreferences" WHERE "guardId" = $1::uuid`, {
    bind: [guardId],
  });

  for (const type of CONTACT_TYPES) {
    const active = Boolean(prefs[TYPE_TO_KEY[type]]);
    await sequelize.query(
      `INSERT INTO "ContactPreferences" ("guardId", "contactType", "active", "createdAt", "updatedAt")
       VALUES ($1::uuid, $2, $3, NOW(), NOW())`,
      { bind: [guardId, type, active] }
    );
  }

  return prefs;
}

module.exports = {
  CONTACT_TYPES,
  defaultPrefs,
  normalizeContactPreferences,
  ensureContactPreferencesTable,
  getGuardContactPreferences,
  getContactPreferencesMap,
  setGuardContactPreferences,
};
