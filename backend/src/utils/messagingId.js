/**
 * Messaging participant IDs: DB uses UUID for participant_id.
 * Admins/guards may have integer IDs; these helpers return a deterministic UUID string.
 */

const crypto = require("crypto");

function getAdminMessagingId(adminId) {
  if (adminId == null) return null;
  const s = String(adminId);
  if (s.length === 36 && s.includes("-")) return s;
  const buf = crypto.createHash("sha256").update("admin-messaging-" + s).digest();
  const hex = buf.slice(0, 16).toString("hex");
  const uuid = hex.replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, "$1-$2-$3-$4-$5");
  return String(uuid);
}

function getGuardMessagingId(guardId) {
  if (guardId == null) return null;
  const s = String(guardId);
  if (s.length === 36 && s.includes("-")) return s;
  const buf = crypto.createHash("sha256").update("guard-messaging-" + s).digest();
  const hex = buf.slice(0, 16).toString("hex");
  const uuid = hex.replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, "$1-$2-$3-$4-$5");
  return String(uuid);
}

/** For DB queries: always returns a string UUID (PostgreSQL participant_id is UUID). */
function ensureAdminMessagingId(adminId) {
  if (adminId == null) return null;
  const raw = getAdminMessagingId(adminId);
  if (raw && typeof raw === "string" && raw.length === 36 && raw.includes("-")) return raw;
  return getAdminMessagingId(String(adminId));
}

/** For DB queries: always returns a string UUID. */
function ensureGuardMessagingId(guardId) {
  if (guardId == null) return null;
  const raw = getGuardMessagingId(guardId);
  if (raw && typeof raw === "string" && raw.length === 36 && raw.includes("-")) return raw;
  return getGuardMessagingId(String(guardId));
}

/** Resolve participant_id for DB: use messaging UUID from raw user id and type. */
function toParticipantId(userType, userId) {
  if (userId == null) return null;
  if (userType === "admin") return ensureAdminMessagingId(userId);
  if (userType === "guard") return ensureGuardMessagingId(userId);
  return String(userId);
}

module.exports = {
  getAdminMessagingId,
  getGuardMessagingId,
  ensureAdminMessagingId,
  ensureGuardMessagingId,
  toParticipantId,
};
