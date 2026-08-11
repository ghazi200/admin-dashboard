/**
 * Straight-time (Pool A) vs OT-necessary (Pool B) for callout replacement.
 *
 * Pool A: projected weekly hours <= cap after taking this shift
 * Pool B: projected weekly hours > cap
 * Excluded: time conflict on same day, or marked unavailable
 *
 * Notify policy (default): notify Pool A only; if empty, notify Pool B (OT necessary).
 * Set CALLOUT_ALWAYS_INCLUDE_OT_POOL=true to notify B after A even when A is non-empty.
 */

const crypto = require("crypto");

const DEFAULT_WEEKLY_CAP = 40;

function calculateShiftHours(shift) {
  if (!shift?.shift_start || !shift?.shift_end) return 8;
  try {
    const start = new Date(`2000-01-01T${String(shift.shift_start).slice(0, 8)}`);
    const end = new Date(`2000-01-01T${String(shift.shift_end).slice(0, 8)}`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 8;
    if (end <= start) end.setDate(end.getDate() + 1);
    const hours = (end - start) / (1000 * 60 * 60);
    return Math.round(hours * 10) / 10 || 8;
  } catch (_) {
    return 8;
  }
}

function timeToMinutes(t) {
  if (t == null) return null;
  const s = String(t).slice(0, 8);
  const parts = s.split(":").map((x) => parseInt(x, 10));
  if (parts.length < 2 || parts.some((n) => Number.isNaN(n))) return null;
  return parts[0] * 60 + parts[1] + (parts[2] || 0) / 60;
}

/** True if [aStart,aEnd) overlaps [bStart,bEnd) in minutes; overnight ends add 24h. */
function rangesOverlap(aStart, aEnd, bStart, bEnd) {
  if ([aStart, aEnd, bStart, bEnd].some((x) => x == null)) return false;
  let ae = aEnd;
  let be = bEnd;
  if (ae <= aStart) ae += 24 * 60;
  if (be <= bStart) be += 24 * 60;
  return aStart < be && bStart < ae;
}

function guardIdToAvailabilityInt(guardId) {
  const hash = crypto.createHash("md5").update(String(guardId)).digest("hex");
  return parseInt(hash.substring(0, 8), 16) % 2147483647;
}

function weeklyCapFromEnv() {
  const n = parseInt(process.env.CALLOUT_WEEKLY_HOUR_CAP || String(DEFAULT_WEEKLY_CAP), 10);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_WEEKLY_CAP;
}

function alwaysIncludeOtPool() {
  return String(process.env.CALLOUT_ALWAYS_INCLUDE_OT_POOL || "")
    .toLowerCase()
    .trim() === "true";
}

/**
 * Pure split given precomputed conflict/unavailable maps.
 * @returns {{ poolA: object[], poolB: object[], excluded: object[], meta: object }}
 */
function splitIntoOtPools(guards, shift, opts = {}) {
  const cap = opts.weeklyCap != null ? opts.weeklyCap : DEFAULT_WEEKLY_CAP;
  const shiftHours = opts.shiftHours != null ? opts.shiftHours : calculateShiftHours(shift);
  const conflictIds = opts.conflictIds instanceof Set ? opts.conflictIds : new Set(opts.conflictIds || []);
  const unavailableIds =
    opts.unavailableIds instanceof Set
      ? opts.unavailableIds
      : new Set(opts.unavailableIds || []);

  const poolA = [];
  const poolB = [];
  const excluded = [];

  for (const guard of guards || []) {
    const id = String(guard.id);
    const plain = typeof guard.get === "function" ? guard.get({ plain: true }) : { ...guard };
    const currentHours = Number(plain.weekly_hours != null ? plain.weekly_hours : 0) || 0;
    const projected = currentHours + shiftHours;

    if (unavailableIds.has(id)) {
      excluded.push({
        ...plain,
        _pool: "excluded",
        _poolReason: "unavailable",
        _currentHours: currentHours,
        _projectedHours: projected,
        _shiftHours: shiftHours,
      });
      continue;
    }

    if (conflictIds.has(id)) {
      excluded.push({
        ...plain,
        _pool: "excluded",
        _poolReason: "time_conflict",
        _currentHours: currentHours,
        _projectedHours: projected,
        _shiftHours: shiftHours,
      });
      continue;
    }

    const enriched = {
      ...plain,
      _currentHours: currentHours,
      _projectedHours: projected,
      _shiftHours: shiftHours,
      _weeklyCap: cap,
    };

    if (projected <= cap) {
      poolA.push({ ...enriched, _pool: "straight_time", _poolReason: `projected ${projected}h <= ${cap}h` });
    } else {
      poolB.push({
        ...enriched,
        _pool: "overtime",
        _poolReason: `projected ${projected}h > ${cap}h`,
      });
    }
  }

  return {
    poolA,
    poolB,
    excluded,
    meta: {
      weeklyCap: cap,
      shiftHours,
      straightTimeCount: poolA.length,
      overtimeCount: poolB.length,
      excludedCount: excluded.length,
    },
  };
}

/**
 * Which pools to notify under OT-avoidance policy.
 */
function selectNotifyPools(poolA, poolB, opts = {}) {
  const includeOtAlways = opts.alwaysIncludeOt === true || alwaysIncludeOtPool();
  const forceAllowOt = opts.allowOt === true;

  if (includeOtAlways || forceAllowOt) {
    return {
      notify: [...(poolA || []), ...(poolB || [])],
      otNecessary: (poolA || []).length === 0 && (poolB || []).length > 0,
      policy: includeOtAlways
        ? "include_ot_after_straight_time"
        : "admin_allow_ot",
    };
  }

  if ((poolA || []).length > 0) {
    return {
      notify: [...poolA],
      otNecessary: false,
      policy: "straight_time_only",
    };
  }

  return {
    notify: [...(poolB || [])],
    otNecessary: (poolB || []).length > 0,
    policy: "ot_necessary_no_straight_time",
  };
}

/**
 * Find guard IDs already assigned (or pending) on overlapping shifts that day.
 */
async function findConflictingGuardIds(Shift, shift, guardIds) {
  const ids = (guardIds || []).map(String).filter(Boolean);
  if (!Shift || !shift?.shift_date || ids.length === 0) return new Set();

  const { Op } = require("sequelize");
  const rows = await Shift.findAll({
    where: {
      shift_date: shift.shift_date,
      [Op.or]: [
        { guard_id: { [Op.in]: ids } },
        { pending_guard_id: { [Op.in]: ids } },
      ],
      status: { [Op.notIn]: ["CANCELLED", "FAILED", "OPEN"] },
      ...(shift.id ? { id: { [Op.ne]: shift.id } } : {}),
    },
    attributes: ["id", "guard_id", "pending_guard_id", "shift_start", "shift_end", "status"],
  });

  const openStart = timeToMinutes(shift.shift_start);
  const openEnd = timeToMinutes(shift.shift_end);
  const conflict = new Set();

  for (const row of rows) {
    const plain = typeof row.get === "function" ? row.get({ plain: true }) : row;
    // OPEN shifts with no assignee shouldn't block; we excluded OPEN above.
    // CLOSED/ASSIGNED/FILLED with overlapping time → conflict
    if (!rangesOverlap(openStart, openEnd, timeToMinutes(plain.shift_start), timeToMinutes(plain.shift_end))) {
      continue;
    }
    if (plain.guard_id && ids.includes(String(plain.guard_id))) {
      conflict.add(String(plain.guard_id));
    }
    if (plain.pending_guard_id && ids.includes(String(plain.pending_guard_id))) {
      conflict.add(String(plain.pending_guard_id));
    }
  }

  return conflict;
}

/**
 * Latest availability_logs "to" per hashed guard id. Missing → available.
 */
async function findUnavailableGuardIds(sequelize, guardIds) {
  const ids = (guardIds || []).map(String).filter(Boolean);
  if (!sequelize || ids.length === 0) return new Set();

  const intToUuid = new Map();
  for (const id of ids) {
    intToUuid.set(guardIdToAvailabilityInt(id), id);
  }
  const intIds = [...intToUuid.keys()];

  try {
    const [rows] = await sequelize.query(
      `
      SELECT DISTINCT ON ("guardId") "guardId", "to"
      FROM availability_logs
      WHERE "guardId" = ANY($1::int[])
      ORDER BY "guardId", "createdAt" DESC
      `,
      { bind: [intIds] }
    );

    const unavailable = new Set();
    for (const row of rows || []) {
      const uuid = intToUuid.get(Number(row.guardId));
      if (!uuid) continue;
      // "to" false = unavailable
      if (row.to === false || row.to === "f" || row.to === 0) {
        unavailable.add(uuid);
      }
    }
    return unavailable;
  } catch (e) {
    console.warn(
      "[calloutOtPools] availability_logs lookup skipped:",
      e?.message || e
    );
    return new Set();
  }
}

/**
 * Full pipeline: conflicts + availability + split + notify selection.
 */
async function buildCalloutPools({ guards, shift, Shift, sequelize, opts = {} }) {
  const list = Array.isArray(guards) ? guards : [];
  const guardIds = list.map((g) => String(g.id));
  const cap = opts.weeklyCap != null ? opts.weeklyCap : weeklyCapFromEnv();
  const shiftHours = calculateShiftHours(shift);

  const [conflictIds, unavailableIds] = await Promise.all([
    findConflictingGuardIds(Shift, shift, guardIds),
    findUnavailableGuardIds(sequelize, guardIds),
  ]);

  const split = splitIntoOtPools(list, shift, {
    weeklyCap: cap,
    shiftHours,
    conflictIds,
    unavailableIds,
  });

  const notifyPlan = selectNotifyPools(split.poolA, split.poolB, {
    allowOt: opts.allowOt === true,
    alwaysIncludeOt: opts.alwaysIncludeOt === true,
  });

  return {
    ...split,
    notifyGuards: notifyPlan.notify,
    otNecessary: notifyPlan.otNecessary,
    notifyPolicy: notifyPlan.policy,
    conflictIds: [...conflictIds],
    unavailableIds: [...unavailableIds],
  };
}

module.exports = {
  DEFAULT_WEEKLY_CAP,
  calculateShiftHours,
  timeToMinutes,
  rangesOverlap,
  guardIdToAvailabilityInt,
  weeklyCapFromEnv,
  alwaysIncludeOtPool,
  splitIntoOtPools,
  selectNotifyPools,
  findConflictingGuardIds,
  findUnavailableGuardIds,
  buildCalloutPools,
};
