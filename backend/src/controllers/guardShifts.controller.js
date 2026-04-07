/**
 * Guard-facing shift list + shift state (guard-ui Home).
 * Do not use GET /shifts — that route is admin-only on this backend.
 */
const { getGuardTenantSqlFilter } = require("../utils/guardTenantFilter");

function isUUID(v) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(v || "").trim()
  );
}

exports.listGuardShifts = async (req, res) => {
  try {
    const guardId = req.guard?.id;
    if (!guardId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const sequelize = req.app.locals.models?.sequelize;
    if (!sequelize) {
      return res.status(500).json({ message: "Database not available" });
    }

    const user = { id: guardId, tenant_id: req.guard?.tenant_id || null };
    const params = [guardId];
    const tenantFilter = getGuardTenantSqlFilter(user, params);
    const tenantSql = tenantFilter ? `AND ${tenantFilter}` : "";

    const sql = `
      SELECT id, tenant_id, guard_id, shift_date, shift_start, shift_end, status, location,
             created_at, notes, ai_decision
      FROM public.shifts
      -- Only show shifts the guard can act on:
      -- - assigned to this guard (any status)
      -- - open AND unassigned (guard can claim on clock-in)
      WHERE ((guard_id = $1::uuid) OR (status = 'OPEN' AND guard_id IS NULL)) ${tenantSql}
      ORDER BY shift_date NULLS LAST, shift_start NULLS LAST`;

    const [rows] = await sequelize.query(sql, { bind: params });
    const list = Array.isArray(rows) ? rows : [];
    return res.json(list);
  } catch (e) {
    console.error("listGuardShifts:", e);
    return res.status(500).json({ message: "Server error", error: e.message });
  }
};

/**
 * Match guard-ui / abe-guard-ai shift state shape for Home.jsx
 */
exports.getGuardShiftState = async (req, res) => {
  try {
    const { shiftId } = req.params;
    const guardId = req.guard?.id;
    if (!shiftId) return res.status(400).json({ message: "Missing shiftId" });
    if (!guardId) return res.status(401).json({ message: "Missing guard identity (auth)" });

    const sequelize = req.app.locals.models?.sequelize;
    if (!sequelize) {
      return res.status(500).json({ message: "Database not available" });
    }

    let shiftSql = `SELECT id, guard_id, status, tenant_id FROM public.shifts s WHERE s.id = $1::uuid`;
    const shiftBind = [shiftId];
    if (req.guard?.tenant_id) {
      shiftBind.push(req.guard.tenant_id);
      shiftSql += ` AND s.tenant_id = $2::uuid`;
    }

    const [shiftRows] = await sequelize.query(shiftSql + ` LIMIT 1`, { bind: shiftBind });
    const shift = Array.isArray(shiftRows) ? shiftRows[0] : null;
    if (!shift) {
      return res.status(404).json({ message: "Shift not found" });
    }

    const sg = shift.guard_id != null ? String(shift.guard_id) : "";
    const gid = String(guardId);
    const st = String(shift.status || "").toUpperCase();
    const canSee = st === "OPEN" || sg === gid;
    if (!canSee) {
      return res.status(403).json({ message: "Not allowed for this shift" });
    }

    let te = null;
    try {
      const bind = [shiftId, guardId];
      const [teRows] = await sequelize.query(
        `SELECT id, shift_id, guard_id, clock_in_at, clock_out_at, lunch_start_at, lunch_end_at
         FROM public.time_entries
         WHERE shift_id = $1::uuid AND guard_id = $2::uuid
         LIMIT 1`,
        { bind }
      );
      te = Array.isArray(teRows) && teRows[0] ? teRows[0] : null;
    } catch (err) {
      if (!String(err.message || "").includes("does not exist")) {
        console.warn("getGuardShiftState time_entries:", err.message);
      }
    }

    const hasClockIn = Boolean(te?.clock_in_at);
    const hasClockOut = Boolean(te?.clock_out_at);
    const isCurrentlyClockedOut =
      hasClockOut && hasClockIn && new Date(te.clock_out_at) >= new Date(te.clock_in_at);
    const isOnBreak = Boolean(te?.lunch_start_at && !te?.lunch_end_at);
    const isCurrentlyClockedIn = hasClockIn && !isCurrentlyClockedOut;

    const state = {
      ok: true,
      timeEntry: te || null,
      events: [],
      clockedIn: isCurrentlyClockedIn,
      clocked_in: isCurrentlyClockedIn,
      clockedOut: isCurrentlyClockedOut,
      clocked_out: isCurrentlyClockedOut,
      onBreak: isOnBreak,
      on_break: isOnBreak,
      status: isCurrentlyClockedOut
        ? "CLOCKED_OUT"
        : isOnBreak
          ? "ON_BREAK"
          : isCurrentlyClockedIn
            ? "CLOCKED_IN"
            : "NOT_STARTED",
      clockInAt: te?.clock_in_at || null,
      clockOutAt: te?.clock_out_at || null,
      lunchStartAt: te?.lunch_start_at || null,
      lunchEndAt: te?.lunch_end_at || null,
    };

    return res.json(state);
  } catch (e) {
    console.error("getGuardShiftState:", e);
    return res.status(500).json({ message: "Server error", error: e.message });
  }
};

/**
 * Claim an OPEN shift (Shifts page). Same contract as abe-guard-ai POST /shifts/accept/:shiftId.
 * Unified Railway host exposes POST /api/guard/shifts/:shiftId/accept and POST /shifts/accept/:shiftId.
 */
exports.acceptGuardShift = async (req, res) => {
  try {
    const shiftId = String(req.params.shiftId || "").trim();
    const guardId = req.guard?.id;
    if (!shiftId) {
      return res.status(400).json({ error: "Missing shiftId" });
    }
    if (!guardId) {
      return res.status(401).json({ error: "Unauthorized (missing guard)" });
    }
    if (!isUUID(shiftId)) {
      return res.status(400).json({ error: "Invalid shiftId" });
    }
    if (!isUUID(String(guardId))) {
      return res.status(401).json({ error: "Unauthorized (missing guardId)" });
    }

    const sequelize = req.app.locals.models?.sequelize;
    if (!sequelize) {
      return res.status(500).json({ message: "Database not available" });
    }

    const [foundRows] = await sequelize.query(
      `SELECT id, guard_id, status, tenant_id, shift_date, shift_start, shift_end, location
       FROM public.shifts WHERE id = $1::uuid LIMIT 1`,
      { bind: [shiftId] }
    );
    const shift = Array.isArray(foundRows) ? foundRows[0] : null;
    if (!shift) {
      return res.status(404).json({ error: "Shift not found" });
    }

    const guardTenant = req.guard?.tenant_id || null;
    const shiftTenant = shift.tenant_id != null ? String(shift.tenant_id) : null;
    if (guardTenant && shiftTenant && String(guardTenant) !== shiftTenant) {
      return res.status(403).json({
        error: "Access denied - shift belongs to different tenant",
      });
    }

    const st = String(shift.status || "").toUpperCase();
    if (st !== "OPEN") {
      return res.status(409).json({
        error: "Shift already taken",
        shiftId: shift.id,
        status: shift.status,
        currentGuardId: shift.guard_id,
      });
    }

    const [upd] = await sequelize.query(
      `UPDATE public.shifts
       SET guard_id = $1::uuid, status = 'CLOSED'
       WHERE id = $2::uuid AND UPPER(TRIM(status::text)) = 'OPEN'
       RETURNING id, guard_id, status, tenant_id, location, shift_date, shift_start, shift_end`,
      { bind: [guardId, shiftId] }
    );
    const updated = Array.isArray(upd) ? upd[0] : null;
    if (!updated) {
      return res.status(409).json({
        error: "Shift already taken",
        shiftId,
      });
    }

    const emitToRealtime = req.app.locals.emitToRealtime;
    if (emitToRealtime) {
      emitToRealtime(req.app, "role:all", "shift_filled", {
        shift: updated,
        shiftId: updated.id,
        guardId,
        tenant_id: updated.tenant_id,
        location: updated.location,
        filledAt: new Date().toISOString(),
        source: "accept_shift",
      }).catch(() => {});
    }

    return res.json({
      success: true,
      message: "Shift accepted",
      shiftId: updated.id,
      assignedGuardId: guardId,
      status: "CLOSED",
    });
  } catch (e) {
    console.error("acceptGuardShift:", e);
    return res.status(500).json({ error: "Server error", message: e.message });
  }
};
