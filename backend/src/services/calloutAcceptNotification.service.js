/**
 * Admin bell notification when a guard accepts a callout / fills a shift.
 */
const { notify } = require("../utils/notify");

async function resolveShiftAndGuard(sequelize, { shiftId, guardId }) {
  let guardName = "Guard";
  let location = null;
  let shiftDate = null;
  let shiftStart = null;
  let shiftEnd = null;
  let reason = null;

  if (sequelize && shiftId) {
    const [shiftRows] = await sequelize.query(
      `SELECT location, shift_date, shift_start, shift_end FROM shifts WHERE id = $1::uuid LIMIT 1`,
      { bind: [String(shiftId)] }
    );
    if (shiftRows[0]) {
      location = shiftRows[0].location;
      shiftDate = shiftRows[0].shift_date;
      shiftStart = shiftRows[0].shift_start;
      shiftEnd = shiftRows[0].shift_end;
    }

    const [reasonRows] = await sequelize.query(
      `SELECT reason FROM callouts WHERE shift_id = $1::uuid ORDER BY created_at DESC LIMIT 1`,
      { bind: [String(shiftId)] }
    );
    if (reasonRows[0]?.reason) reason = reasonRows[0].reason;
  }

  if (sequelize && guardId) {
    const [guardRows] = await sequelize.query(
      `SELECT name, email FROM guards WHERE id::text = $1 LIMIT 1`,
      { bind: [String(guardId)] }
    );
    if (guardRows[0]) {
      guardName =
        guardRows[0].name ||
        guardRows[0].email ||
        `Guard ${String(guardId).substring(0, 8)}`;
    } else {
      guardName = `Guard ${String(guardId).substring(0, 8)}`;
    }
  }

  return { guardName, location, shiftDate, shiftStart, shiftEnd, reason };
}

/**
 * Avoid double bell items when both proxy + socket fire for the same accept.
 */
async function recentlyNotified(Notification, shiftId, guardId) {
  if (!Notification || !shiftId || !guardId) return false;
  const since = new Date(Date.now() - 2 * 60 * 1000);
  const rows = await Notification.findAll({
    where: { type: "CALLOUT_ACCEPTED" },
    order: [["createdAt", "DESC"]],
    limit: 20,
  });
  return rows.some((n) => {
    const meta = n.meta && typeof n.meta === "object" ? n.meta : {};
    const created = n.createdAt ? new Date(n.createdAt) : null;
    if (!created || created < since) return false;
    return String(meta.shiftId) === String(shiftId) && String(meta.guardId) === String(guardId);
  });
}

async function notifyCalloutAccepted(app, payload = {}) {
  const {
    shiftId,
    guardId,
    calloutId = null,
    filled = true,
    response = "ACCEPTED",
  } = payload;

  const accepted =
    String(response).toUpperCase() === "ACCEPTED" ||
    String(response).toUpperCase() === "YES";
  // Strict: only after a confirmed fill — never on callout create / declines
  if (!accepted || filled !== true || !shiftId || !guardId) return null;

  const { Notification, sequelize } = app.locals.models || {};
  if (!Notification) return null;

  if (await recentlyNotified(Notification, shiftId, guardId)) {
    console.log("ℹ️ CALLOUT_ACCEPTED notification skipped (duplicate within 2m)");
    return null;
  }

  const { guardName, location, shiftDate, shiftStart, shiftEnd, reason } =
    await resolveShiftAndGuard(sequelize, { shiftId, guardId });

  const place = location || "shift";
  const when =
    shiftDate && shiftStart && shiftEnd
      ? ` on ${shiftDate} ${shiftStart}-${shiftEnd}`
      : shiftDate
        ? ` on ${shiftDate}`
        : "";
  const reasonPart = reason ? ` (${reason} callout)` : " (callout)";

  return notify(app, {
    type: "CALLOUT_ACCEPTED",
    title: "Callout Accepted",
    message: `${guardName} accepted ${place}${reasonPart}${when}`,
    entityType: "shift",
    entityId: String(shiftId),
    audience: "all",
    meta: {
      shiftId,
      guardId,
      guardName,
      calloutId,
      location: place,
      reason,
      shiftDate,
      shiftTime: shiftStart && shiftEnd ? `${shiftStart}-${shiftEnd}` : null,
      source: "callout_accept",
    },
  });
}

module.exports = { notifyCalloutAccepted };
