/**
 * Shared helpers for shift swap eligibility + guard notifications.
 */
const { createGuardNotification } = require("../utils/guardNotification");

function isUUID(v) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    String(v || "").trim()
  );
}

function normId(v) {
  return String(v || "").trim().toLowerCase();
}

/**
 * @returns {{ ok: true } | { ok: false, status: number, message: string }}
 */
function checkShiftEligibleForSwap(shift, { allowClosed = false } = {}) {
  if (!shift) return { ok: false, status: 404, message: "Shift not found" };
  const st = String(shift.status || "").toUpperCase();
  if (!allowClosed && st === "CLOSED") {
    return { ok: false, status: 400, message: "Cannot swap a closed shift" };
  }
  if (shift.pending_guard_id) {
    return {
      ok: false,
      status: 409,
      message: "Shift has a pending accept awaiting admin/supervisor confirmation",
    };
  }
  return { ok: true };
}

function shiftWhen(shift) {
  if (!shift) return "a shift";
  const place = shift.location || "shift";
  const when =
    shift.shift_date && shift.shift_start && shift.shift_end
      ? ` on ${shift.shift_date} ${shift.shift_start}-${shift.shift_end}`
      : shift.shift_date
        ? ` on ${shift.shift_date}`
        : "";
  return `${place}${when}`;
}

async function notifyGuardSwap(app, { guardId, type, title, message, shiftId = null, swapId = null, meta = {} }) {
  if (!app || !guardId || !isUUID(guardId)) return null;
  const sequelize = app.locals.models?.sequelize;
  if (!sequelize) return null;
  try {
    return await createGuardNotification({
      sequelize,
      guardId,
      type,
      title,
      message,
      shiftId: shiftId && isUUID(shiftId) ? shiftId : null,
      meta: { ...meta, swapId: swapId || null },
      app,
    });
  } catch (e) {
    console.warn("notifyGuardSwap failed:", e?.message || e);
    return null;
  }
}

module.exports = {
  isUUID,
  normId,
  checkShiftEligibleForSwap,
  shiftWhen,
  notifyGuardSwap,
};
