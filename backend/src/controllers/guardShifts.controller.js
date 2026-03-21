/**
 * Guard-facing shift list + shift state (guard-ui Home).
 * Do not use GET /shifts — that route is admin-only on this backend.
 */
const { getGuardTenantSqlFilter } = require("../utils/guardTenantFilter");

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
      WHERE (status = 'OPEN' OR guard_id = $1::uuid) ${tenantSql}
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
