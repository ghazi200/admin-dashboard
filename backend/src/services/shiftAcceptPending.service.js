/**
 * Pending accept window: guard accepts → notify admin → wait N minutes →
 * finalize CLOSED unless admin/supervisor overrides.
 */
const { notify } = require("../utils/notify");

function overrideWindowMs() {
  const mins = Number(process.env.ACCEPT_OVERRIDE_MINUTES || 7);
  const clamped = Number.isFinite(mins) ? Math.min(30, Math.max(5, mins)) : 7;
  return clamped * 60 * 1000;
}

function overrideWindowMinutes() {
  return Math.round(overrideWindowMs() / 60000);
}

function isUUID(v) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    String(v || "").trim()
  );
}

async function columnsReady(sequelize) {
  try {
    const [rows] = await sequelize.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'shifts'
         AND column_name IN ('pending_guard_id','accept_pending_until')`
    );
    const names = new Set((rows || []).map((r) => r.column_name));
    return names.has("pending_guard_id") && names.has("accept_pending_until");
  } catch {
    return false;
  }
}

async function resolveGuardName(sequelize, guardId) {
  if (!sequelize || !guardId) return "Guard";
  const [rows] = await sequelize.query(
    `SELECT name, email FROM guards WHERE id::text = $1 LIMIT 1`,
    { bind: [String(guardId)] }
  );
  if (!rows?.[0]) return `Guard ${String(guardId).slice(0, 8)}`;
  return rows[0].name || rows[0].email || `Guard ${String(guardId).slice(0, 8)}`;
}

function shiftLabel(shift) {
  const place = shift?.location || "the shift";
  const when =
    shift?.shift_date && shift?.shift_start && shift?.shift_end
      ? ` on ${shift.shift_date} ${shift.shift_start}-${shift.shift_end}`
      : shift?.shift_date
        ? ` on ${shift.shift_date}`
        : "";
  return `${place}${when}`;
}

/**
 * Notify the accepting guard (and optionally a reassigned guard) via guard_notifications.
 */
async function notifyGuardAcceptOutcome(app, {
  guardId,
  shift,
  outcome, // confirmed | rejected | reassigned_away | assigned
  reason = null,
}) {
  if (!app || !guardId || !shift) return null;
  const sequelize = app.locals.models?.sequelize;
  if (!sequelize) return null;

  const label = shiftLabel(shift);
  let type = "SHIFT_ACCEPT_CONFIRMED";
  let title = "Shift confirmed";
  let message = `Your accept for ${label} was confirmed. The shift is now assigned to you.`;

  if (outcome === "rejected") {
    type = "SHIFT_ACCEPT_REJECTED";
    title = "Shift accept not approved";
    message = `Your accept for ${label} was not approved. The shift remains open.`;
    if (reason) message += ` Reason: ${reason}`;
  } else if (outcome === "reassigned_away") {
    type = "SHIFT_ACCEPT_REJECTED";
    title = "Shift accept overridden";
    message = `Your accept for ${label} was overridden and assigned to another guard.`;
    if (reason) message += ` Reason: ${reason}`;
  } else if (outcome === "assigned") {
    type = "SHIFT_ASSIGNED";
    title = "Shift assigned to you";
    message = `You have been assigned ${label}.`;
  }

  try {
    const { createGuardNotification } = require("../utils/guardNotification");
    const n = await createGuardNotification({
      sequelize,
      guardId,
      type,
      title,
      message,
      shiftId: shift.id,
      meta: {
        shiftId: shift.id,
        outcome,
        reason: reason || null,
        location: shift.location || null,
        shiftDate: shift.shift_date || null,
      },
      app,
    });
    const emit = app.locals.emitToRealtime;
    if (typeof emit === "function") {
      emit(app, `guard:${guardId}`, "shift_accept_outcome", {
        shiftId: shift.id,
        outcome,
        title,
        message,
        reason: reason || null,
      }).catch(() => {});
    }
    return n;
  } catch (e) {
    console.warn("notifyGuardAcceptOutcome failed:", e?.message || e);
    return null;
  }
}

/**
 * Place a pending accept (status stays OPEN, guard_id stays null).
 */
async function beginPendingAccept(app, { shiftId, guardId, source = "accept_shift", calloutId = null }) {
  const sequelize = app.locals.models?.sequelize;
  if (!sequelize) throw new Error("Database not available");
  if (!isUUID(shiftId) || !isUUID(guardId)) {
    const err = new Error("Invalid shift or guard id");
    err.status = 400;
    throw err;
  }

  const ready = await columnsReady(sequelize);
  if (!ready) {
    // Fallback: immediate assign (pre-migration)
    const [upd] = await sequelize.query(
      `UPDATE public.shifts
       SET guard_id = $1::uuid, status = 'CLOSED'
       WHERE id = $2::uuid AND UPPER(TRIM(status::text)) = 'OPEN' AND guard_id IS NULL
       RETURNING *`,
      { bind: [guardId, shiftId] }
    );
    const row = upd?.[0];
    if (!row) {
      const err = new Error("Shift already taken");
      err.status = 409;
      throw err;
    }
    return { mode: "immediate", shift: row, pendingUntil: null };
  }

  const until = new Date(Date.now() + overrideWindowMs());
  const [upd] = await sequelize.query(
    `
    UPDATE public.shifts
    SET pending_guard_id = $1::uuid,
        accept_pending_until = $2::timestamptz,
        accepted_at = NOW(),
        accept_source = $3
    WHERE id = $4::uuid
      AND UPPER(TRIM(status::text)) = 'OPEN'
      AND guard_id IS NULL
      AND pending_guard_id IS NULL
    RETURNING *
    `,
    { bind: [guardId, until.toISOString(), String(source || "accept_shift").slice(0, 64), shiftId] }
  );
  const row = upd?.[0];
  if (!row) {
    const err = new Error("Shift already taken or pending another accept");
    err.status = 409;
    throw err;
  }

  await notifyAcceptPending(app, {
    shiftId,
    guardId,
    calloutId,
    pendingUntil: until.toISOString(),
    source,
    shift: row,
  });

  const emit = app.locals.emitToRealtime;
  if (typeof emit === "function") {
    emit(app, "role:all", "shift_accept_pending", {
      shiftId,
      guardId,
      calloutId,
      pendingUntil: until.toISOString(),
      windowMinutes: overrideWindowMinutes(),
      location: row.location,
      tenant_id: row.tenant_id,
      source,
    }).catch(() => {});
  }

  try {
    const { emitAuditEvent } = require("./auditEvent.service");
    await emitAuditEvent(app, {
      tenantId: row.tenant_id || null,
      actorType: "guard",
      actorId: String(guardId),
      action: "shift.accept_pending",
      entityType: "shift",
      entityId: shiftId,
      summary: `Guard pending-accept recorded (${source})`,
      after: {
        pendingGuardId: guardId,
        pendingUntil: until.toISOString(),
        source,
        calloutId: calloutId || null,
      },
    });
  } catch (_) {
    /* non-fatal */
  }

  return { mode: "pending", shift: row, pendingUntil: until.toISOString() };
}

async function notifyAcceptPending(app, payload) {
  const { shiftId, guardId, calloutId, pendingUntil, source, shift } = payload;
  const sequelize = app.locals.models?.sequelize;
  const guardName = await resolveGuardName(sequelize, guardId);
  const place = shift?.location || "shift";
  const mins = overrideWindowMinutes();
  const when =
    shift?.shift_date && shift?.shift_start && shift?.shift_end
      ? ` on ${shift.shift_date} ${shift.shift_start}-${shift.shift_end}`
      : shift?.shift_date
        ? ` on ${shift.shift_date}`
        : "";

  return notify(app, {
    type: "SHIFT_ACCEPT_PENDING",
    title: "Shift accept — override window",
    message: `${guardName} accepted ${place}${when}. You have ~${mins} minutes to override before it closes.`,
    entityType: "shift",
    entityId: String(shiftId),
    audience: "all",
    meta: {
      shiftId,
      guardId,
      guardName,
      calloutId: calloutId || null,
      pendingUntil,
      windowMinutes: mins,
      location: place,
      source: source || "accept_shift",
      action: "override_accept",
    },
  });
}

/**
 * Finalize expired (or force) pending accepts → CLOSED + guard_id.
 */
async function finalizePendingAccepts(app, { shiftId = null, force = false } = {}) {
  const sequelize = app.locals.models?.sequelize;
  if (!sequelize) return { finalized: 0, shifts: [] };
  if (!(await columnsReady(sequelize))) return { finalized: 0, shifts: [] };

  const bind = [];
  let where = `
    pending_guard_id IS NOT NULL
    AND UPPER(TRIM(status::text)) = 'OPEN'
    AND guard_id IS NULL
  `;
  if (shiftId) {
    bind.push(shiftId);
    where += ` AND id = $${bind.length}::uuid`;
  }
  if (!force) {
    where += ` AND accept_pending_until IS NOT NULL AND accept_pending_until <= NOW()`;
  }

  const [candidates] = await sequelize.query(
    `SELECT id, pending_guard_id, tenant_id, location, accept_source, accept_pending_until
     FROM public.shifts WHERE ${where}`,
    { bind }
  );

  const finalized = [];
  for (const c of candidates || []) {
    const [upd] = await sequelize.query(
      `
      UPDATE public.shifts
      SET guard_id = pending_guard_id,
          status = 'CLOSED',
          pending_guard_id = NULL,
          accept_pending_until = NULL
      WHERE id = $1::uuid
        AND pending_guard_id IS NOT NULL
        AND UPPER(TRIM(status::text)) = 'OPEN'
        AND guard_id IS NULL
      RETURNING *
      `,
      { bind: [c.id] }
    );
    const row = upd?.[0];
    if (!row) continue;
    finalized.push(row);

    try {
      const { notifyCalloutAccepted } = require("./calloutAcceptNotification.service");
      await notifyCalloutAccepted(app, {
        shiftId: row.id,
        guardId: row.guard_id,
        response: "ACCEPTED",
        filled: true,
      });
    } catch (_) {
      /* non-fatal */
    }

    await notifyGuardAcceptOutcome(app, {
      guardId: row.guard_id,
      shift: row,
      outcome: "confirmed",
    });

    const emit = app.locals.emitToRealtime;
    if (typeof emit === "function") {
      emit(app, "role:all", "shift_filled", {
        shiftId: row.id,
        guardId: row.guard_id,
        tenant_id: row.tenant_id,
        location: row.location,
        filledAt: new Date().toISOString(),
        source: row.accept_source || "pending_finalize",
      }).catch(() => {});
    }
  }

  return { finalized: finalized.length, shifts: finalized };
}

/**
 * Admin/supervisor override during pending window.
 * body: { action: 'reassign'|'reject'|'confirm', guardId?, reason? }
 */
async function overridePendingAccept(app, {
  shiftId,
  adminId,
  action = "reassign",
  guardId = null,
  reason = null,
}) {
  const sequelize = app.locals.models?.sequelize;
  if (!sequelize) throw new Error("Database not available");
  if (!isUUID(shiftId)) {
    const err = new Error("Invalid shift id");
    err.status = 400;
    throw err;
  }
  if (!(await columnsReady(sequelize))) {
    const err = new Error("Pending accept columns missing — run migration");
    err.status = 503;
    throw err;
  }

  const [rows] = await sequelize.query(
    `SELECT * FROM public.shifts WHERE id = $1::uuid LIMIT 1`,
    { bind: [shiftId] }
  );
  const shift = rows?.[0];
  if (!shift) {
    const err = new Error("Shift not found");
    err.status = 404;
    throw err;
  }
  if (!shift.pending_guard_id) {
    const err = new Error("No pending accept on this shift");
    err.status = 409;
    throw err;
  }

  const act = String(action || "reassign").toLowerCase();
  const originalPending = shift.pending_guard_id;
  const aiPrev = shift.ai_decision && typeof shift.ai_decision === "object" ? shift.ai_decision : {};
  const overrideMeta = {
    ...aiPrev,
    accept_overridden: true,
    accept_overridden_by: adminId || null,
    accept_overridden_at: new Date().toISOString(),
    accept_override_reason: reason || "Admin override",
    accept_override_action: act,
    original_pending_guard_id: originalPending,
  };

  if (act === "confirm") {
    const result = await finalizePendingAccepts(app, { shiftId, force: true });
    try {
      const { emitAuditEvent } = require("./auditEvent.service");
      await emitAuditEvent(app, {
        tenantId: shift.tenant_id || null,
        actorType: "admin",
        actorId: adminId != null ? String(adminId) : null,
        action: "shift.accept_confirm",
        entityType: "shift",
        entityId: shiftId,
        summary: "Admin confirmed pending accept",
        before: { pendingGuardId: originalPending },
        after: { action: "confirm" },
        meta: { reason: reason || null },
      });
    } catch (_) {
      /* non-fatal */
    }
    return { action: "confirm", ...result, shift: result.shifts?.[0] || null };
  }

  if (act === "reject") {
    const [upd] = await sequelize.query(
      `
      UPDATE public.shifts
      SET pending_guard_id = NULL,
          accept_pending_until = NULL,
          accepted_at = NULL,
          accept_source = NULL,
          ai_decision = $1::jsonb,
          status = 'OPEN',
          guard_id = NULL
      WHERE id = $2::uuid
      RETURNING *
      `,
      { bind: [JSON.stringify(overrideMeta), shiftId] }
    );
    const row = upd?.[0];
    const emit = app.locals.emitToRealtime;
    if (typeof emit === "function") {
      emit(app, "role:all", "shift_accept_overridden", {
        shiftId,
        action: "reject",
        originalPendingGuardId: originalPending,
        reason: reason || "Admin override",
      }).catch(() => {});
    }
    await notify(app, {
      type: "SHIFT_ACCEPT_OVERRIDDEN",
      title: "Shift accept overridden",
      message: `Pending accept rejected — shift remains open.`,
      entityType: "shift",
      entityId: String(shiftId),
      audience: "all",
      meta: { shiftId, action: "reject", originalPendingGuardId: originalPending, reason },
    });
    await notifyGuardAcceptOutcome(app, {
      guardId: originalPending,
      shift: { ...shift, ...(row || {}) },
      outcome: "rejected",
      reason: reason || "Admin override",
    });
    try {
      const { emitAuditEvent } = require("./auditEvent.service");
      await emitAuditEvent(app, {
        tenantId: shift.tenant_id || null,
        actorType: "admin",
        actorId: adminId != null ? String(adminId) : null,
        action: "shift.accept_reject",
        entityType: "shift",
        entityId: shiftId,
        summary: "Admin rejected pending accept — shift left OPEN",
        before: { pendingGuardId: originalPending },
        after: { action: "reject", status: "OPEN" },
        meta: { reason: reason || null },
      });
    } catch (_) {
      /* non-fatal */
    }
    return { action: "reject", shift: row };
  }

  // reassign
  if (!guardId || !isUUID(guardId)) {
    const err = new Error("guardId required to reassign");
    err.status = 400;
    throw err;
  }
  overrideMeta.override_guard_id = guardId;

  const [upd] = await sequelize.query(
    `
    UPDATE public.shifts
    SET guard_id = $1::uuid,
        status = 'CLOSED',
        pending_guard_id = NULL,
        accept_pending_until = NULL,
        ai_decision = $2::jsonb
    WHERE id = $3::uuid
    RETURNING *
    `,
    { bind: [guardId, JSON.stringify(overrideMeta), shiftId] }
  );
  const row = upd?.[0];

  try {
    const { notifyCalloutAccepted } = require("./calloutAcceptNotification.service");
    await notifyCalloutAccepted(app, {
      shiftId,
      guardId,
      response: "ACCEPTED",
      filled: true,
    });
  } catch (_) {
    /* non-fatal */
  }

  // Notify original pending guard they lost it; notify new assignee
  if (String(originalPending) !== String(guardId)) {
    await notifyGuardAcceptOutcome(app, {
      guardId: originalPending,
      shift: { ...shift, ...(row || {}) },
      outcome: "reassigned_away",
      reason: reason || "Admin override",
    });
  }
  await notifyGuardAcceptOutcome(app, {
    guardId,
    shift: { ...shift, ...(row || {}) },
    outcome: String(originalPending) === String(guardId) ? "confirmed" : "assigned",
    reason: reason || null,
  });

  const emit = app.locals.emitToRealtime;
  if (typeof emit === "function") {
    emit(app, "role:all", "shift_filled", {
      shiftId,
      guardId,
      source: "accept_override_reassign",
      originalPendingGuardId: originalPending,
    }).catch(() => {});
    emit(app, "role:all", "shift_accept_overridden", {
      shiftId,
      action: "reassign",
      guardId,
      originalPendingGuardId: originalPending,
      reason: reason || "Admin override",
    }).catch(() => {});
  }

  try {
    const { emitAuditEvent } = require("./auditEvent.service");
    await emitAuditEvent(app, {
      tenantId: shift.tenant_id || null,
      actorType: "admin",
      actorId: adminId != null ? String(adminId) : null,
      action: "shift.accept_reassign",
      entityType: "shift",
      entityId: shiftId,
      summary: "Admin reassigned shift during pending-accept window",
      before: { pendingGuardId: originalPending },
      after: { guardId, status: "CLOSED" },
      meta: { reason: reason || null },
    });
  } catch (_) {
    /* non-fatal */
  }

  return { action: "reassign", shift: row };
}

async function listPendingAccepts(sequelize, { tenantId = null } = {}) {
  if (!sequelize || !(await columnsReady(sequelize))) return [];
  const bind = [];
  let tenantSql = "";
  if (tenantId && isUUID(tenantId)) {
    bind.push(tenantId);
    tenantSql = ` AND s.tenant_id = $${bind.length}::uuid`;
  }
  const [rows] = await sequelize.query(
    `
    SELECT s.id, s.tenant_id, s.location, s.shift_date, s.shift_start, s.shift_end,
           s.status, s.pending_guard_id, s.accept_pending_until, s.accepted_at, s.accept_source,
           g.name AS pending_guard_name, g.email AS pending_guard_email, g.phone AS pending_guard_phone
    FROM public.shifts s
    LEFT JOIN guards g ON g.id = s.pending_guard_id
    WHERE s.pending_guard_id IS NOT NULL
      AND UPPER(TRIM(s.status::text)) = 'OPEN'
      ${tenantSql}
    ORDER BY s.accept_pending_until ASC NULLS LAST
    LIMIT 100
    `,
    { bind }
  );
  return (rows || []).map((r) => ({
    ...r,
    windowMinutes: overrideWindowMinutes(),
    secondsRemaining: r.accept_pending_until
      ? Math.max(0, Math.floor((new Date(r.accept_pending_until) - Date.now()) / 1000))
      : null,
  }));
}

module.exports = {
  beginPendingAccept,
  finalizePendingAccepts,
  overridePendingAccept,
  listPendingAccepts,
  notifyAcceptPending,
  overrideWindowMinutes,
  columnsReady,
};
