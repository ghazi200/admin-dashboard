// backend/src/controllers/adminDashboard.controllers.js
const { Op } = require("sequelize");
const { getTenantSqlFilter, getTenantWhere, getTenantFilter } = require("../utils/tenantFilter");

// --- small date helpers ---
function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function fmtDay(d) {
  const x = new Date(d);
  const y = x.getFullYear();
  const m = String(x.getMonth() + 1).padStart(2, "0");
  const day = String(x.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Cap for Live Callouts name list (UI shows newest; oldest drop off). */
const LIVE_CALLOUTS_DISPLAY_LIMIT = 6;

/**
 * ✅ GET /api/admin/dashboard/live-callouts
 * One row per callout event showing the *caller* (who called out), not each
 * notified replacement. Newest first; limited to LIVE_CALLOUTS_DISPLAY_LIMIT.
 */
exports.getLiveCallouts = async (req, res) => {
  try {
    const { sequelize } = req.app.locals.models;

    // callouts.guard_id = notified replacement; caller is in ai_decisions.decision_json
    const params = [];
    const tenantId = getTenantFilter(req.admin);
    // Live = callouts for shifts still OPEN (filled shifts drop off the list).
    const whereParts = [`UPPER(TRIM(COALESCE(s.status, ''))) = 'OPEN'`];
    if (tenantId !== null) {
      params.push(tenantId);
      whereParts.push(
        `(c.tenant_id = $1 OR s.tenant_id = $1 OR ng.tenant_id = $1 OR cg.tenant_id = $1)`
      );
    }
    const tenantSql = whereParts.length ? `WHERE ${whereParts.join(" AND ")}` : "";

    const [rows] = await sequelize.query(
      `
      WITH events AS (
        SELECT
          c.id,
          c.guard_id AS notified_guard_id,
          c.reason,
          c.created_at,
          c.shift_id,
          c.tenant_id,
          ai.caller_guard_id,
          ROW_NUMBER() OVER (
            PARTITION BY
              c.shift_id,
              COALESCE(c.reason, ''),
              -- Bucket ~30s so multi-guard notify rows land as one event
              (FLOOR(EXTRACT(EPOCH FROM c.created_at) / 30))
            ORDER BY c.created_at ASC, c.id ASC
          ) AS rn
        FROM callouts c
        LEFT JOIN shifts s ON c.shift_id = s.id
        LEFT JOIN guards ng ON c.guard_id = ng.id
        LEFT JOIN LATERAL (
          SELECT (d.decision_json->>'callerGuardId')::uuid AS caller_guard_id
          FROM ai_decisions d
          WHERE d.shift_id = c.shift_id
            AND NULLIF(d.decision_json->>'callerGuardId', '') IS NOT NULL
          ORDER BY ABS(EXTRACT(EPOCH FROM (d.created_at - c.created_at))) ASC
          LIMIT 1
        ) ai ON true
        LEFT JOIN guards cg ON cg.id = ai.caller_guard_id
        ${tenantSql}
      )
      SELECT
        x.id,
        x.notified_guard_id,
        x.reason,
        x.created_at,
        x.shift_id,
        x.tenant_id,
        x.caller_guard_id,
        cg.name AS caller_name,
        cg.email AS caller_email,
        ng.name AS notified_name,
        ng.email AS notified_email
      FROM (
        SELECT
          e.*,
          ROW_NUMBER() OVER (
            PARTITION BY e.shift_id
            ORDER BY e.created_at DESC, e.id DESC
          ) AS shift_rn
        FROM events e
        WHERE e.rn = 1
      ) x
      LEFT JOIN guards cg ON cg.id = x.caller_guard_id
      LEFT JOIN guards ng ON ng.id = x.notified_guard_id
      WHERE x.shift_rn = 1
      ORDER BY x.created_at DESC
      LIMIT 200
    `,
      { bind: params }
    );

    let dbName = null;
    try {
      const [dbRows] = await sequelize.query(`SELECT current_database() AS db`);
      dbName = dbRows?.[0]?.db || null;
    } catch (_) {
      /* ignore */
    }

    const displayNameFor = (name, email, id) => {
      const short = id ? String(id).substring(0, 8) : "Unknown";
      return (
        (name && String(name).trim()) ||
        (email && String(email).trim()) ||
        `Guard ${short}`
      );
    };

    // Prefer caller (who called out); fall back to notified guard only if unknown
    const callouts = rows.map((c) => {
      const callerId = c.caller_guard_id || null;
      const displayId = callerId || c.notified_guard_id;
      const displayName = callerId
        ? displayNameFor(c.caller_name, c.caller_email, callerId)
        : displayNameFor(c.notified_name, c.notified_email, c.notified_guard_id);

      return {
        id: c.id,
        guardId: displayId,
        guardName: displayName,
        callerGuardId: callerId,
        reason: c.reason || "No reason",
        contactType: c.reason || "Unknown",
        active: true,
        timestamp: c.created_at,
        createdAt: c.created_at,
        shiftId: c.shift_id || null,
        source: "callouts_table",
      };
    });

    // Keys already shown (shift + reason + second) so notification merge does not duplicate
    const eventKeys = new Set(
      callouts.map((c) => {
        const bucket = c.createdAt
          ? Math.floor(new Date(c.createdAt).getTime() / 30000)
          : 0;
        return `${c.shiftId || ""}|${c.reason || ""}|${bucket}`;
      })
    );
    const shiftsWithDbRows = new Set(
      callouts.map((c) => c.shiftId).filter(Boolean).map((id) => String(id))
    );

    // Bell notifications are written on the admin DB even when abe-guard-ai uses another
    // DATABASE_URL or Callout.create fails — merge recent CALLOUT_CREATED so the KPI matches the inbox.
    let mergedFromNotifications = 0;
    try {
      const { Notification } = req.app.locals.models;
      const notifItems = await Notification.findAll({
        where: { type: "CALLOUT_CREATED" },
        order: [["createdAt", "DESC"]],
        limit: 80,
      });

      const candidates = [];
      for (const n of notifItems) {
        const raw = n.meta;
        const meta = raw && typeof raw === "object" ? raw : {};
        const sid = meta.shiftId ? String(meta.shiftId) : "";
        if (!sid) continue;
        const bucket = n.createdAt
          ? Math.floor(new Date(n.createdAt).getTime() / 30000)
          : 0;
        const key = `${sid}|${meta.reason || "CALLOUT"}|${bucket}`;
        // Skip if this shift already has callout-table events (caller already represented)
        if (shiftsWithDbRows.has(sid) || eventKeys.has(key)) continue;
        candidates.push({ n, sid, meta, key });
      }

      const uniqueSids = [...new Set(candidates.map((c) => c.sid))];
      let tenantByShift = new Map();
      if (uniqueSids.length > 0) {
        const [shiftRows] = await sequelize.query(
          `SELECT id::text AS id, tenant_id::text AS tenant_id FROM shifts WHERE id = ANY($1::uuid[])`,
          { bind: [uniqueSids] }
        );
        tenantByShift = new Map(
          (shiftRows || []).map((r) => [String(r.id), r.tenant_id ? String(r.tenant_id) : null])
        );
      }

      const tenantFilterStr = tenantId !== null ? String(tenantId) : null;
      for (const { n, sid, meta, key } of candidates) {
        if (shiftsWithDbRows.has(sid) || eventKeys.has(key)) continue;
        const shiftTenant = tenantByShift.get(sid);
        if (tenantFilterStr !== null) {
          if (shiftTenant == null || shiftTenant !== tenantFilterStr) continue;
        }
        shiftsWithDbRows.add(sid);
        eventKeys.add(key);
        mergedFromNotifications += 1;
        const gid = meta.guardId ? String(meta.guardId) : null;
        const gshort = gid ? gid.substring(0, 8) : "Unknown";
        callouts.push({
          id: `nf-${n.id}`,
          guardId: gid,
          guardName: meta.guardName || `Guard ${gshort}`,
          callerGuardId: gid,
          reason: meta.reason || "CALLOUT",
          contactType: meta.reason || "Unknown",
          active: true,
          timestamp: n.createdAt,
          createdAt: n.createdAt,
          shiftId: sid,
          source: "notification",
        });
      }

      callouts.sort((a, b) => {
        const ta = new Date(a.createdAt || 0).getTime();
        const tb = new Date(b.createdAt || 0).getTime();
        return tb - ta;
      });
    } catch (mergeErr) {
      console.warn("getLiveCallouts: notification merge skipped:", mergeErr?.message || mergeErr);
    }

    // Newest first; UI shows first LIVE_CALLOUTS_DISPLAY_LIMIT names (oldest drop off the list).
    return res.json({
      data: callouts,
      meta: {
        database: dbName,
        count: callouts.length,
        displayLimit: LIVE_CALLOUTS_DISPLAY_LIMIT,
        fromCalloutsTable: rows.length,
        mergedFromNotifications,
        at: new Date().toISOString(),
      },
    });
  } catch (e) {
    console.error("getLiveCallouts error:", e);
    return res
      .status(500)
      .json({ message: "Failed to load live callouts", error: e.message });
  }
};

/**
 * ✅ GET /api/admin/dashboard/running-late
 * Returns shifts marked as running late with guard names and reasons
 */
exports.getRunningLate = async (req, res) => {
  try {
    const { sequelize } = req.app.locals.models;

    // Query shifts that have running_late flag in ai_decision JSONB
    // ✅ Tenant isolation: Filter by tenant
    const params = [];
    const tenantId = getTenantFilter(req.admin);
    // Fix: Build tenant filter with table alias
    const tenantSql = tenantId ? `AND s.tenant_id = $1` : "";
    if (tenantId) {
      params.push(tenantId);
    }

    const [rows] = await sequelize.query(`
      SELECT 
        s.id,
        s.guard_id,
        s.shift_date,
        s.shift_start,
        s.shift_end,
        s.status,
        s.created_at,
        s.ai_decision
      FROM shifts s
      WHERE s.ai_decision->>'running_late' = 'true'
        ${tenantSql}
      ORDER BY (s.ai_decision->>'marked_late_at') DESC NULLS LAST, s.created_at DESC
      LIMIT 50
    `, { bind: params });

    // Transform to include guard name and reason
    const runningLate = rows.map((s) => {
      const guardIdShort = s.guard_id ? String(s.guard_id).substring(0, 8) : 'Unassigned';
      const lateReason = s.ai_decision?.late_reason || 'Running late';
      const markedAt = s.ai_decision?.marked_late_at || s.created_at;

      return {
        id: s.id,
        guardId: s.guard_id,
        guardName: `Guard ${guardIdShort}`, // Will show guard_id prefix until we can join properly
        reason: lateReason,
        shiftDate: s.shift_date,
        shiftStart: s.shift_start,
        shiftEnd: s.shift_end,
        markedLateAt: markedAt,
        timestamp: markedAt,
      };
    });

    return res.json({ data: runningLate });
  } catch (e) {
    console.error("❌ getRunningLate error:", e);
    console.error("❌ Error stack:", e.stack);
    if (e.sql) {
      console.error("❌ SQL:", e.sql);
      console.error("❌ Parameters:", e.parameters);
    }
    return res
      .status(500)
      .json({ message: "Failed to load running late shifts", error: e.message });
  }
};

/**
 * ✅ GET /api/admin/dashboard/open-shifts
 * Real DB values: status is TEXT with values like OPEN/CLOSED
 */
exports.getOpenShifts = async (req, res) => {
  if (process.env.DEBUG_DASHBOARD) console.log("✅ getOpenShifts HIT — version: abe_guard-aligned");

  try {
    const { sequelize } = req.app.locals.models;

    // Case-insensitive OPEN; tenant admins only see their tenant.
    const params = [];
    const tenantId = getTenantFilter(req.admin);
    let tenantSql = "";
    if (tenantId !== null) {
      params.push(tenantId);
      tenantSql = `AND tenant_id = $${params.length}`;
    }

    const [rows] = await sequelize.query(
      `
      SELECT
        id,
        tenant_id,
        guard_id,
        shift_date,
        shift_start,
        shift_end,
        status,
        created_at,
        ai_decision,
        location
      FROM shifts
      WHERE UPPER(TRIM(status)) = 'OPEN'
        ${tenantSql}
      ORDER BY created_at DESC
      LIMIT 200
      `,
      { bind: params }
    );

    return res.json({ data: rows || [] });
  } catch (e) {
    console.error("❌ getOpenShifts error:", e);
    console.error("❌ Error stack:", e.stack);
    return res
      .status(500)
      .json({ message: "Failed to load open shifts", error: e.message });
  }
};

/** Empty clock-status payload so dashboard never gets 500. */
function emptyClockStatusPayload(message = "Clock status temporarily unavailable") {
  return {
    data: [],
    summary: { clockedIn: 0, onBreak: 0, clockedOut: 0, total: 0 },
    clockedIn: [],
    onBreak: [],
    clockedOut: [],
    message,
  };
}

/**
 * ✅ GET /api/admin/dashboard/clock-status
 * Returns guards who are currently clocked in, on break, or clocked out.
 * On DB/query failure returns 200 with empty data so dashboard does not show 500.
 */
exports.getClockStatus = async (req, res) => {
  try {
    const sequelize = req.app?.locals?.models?.sequelize;
    if (!sequelize) {
      console.warn("getClockStatus: req.app.locals.models.sequelize not set");
      return res.status(200).json(emptyClockStatusPayload("Clock status not available"));
    }

    // Query time_entries to get current clock in/out and break status
    // ✅ Tenant isolation: Filter by tenant through shifts OR guards (handle NULL tenant_id)
    const params = [];
    const tenantId = req.admin?.role === "super_admin" ? null : req.admin?.tenant_id;

    let tenantSql = "";
    if (tenantId) {
      params.push(tenantId);
      params.push(tenantId);
      tenantSql = `AND (s.tenant_id = $${params.length - 1} OR g.tenant_id = $${params.length})`;
    }

    const [rows] = await sequelize.query(
      `
      SELECT 
        te.id,
        te.shift_id,
        te.guard_id,
        te.clock_in_at,
        te.clock_out_at,
        te.lunch_start_at,
        te.lunch_end_at,
        s.shift_date,
        s.shift_start,
        s.shift_end,
        s.location,
        s.tenant_id as shift_tenant_id,
        g.name as guard_name,
        g.email as guard_email,
        g.tenant_id as guard_tenant_id
      FROM time_entries te
      LEFT JOIN shifts s ON te.shift_id = s.id
      LEFT JOIN guards g ON te.guard_id = g.id
      WHERE te.clock_in_at IS NOT NULL
        ${tenantSql}
      ORDER BY 
        CASE 
          WHEN te.clock_out_at IS NULL OR te.clock_in_at > te.clock_out_at THEN 0
          ELSE 1
        END,
        te.clock_in_at DESC
      LIMIT 100
    `,
      { bind: params }
    );

    // Transform to include status
    const clockStatus = (rows || []).map((row) => {
      const clockIn = new Date(row.clock_in_at);
      const clockOut = row.clock_out_at ? new Date(row.clock_out_at) : null;
      const isCurrentlyClockedOut = clockOut && clockIn && clockOut.getTime() >= clockIn.getTime();
      const isOnBreak = Boolean(row.lunch_start_at && !row.lunch_end_at);
      const isCurrentlyClockedIn = !isCurrentlyClockedOut;

      return {
        id: row.id,
        shiftId: row.shift_id,
        guardId: row.guard_id,
        guardName: row.guard_name || `Guard ${String(row.guard_id || "").substring(0, 8)}`,
        guardEmail: row.guard_email,
        status: isCurrentlyClockedOut
          ? "CLOCKED_OUT"
          : isOnBreak
            ? "ON_BREAK"
            : isCurrentlyClockedIn
              ? "CLOCKED_IN"
              : "UNKNOWN",
        clockInAt: row.clock_in_at,
        clockOutAt: row.clock_out_at,
        lunchStartAt: row.lunch_start_at,
        lunchEndAt: row.lunch_end_at,
        shiftDate: row.shift_date,
        shiftStart: row.shift_start,
        shiftEnd: row.shift_end,
        location: row.location,
      };
    });

    const clockedIn = clockStatus.filter((s) => s.status === "CLOCKED_IN");
    const onBreak = clockStatus.filter((s) => s.status === "ON_BREAK");
    const clockedOut = clockStatus.filter((s) => s.status === "CLOCKED_OUT");

    return res.json({
      data: clockStatus,
      summary: {
        clockedIn: clockedIn.length,
        onBreak: onBreak.length,
        clockedOut: clockedOut.length,
        total: clockStatus.length,
      },
      clockedIn,
      onBreak,
      clockedOut,
    });
  } catch (e) {
    console.error("getClockStatus error:", e?.message || e);
    console.error("getClockStatus stack:", e?.stack);
    // Return 200 with empty data so dashboard/emergency alert does not break (no 500)
    return res.status(200).json({
      ...emptyClockStatusPayload("Clock status temporarily unavailable"),
      _debug: process.env.NODE_ENV !== "production" ? String(e?.message || e) : undefined,
    });
  }
};

/**
 * ✅ GET /api/admin/dashboard/guard-availability
 */
exports.getGuardAvailability = async (req, res) => {
  try {
    const { Guard, AvailabilityLog, sequelize } = req.app.locals.models;
    const { getTenantWhere, getTenantFilter } = require("../utils/tenantFilter");

    // ✅ Tenant isolation: Apply tenant filter
    const tenantWhere = getTenantWhere(req.admin);
    const whereClause = { active: true };
    if (tenantWhere) {
      Object.assign(whereClause, tenantWhere);
    }

    const debugAvailability = process.env.DEBUG_DASHBOARD_AVAILABILITY === "true";
    if (debugAvailability) {
      console.log("🔍 getGuardAvailability - whereClause:", JSON.stringify(whereClause));
      console.log("🔍 getGuardAvailability - admin role:", req.admin?.role, "tenant_id:", req.admin?.tenant_id);
    }

    // Get all ACTIVE guards only (with tenant filtering)
    // Note: availability is NOT a column in guards table - it comes from AvailabilityLog
    const activeGuards = await Guard.findAll({
      where: whereClause,
      attributes: ['id', 'name', 'active', 'tenant_id'],
    });

    if (debugAvailability) {
      console.log("🔍 getGuardAvailability - found activeGuards:", activeGuards.length);
      console.log("🔍 getGuardAvailability - activeGuards sample:", activeGuards.slice(0, 3).map(g => ({ id: g.id, name: g.name, active: g.active, tenant_id: g.tenant_id })));
    }

    const totalWhere = tenantWhere || {};
    const total = await Guard.count({ where: totalWhere });
    const active = activeGuards.length;
    
    if (debugAvailability) console.log("🔍 getGuardAvailability - total:", total, "active:", active);

    if (active === 0) {
      return res.json({
        total,
        active: 0,
        available: 0,
        unavailable: 0,
      });
    }

    // Get availability from AvailabilityLog
    // Note: There's a schema mismatch - AvailabilityLog.guardId is INTEGER but Guard.id is UUID
    // We need to convert UUID to integer using the same hash function as updateGuardAvailability
    const crypto = require('crypto');
    
    // Get most recent availability log per guard
    // Use a longer time window (90 days) to catch guards that were inactive and became active again
    // This ensures guards that were temporarily inactive still have their availability status
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    
    // Also get logs from the last hour to catch very recent updates
    const oneHourAgo = new Date();
    oneHourAgo.setHours(oneHourAgo.getHours() - 1);

    if (debugAvailability) console.log("🔍 getGuardAvailability - Querying logs from:", ninetyDaysAgo.toISOString());

    // Get tenant filter
    const tenantId = getTenantFilter(req.admin);

    // Get list of guard UUIDs that belong to this tenant (already filtered in activeGuards)
    const guardUuids = activeGuards.map(g => g.id);

    if (debugAvailability) console.log("🔍 getGuardAvailability - tenantId:", tenantId, "guardUuids count:", guardUuids.length);

    if (guardUuids.length === 0) {
      return res.json({
        total: total,
        active: 0,
        available: 0,
        unavailable: 0,
      });
    }
    
    const guardIdInts = guardUuids.map((uuid) => {
      const hash = crypto.createHash("md5").update(String(uuid)).digest("hex");
      return parseInt(hash.substring(0, 8), 16) % 2147483647;
    });

    if (debugAvailability) console.log("🔍 getGuardAvailability - guardIdInts sample:", guardIdInts.slice(0, 5));

    let recentLogs = [];
    let allLogs = [];
    let veryRecentLogs = [];
    try {
      const [r1] = await sequelize.query(
        `SELECT DISTINCT ON ("guardId") "guardId", "to"::boolean as is_available, "createdAt"
         FROM availability_logs WHERE "createdAt" >= $1 AND "guardId" = ANY($2::int[])
         ORDER BY "guardId", "createdAt" DESC`,
        { bind: [ninetyDaysAgo, guardIdInts] }
      );
      recentLogs = r1 || [];
      const [r2] = await sequelize.query(
        `SELECT DISTINCT ON ("guardId") "guardId", "to"::boolean as is_available, "createdAt"
         FROM availability_logs WHERE "guardId" = ANY($1::int[])
         ORDER BY "guardId", "createdAt" DESC`,
        { bind: [guardIdInts] }
      );
      allLogs = r2 || [];
      const fiveMinutesAgo = new Date();
      fiveMinutesAgo.setMinutes(fiveMinutesAgo.getMinutes() - 5);
      const [r3] = await sequelize.query(
        `SELECT DISTINCT ON ("guardId") "guardId", "to"::boolean as is_available, "createdAt"
         FROM availability_logs WHERE "createdAt" >= $1 AND "guardId" = ANY($2::int[])
         ORDER BY "guardId", "createdAt" DESC`,
        { bind: [fiveMinutesAgo, guardIdInts] }
      );
      veryRecentLogs = r3 || [];
    } catch (sqlErr) {
      console.warn("getGuardAvailability: availability_logs query failed, defaulting all active to available:", sqlErr.message);
      return res.json({ total, active, available: active, unavailable: 0 });
    }

    if (debugAvailability) {
      console.log(
        "🔍 getGuardAvailability - Recent:",
        recentLogs.length,
        "All:",
        allLogs.length,
        "Very recent:",
        veryRecentLogs.length
      );
    }

    // Create a map of integer guardId -> availability (same hash function as updateGuardAvailability)
    const availabilityByIntId = new Map();

    allLogs.forEach((log) => {
      availabilityByIntId.set(Number(log.guardId), Boolean(log.is_available));
    });
    recentLogs.forEach((log) => {
      availabilityByIntId.set(Number(log.guardId), Boolean(log.is_available));
    });
    veryRecentLogs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    veryRecentLogs.forEach((log) => {
      availabilityByIntId.set(Number(log.guardId), Boolean(log.is_available));
    });

    if (debugAvailability) {
      console.log("🔍 getGuardAvailability - Map size:", availabilityByIntId.size);
    }

    // Match each active guard with their availability by hashing their UUID
    let available = 0;
    let unavailable = 0;
    const unmatchedGuards = [];

    activeGuards.forEach((guard) => {
      const hash = crypto.createHash("md5").update(String(guard.id)).digest("hex");
      const guardIdInt = parseInt(hash.substring(0, 8), 16) % 2147483647;
      const availability = availabilityByIntId.get(guardIdInt);
      const boolAvailability = availability === true || availability === 'true' || availability === 1;
      const boolUnavailable = availability === false || availability === 'false' || availability === 0;

      if (boolAvailability) {
        available++;
      } else if (boolUnavailable) {
        unavailable++;
      } else {
        available++;
        unmatchedGuards.push({ id: guard.id, name: guard.name, guardIdInt });
      }
    });

    if (debugAvailability && unmatchedGuards.length > 0) {
      console.log("🔍 getGuardAvailability - unmatched (defaulted to available):", unmatchedGuards.length);
    }

    return res.json({
      total,
      active,
      available,
      unavailable,
    });
  } catch (e) {
    console.error("getGuardAvailability error:", e);
    return res
      .status(500)
      .json({ message: "Failed to load guard availability", error: e.message });
  }
};

/**
 * ✅ GET /api/admin/dashboard/stats?days=7
 * Uses abe_guard schema: shifts.created_at + shift_date
 */
exports.getStats = async (req, res) => {
  try {
    const { Shift, CallOut, Guard, AvailabilityLog } = req.app.locals.models;

    const days = Math.max(1, Math.min(30, Number(req.query.days || 7)));
    const today = startOfDay(new Date());
    const start = addDays(today, -(days - 1));
    const end = addDays(today, 1); // exclusive

    const labels = [];
    const openShiftsByDay = Array(days).fill(0);
    const calloutsByDay = Array(days).fill(0);
    const availableGuardsByDay = Array(days).fill(0);
    const availabilityEventsByDay = Array(days).fill(0);

    for (let i = 0; i < days; i++) labels.push(fmtDay(addDays(start, i)));

    const indexFor = (date) => {
      const d0 = startOfDay(date);
      return Math.floor((d0 - start) / (24 * 60 * 60 * 1000));
    };

    // Open shifts grouped by created_at (reliable)
    const shifts = await Shift.findAll({
      where: {
        status: "OPEN",
        created_at: { [Op.gte]: start, [Op.lt]: end },
      },
      attributes: ["created_at"],
    });

    for (const s of shifts) {
      const idx = indexFor(new Date(s.created_at));
      if (idx >= 0 && idx < days) openShiftsByDay[idx] += 1;
    }

    // Callouts grouped by createdAt
    const callouts = await CallOut.findAll({
      where: { createdAt: { [Op.gte]: start, [Op.lt]: end } },
      attributes: ["createdAt"],
    });

    for (const c of callouts) {
      const idx = indexFor(new Date(c.createdAt));
      if (idx >= 0 && idx < days) calloutsByDay[idx] += 1;
    }

    // Availability snapshot for now
    // Note: availability field doesn't exist, so we'll use active guards as available
    // In a real implementation, this would check AvailabilityLog
    const availableNow = await Guard.count({
      where: { active: true },
    });
    for (let i = 0; i < days; i++) availableGuardsByDay[i] = availableNow;

    // Availability events by day (optional)
    const logs = await AvailabilityLog.findAll({
      where: {
        field: "availability",
        createdAt: { [Op.gte]: start, [Op.lt]: end },
      },
      attributes: ["createdAt"],
      order: [["createdAt", "ASC"]],
    });

    for (const l of logs) {
      const idx = indexFor(new Date(l.createdAt));
      if (idx >= 0 && idx < days) availabilityEventsByDay[idx] += 1;
    }

    return res.json({
      days,
      labels,
      openShiftsByDay,
      calloutsByDay,
      availableGuardsByDay,
      availabilityEventsByDay,
    });
  } catch (e) {
    return res
      .status(500)
      .json({ message: "Failed to load dashboard stats", error: e.message });
  }
};

/**
 * ✅ GET /api/admin/dashboard/active-emergencies
 * Get active emergency SOS events.
 * On DB/query failure returns 200 with empty data so dashboard does not show 500.
 */
exports.getActiveEmergencies = async (req, res) => {
  try {
    const sequelize = req.app?.locals?.models?.sequelize;
    if (!sequelize) {
      console.warn("getActiveEmergencies: req.app.locals.models.sequelize not set");
      return res.status(200).json({ data: [] });
    }

    const params = [];
    const tenantId = getTenantFilter(req.admin);
    const tenantSql = tenantId ? `AND ee.tenant_id = $1` : "";
    if (tenantId) params.push(tenantId);

    if (process.env.DEBUG_DASHBOARD) {
      console.log("🔍 getActiveEmergencies - tenantId:", tenantId);
      console.log("🔍 getActiveEmergencies - tenantSql:", tenantSql);
      console.log("🔍 getActiveEmergencies - params:", params);
    }

    let rows = [];
    try {
      [rows] = await sequelize.query(
        `
        SELECT 
          ee.id,
          ee.guard_id,
          ee.tenant_id,
          ee.supervisor_id,
          ee.latitude,
          ee.longitude,
          ee.accuracy,
          ee.status,
          ee.activated_at,
          ee.resolved_at,
          ee.notes as resolution_notes,
          ee.resolved_by,
          g.name as guard_name,
          g.email as guard_email
        FROM emergency_events ee
        LEFT JOIN guards g ON g.id::text = ee.guard_id::text
        WHERE ee.status = 'active'
          ${tenantSql}
        ORDER BY ee.activated_at DESC
        LIMIT 50
      `,
        { bind: params }
      );
      if (process.env.DEBUG_DASHBOARD) console.log("✅ getActiveEmergencies - found rows:", rows.length);
    } catch (queryError) {
      console.error("❌ getActiveEmergencies SQL error:", queryError?.message || queryError);
      return res.status(200).json({ data: [] });
    }

    const emergencies = (rows || []).map((e) => ({
      id: e.id,
      emergencyEventId: e.id,
      guardId: e.guard_id,
      guardName: e.guard_name || e.guard_email || `Guard ${String(e.guard_id || "").substring(0, 8)}`,
      tenantId: e.tenant_id,
      supervisorId: e.supervisor_id,
      location:
        e.latitude && e.longitude
          ? {
              lat: parseFloat(e.latitude),
              lng: parseFloat(e.longitude),
              accuracy: e.accuracy ? parseFloat(e.accuracy) : null,
            }
          : null,
      status: e.status,
      activatedAt: e.activated_at,
      resolvedAt: e.resolved_at,
      resolutionNotes: e.resolution_notes,
      timestamp: e.activated_at,
    }));

    return res.json({ data: emergencies });
  } catch (e) {
    console.error("❌ getActiveEmergencies error:", e?.message || e);
    return res.status(200).json({ data: [] });
  }
};

/**
 * ✅ POST /api/admin/dashboard/resolve-emergency/:id
 * Resolve/clear an emergency SOS event
 */
exports.resolveEmergency = async (req, res) => {
  try {
    const { sequelize } = req.app.locals.models;
    const { id } = req.params;
    const { resolutionNotes } = req.body;
    const adminId = req.admin?.id;

    console.log("🔍 resolveEmergency - id:", id);
    console.log("🔍 resolveEmergency - resolutionNotes:", resolutionNotes);
    console.log("🔍 resolveEmergency - adminId:", adminId);

    if (!id) {
      return res.status(400).json({ message: "Emergency ID is required" });
    }

    // ✅ Tenant isolation: Only allow resolving emergencies in admin's tenant
    const tenantId = getTenantFilter(req.admin);
    
    // Fix: resolved_by is UUID, but adminId might be integer
    // Check if adminId is a valid UUID, otherwise set to null
    const isUUID = (v) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(v || "").trim());
    const resolvedBy = adminId && isUUID(adminId) ? adminId : null;
    
    // Build bind params array - tenant_id goes at the end if needed
    const bindParams = [
      id, // $1
      resolutionNotes || `Resolved by admin ${adminId || 'unknown'}`, // $2
      resolvedBy // $3 - must be UUID or null
    ];
    
    // Fix: Use table alias to avoid ambiguity - tenant_id is $4 if present
    // But we need to add it to bindParams BEFORE building the SQL string
    let tenantSql = "";
    if (tenantId) {
      bindParams.push(tenantId); // $4
      tenantSql = `AND tenant_id = $${bindParams.length}`; // Use the actual index
    }

    console.log("🔍 resolveEmergency - tenantId:", tenantId);
    console.log("🔍 resolveEmergency - tenantSql:", tenantSql);
    console.log("🔍 resolveEmergency - bindParams:", bindParams);
    console.log("🔍 resolveEmergency - bindParams length:", bindParams.length);

    // Update emergency event status to 'resolved'
    // Note: column is 'notes' not 'resolution_notes', and 'resolved_by' not 'resolution_notes'
    let updated;
    
    // First, check if emergency exists and belongs to the tenant
    const [checkRows] = await sequelize.query(`
      SELECT id, status, tenant_id 
      FROM emergency_events 
      WHERE id = $1
      LIMIT 1
    `, { bind: [id] });
    
    if (!checkRows || checkRows.length === 0) {
      console.warn("⚠️ resolveEmergency - Emergency not found:", id);
      return res.status(404).json({ 
        message: "Emergency not found" 
      });
    }
    
    const emergency = checkRows[0];
    console.log("🔍 resolveEmergency - Found emergency:", {
      id: emergency.id,
      status: emergency.status,
      tenant_id: emergency.tenant_id,
      admin_tenant_id: tenantId
    });
    
    // Check tenant access
    if (tenantId && emergency.tenant_id !== tenantId) {
      console.warn("⚠️ resolveEmergency - Tenant mismatch:", {
        emergency_tenant: emergency.tenant_id,
        admin_tenant: tenantId
      });
      return res.status(403).json({ 
        message: "You don't have permission to resolve this emergency" 
      });
    }
    
    try {
      const finalTenantSql = tenantId ? `AND tenant_id = $${bindParams.length}` : "";
      const finalSql = `
        UPDATE emergency_events
        SET 
          status = 'resolved',
          resolved_at = NOW(),
          notes = $2,
          resolved_by = $3
        WHERE id = $1
          ${finalTenantSql}
        RETURNING *
      `;
      
      console.log("🔍 resolveEmergency - Final SQL:", finalSql);
      console.log("🔍 resolveEmergency - Final bindParams:", bindParams);
      
      [updated] = await sequelize.query(finalSql, { 
        bind: bindParams
      });
      console.log("✅ resolveEmergency - updated rows:", updated?.length || 0);
    } catch (queryError) {
      console.error("❌ SQL Query Error in resolveEmergency:", queryError);
      console.error("❌ Error message:", queryError.message);
      console.error("❌ Error code:", queryError.code);
      if (queryError.sql) {
        console.error("❌ SQL:", queryError.sql);
      }
      if (queryError.parameters) {
        console.error("❌ Parameters:", queryError.parameters);
      }
      throw queryError;
    }

    if (!updated || updated.length === 0) {
      console.warn("⚠️ resolveEmergency - No rows updated for id:", id);
      return res.status(404).json({ 
        message: "Emergency not found or you don't have permission to resolve it" 
      });
    }

    const emitToRealtime = req.app.locals.emitToRealtime;
    if (emitToRealtime) {
      emitToRealtime(req.app, "role:all", "emergency:resolved", {
        emergencyId: id,
        resolvedBy: adminId,
        resolvedAt: new Date().toISOString(),
      }).catch(() => {});
    }

    return res.json({
      success: true,
      message: "Emergency resolved successfully",
      emergency: updated[0],
    });
  } catch (e) {
    console.error("❌ Resolve emergency error:", e);
    console.error("❌ Error stack:", e.stack);
    console.error("❌ Error details:", {
      message: e.message,
      code: e.code,
      sql: e.sql,
      parameters: e.parameters,
    });
    return res
      .status(500)
      .json({ 
        message: "Failed to resolve emergency", 
        error: e.message,
        details: process.env.NODE_ENV === "development" ? {
          code: e.code,
          sql: e.sql,
          parameters: e.parameters,
        } : undefined,
      });
  }
};
