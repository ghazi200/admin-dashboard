/**
 * Guard weekly schedule receipt acknowledgments (Mon–Sun).
 */

const NOTE_MAX = 500;

function toDateOnly(d) {
  if (!d) return null;
  if (typeof d === "string" && /^\d{4}-\d{2}-\d{2}/.test(d)) return d.slice(0, 10);
  const x = new Date(d);
  if (Number.isNaN(x.getTime())) return null;
  const y = x.getFullYear();
  const m = String(x.getMonth() + 1).padStart(2, "0");
  const day = String(x.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Current week Monday–Sunday as YYYY-MM-DD (local calendar). */
function currentWeekRange(now = new Date()) {
  const today = new Date(now);
  const dayOfWeek = today.getDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(today);
  monday.setDate(today.getDate() + mondayOffset);
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return {
    start: toDateOnly(monday),
    end: toDateOnly(sunday),
  };
}

function sanitizeNote(note) {
  if (note == null) return null;
  const s = String(note).trim();
  if (!s) return null;
  return s.length > NOTE_MAX ? s.slice(0, NOTE_MAX) : s;
}

async function findAck(ScheduleAcknowledgment, { guardId, periodStart, periodEnd }) {
  if (!ScheduleAcknowledgment) return null;
  return ScheduleAcknowledgment.findOne({
    where: {
      guard_id: guardId,
      period_start: periodStart,
      period_end: periodEnd,
    },
  });
}

async function getAckForGuard(models, { guardId, periodStart, periodEnd }) {
  const { ScheduleAcknowledgment } = models || {};
  const start = toDateOnly(periodStart);
  const end = toDateOnly(periodEnd);
  if (!start || !end || !guardId) {
    return { acknowledged: false, acknowledgment: null };
  }
  const row = await findAck(ScheduleAcknowledgment, {
    guardId,
    periodStart: start,
    periodEnd: end,
  });
  if (!row) return { acknowledged: false, acknowledgment: null };
  return {
    acknowledged: true,
    acknowledgment: {
      id: row.id,
      period_start: row.period_start,
      period_end: row.period_end,
      note: row.note || null,
      acknowledged_at: row.acknowledged_at,
    },
  };
}

async function acknowledgeSchedule(req, { periodStart, periodEnd, note } = {}) {
  const { ScheduleAcknowledgment, Guard } = req.app.locals.models || {};
  if (!ScheduleAcknowledgment) {
    const err = new Error("Schedule acknowledgment not available");
    err.status = 503;
    throw err;
  }

  const guardId = req.guard?.id;
  if (!guardId) {
    const err = new Error("Guard authentication required");
    err.status = 401;
    throw err;
  }

  const week = currentWeekRange();
  const start = toDateOnly(periodStart) || week.start;
  const end = toDateOnly(periodEnd) || week.end;
  if (!start || !end) {
    const err = new Error("Invalid schedule period");
    err.status = 400;
    throw err;
  }

  let tenantId = req.guard?.tenant_id || null;
  if (!tenantId && Guard) {
    try {
      const g = await Guard.findByPk(guardId, { attributes: ["id", "tenant_id"] });
      tenantId = g?.tenant_id || null;
    } catch (_) {
      /* ignore */
    }
  }

  const cleanNote = sanitizeNote(note);
  const now = new Date();

  let row = await findAck(ScheduleAcknowledgment, {
    guardId,
    periodStart: start,
    periodEnd: end,
  });

  if (row) {
    row.note = cleanNote;
    row.acknowledged_at = now;
    if (tenantId && !row.tenant_id) row.tenant_id = tenantId;
    await row.save();
  } else {
    row = await ScheduleAcknowledgment.create({
      tenant_id: tenantId,
      guard_id: guardId,
      period_start: start,
      period_end: end,
      note: cleanNote,
      acknowledged_at: now,
    });
  }

  try {
    const { emitAuditEvent } = require("./auditEvent.service");
    await emitAuditEvent(req.app, {
      tenantId,
      actorType: "guard",
      actorId: String(guardId),
      action: "schedule.acknowledge",
      entityType: "schedule_week",
      entityId: null,
      summary: `Guard acknowledged schedule ${start}–${end}`,
      after: {
        period_start: start,
        period_end: end,
        note: cleanNote,
        acknowledgment_id: row.id,
      },
    });
  } catch (_) {
    /* non-fatal */
  }

  return {
    ok: true,
    acknowledged: true,
    acknowledgment: {
      id: row.id,
      period_start: row.period_start,
      period_end: row.period_end,
      note: row.note || null,
      acknowledged_at: row.acknowledged_at,
    },
  };
}

async function listAcknowledgments(req, { periodStart, periodEnd, limit = 200 } = {}) {
  const { ScheduleAcknowledgment, Guard } = req.app.locals.models || {};
  if (!ScheduleAcknowledgment) {
    const err = new Error("Schedule acknowledgment not available");
    err.status = 503;
    throw err;
  }

  const week = currentWeekRange();
  const start = toDateOnly(periodStart) || week.start;
  const end = toDateOnly(periodEnd) || week.end;

  const where = {
    period_start: start,
    period_end: end,
  };

  const role = String(req.admin?.role || "").toLowerCase();
  const adminTenant = req.admin?.tenant_id;
  if (role !== "super_admin" && adminTenant) {
    where.tenant_id = adminTenant;
  } else if (req.query?.tenant_id) {
    where.tenant_id = String(req.query.tenant_id);
  }

  const rows = await ScheduleAcknowledgment.findAll({
    where,
    order: [["acknowledged_at", "DESC"]],
    limit: Math.min(Number(limit) || 200, 500),
  });

  const guardIds = [...new Set(rows.map((r) => r.guard_id).filter(Boolean))];
  let guardsById = {};
  if (Guard && guardIds.length) {
    const { Op } = require("sequelize");
    const guards = await Guard.findAll({
      where: { id: { [Op.in]: guardIds } },
      attributes: ["id", "name", "email"],
    });
    guardsById = Object.fromEntries(guards.map((g) => [g.id, g]));
  }

  return {
    period: { start, end },
    count: rows.length,
    acknowledgments: rows.map((r) => {
      const g = guardsById[r.guard_id];
      return {
        id: r.id,
        guard_id: r.guard_id,
        guard_name: g?.name || null,
        guard_email: g?.email || null,
        tenant_id: r.tenant_id,
        period_start: r.period_start,
        period_end: r.period_end,
        note: r.note || null,
        acknowledged_at: r.acknowledged_at,
      };
    }),
  };
}

module.exports = {
  NOTE_MAX,
  toDateOnly,
  currentWeekRange,
  sanitizeNote,
  getAckForGuard,
  acknowledgeSchedule,
  listAcknowledgments,
};
