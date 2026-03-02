// backend/src/jobs/lateClockIn.job.js
const { Shift, TimeEntry, Admin, Guard, ShiftTimeEntry } = require("../models");
const { Op } = require("sequelize");

function parseShiftStart(shift) {
  // expects shift.shift_date = YYYY-MM-DD and shift.shift_start = HH:MM or HH:MM:SS
  return new Date(`${shift.shift_date}T${shift.shift_start}`);
}

function minutesDiff(a, b) {
  return Math.floor((b - a) / 60000);
}

async function getLatestLateNotice(shiftId, guardId) {
  if (!ShiftTimeEntry) return null;

  const notice = await ShiftTimeEntry.findOne({
    where: {
      shift_id: shiftId,
      guard_id: guardId,
      event_type: "LATE_NOTICE",
    },
    order: [["event_time", "DESC"]],
  });

  if (!notice) return null;

  const meta = notice.meta || {};
  return {
    etaMinutes: meta.etaMinutes ?? null,
    reason: meta.reason ?? null,
    noticeAt: notice.event_time ? new Date(notice.event_time).toISOString() : null,
    eventId: notice.id,
  };
}

async function alreadyAlertedLateOnce(shiftId, guardId) {
  // Persistent "notify once" check using shift_time_entries
  if (!ShiftTimeEntry) return false;

  const existing = await ShiftTimeEntry.findOne({
    where: {
      shift_id: shiftId,
      guard_id: guardId,
      event_type: "LATE_CLOCKIN_ALERT",
    },
  });

  return !!existing;
}

async function markAlertedLateOnce({ shiftId, guardId, minsLate }) {
  // Persist a marker so we never alert again for this shift/guard (even after restart)
  if (!ShiftTimeEntry) return;

  await ShiftTimeEntry.create({
    shift_id: shiftId,
    guard_id: guardId,
    event_type: "LATE_CLOCKIN_ALERT",
    event_time: new Date(),
    source: "SYSTEM",
    meta: { minsLate },
  });
}

async function runLateClockInCheck(io, graceMinutes = 15) {
  const now = new Date();


  const shifts = await Shift.findAll({
    where: {
      guard_id: { [Op.ne]: null },
      status: { [Op.in]: ["SCHEDULED", "ASSIGNED", "OPEN"] },
    },
    include: [{ model: Guard }],
  });

  for (const s of shifts) {
    const start = parseShiftStart(s);
    const minsLate = minutesDiff(start, now);

    // too early OR too old (ignore shifts older than 12 hours)
    if (minsLate < graceMinutes || minsLate > 720) continue;

    // If guard already clocked in, do nothing
    const te = await TimeEntry.findOne({
      where: { shift_id: s.id, guard_id: s.guard_id },
    });
    if (te?.clock_in_at) continue;

    // ✅ Notify once per shift/guard (persistent)
    const alreadyAlerted = await alreadyAlertedLateOnce(s.id, s.guard_id);
    if (alreadyAlerted) continue;

    // Pull latest "Running Late" notice (ETA + reason)
    const lateNotice = await getLatestLateNotice(s.id, s.guard_id);

    const payload = {
      type: "LATE_CLOCKIN",
      shiftId: s.id,
      guardId: s.guard_id,
      guardName: s.Guard?.name || null,
      minsLate,
      createdAt: now.toISOString(),

      // ✅ Include "Running Late" details if guard pressed the button
      lateNotice: lateNotice
        ? {
            etaMinutes: lateNotice.etaMinutes,
            reason: lateNotice.reason,
            noticeAt: lateNotice.noticeAt,
            eventId: lateNotice.eventId,
          }
        : null,
    };

    // Mark as alerted BEFORE emitting to prevent double emits in edge cases
    await markAlertedLateOnce({ shiftId: s.id, guardId: s.guard_id, minsLate });

    // Emit realtime admin alert
    if (io) {
      io.to("admin").emit("late_clockin_alert", payload);

      // Emit supervisor alerts (same room, but tagged with supervisorId like you already do)
      const supervisors = await Admin.findAll({ where: { role: "supervisor" } });
      supervisors.forEach((sup) =>
        io.to("admin").emit("supervisor_alert", { ...payload, supervisorId: sup.id })
      );
    }
  }
}

function startLateClockInJob(io) {
  // Run every minute
  setInterval(() => {
    runLateClockInCheck(io).catch((e) => {
      console.error("lateClockIn job error:", e);
    });
  }, 60_000);
}

module.exports = { startLateClockInJob, runLateClockInCheck };
