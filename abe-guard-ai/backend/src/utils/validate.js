// backend/src/utils/validate.js

function isUUID(v) {
  const s = String(v || "").trim();
  // UUID v1-v5 (generic)
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
}

module.exports = { isUUID };
