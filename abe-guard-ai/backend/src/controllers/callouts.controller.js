// backend/src/controllers/callouts.controller.js
const { Shift, Guard, AIDecision, Callout } = require("../models");
const rankGuards = require("../services/ranking.service");
const notifyGuards = require("../services/notification.service");
const { publishToGatewayLazy, roomsForTenant } = require("../services/realtimeGatewayPublish");

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

// inline UUID validator (no dependency)
function isUUID(v) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(v || "").trim()
  );
}

function normalizeReason(reason) {
  const clean = String(reason || "SICK").trim().toUpperCase();
  const allowed = new Set(["SICK", "EMERGENCY", "PERSONAL"]);
  return allowed.has(clean) ? clean : "SICK";
}

/**
 * ✅ SAFE ADMIN EMITTER (compat)
 * Emits to BOTH "admins" and "admin" rooms so we never miss updates due to room name mismatch.
 */
function emitAdminsCompat(io, event, payload) {
  if (!io) {
    console.warn("⚠️ [CALLBACK] Cannot emit", event, "- io is null/undefined");
    return;
  }
  console.log("📤 [CALLBACK] Emitting", event, "to 'admins' and 'admin' rooms");
  io.to("admins").emit(event, payload);
  io.to("admin").emit(event, payload);
  console.log("✅ [CALLBACK] Event", event, "emitted to admin rooms");
}

/**
 * ✅ Also available if you want to call with req
 */
function emitAdmins(req, event, payload) {
  const io = req.app.get("io");
  if (!io) return;
  emitAdminsCompat(io, event, payload);
} // ✅ IMPORTANT: this closing brace was missing in your paste

/**
 * REAL callout flow:
 * - opens shift
 * - excludes caller
 * - ranks guards
 * - saves ai decision JSON
 * - creates callout rows per notified guard (Option A)
 * - notifies guards with aiReason + calloutId
 * - fills shift when a guard ACCEPTS (first come, first served)
 *
 * NOTE:
 * - Admin realtime room is: "admins"
 * - Guard room is: "guards"
 */
async function handleCallout(io, shiftId, reason = "SICK", opts = {}) {
  const cleanShiftId = String(shiftId || "").trim();
  const callerGuardId = opts?.callerGuardId ? String(opts.callerGuardId).trim() : null;
  const tenantId = opts?.tenantId ? String(opts.tenantId).trim() : null;

  const cleanReason = normalizeReason(reason);

  // ✅ preferred admin emitter (set in server.js: app.set("emitAdmin", fn))
  // ✅ fallback now emits to BOTH rooms for compatibility
  const emitAdmin =
    typeof opts.emitAdmin === "function"
      ? opts.emitAdmin
      : (event, payload) => {
          emitAdminsCompat(io, event, payload);
        };

  const emitGuards = (event, payload) => {
    if (io) io.to("guards").emit(event, payload);
  };

  const shift = await Shift.findByPk(cleanShiftId);
  if (!shift) {
    const err = new Error("Shift not found");
    err.status = 404;
    throw err;
  }

  // 1) Mark OPEN + clear assignment
  shift.status = "OPEN";
  shift.guard_id = null;
  await shift.save();

  // 2) Eligible guards: active + callout allowlist, same tenant only, excluding caller
  const { buildCalloutEligibleWhere, excludeCallerGuard } = require("../utils/calloutTenantScope");
  const effectiveTenant = (tenantId || shift.tenant_id || "").toString().trim() || null;
  const { where: eligibleWhere, refuseCrossTenant } = buildCalloutEligibleWhere({
    tenantId: effectiveTenant,
  });
  let allActive = [];
  if (refuseCrossTenant || !eligibleWhere) {
    console.warn(
      `[CALL_OUT] shift=${shift.id} missing tenant_id — refusing cross-tenant ranking (0 eligible)`
    );
  } else {
    allActive = await Guard.findAll({ where: eligibleWhere });
  }

  const eligibleGuards = excludeCallerGuard(allActive, callerGuardId);

  // 3) Straight-time (Pool A) vs OT (Pool B); exclude conflicts / unavailable
  const { buildCalloutPools } = require("../services/calloutOtPools.service");
  const sequelize = Shift?.sequelize || Guard?.sequelize || null;
  const pools = await buildCalloutPools({
    guards: eligibleGuards,
    shift,
    Shift,
    sequelize,
    opts: {
      allowOt: opts?.allowOt === true,
      alwaysIncludeOt: opts?.alwaysIncludeOt === true,
    },
  });

  console.log(
    `[CALL_OUT] pools shift=${shift.id} straight=${pools.meta.straightTimeCount} ot=${pools.meta.overtimeCount} excluded=${pools.meta.excludedCount} notifyPolicy=${pools.notifyPolicy} otNecessary=${pools.otNecessary}`
  );

  // 4) Rank within each pool, then notify order = Pool A then Pool B (per policy)
  const source = process.env.OPENAI_API_KEY ? "openai" : "simple";
  console.log(
    `[CALL_OUT] ranking source=${source} shift=${shift.id} eligibleGuards=${eligibleGuards.length} notifyCandidates=${pools.notifyGuards.length}`
  );

  const models = { Shift, Guard };
  const rankedA = await rankGuards(pools.poolA, shift, models);
  const rankedB = await rankGuards(pools.poolB, shift, models);

  // Preserve pool metadata after ranking (rankGuards returns plain rows with scores)
  const byId = new Map(
    [...pools.poolA, ...pools.poolB].map((g) => [String(g.id), g])
  );
  const attachPoolMeta = (ranked) =>
    (ranked || []).map((g) => {
      const base = byId.get(String(g.id)) || {};
      return {
        ...g,
        _pool: base._pool || g._pool,
        _poolReason: base._poolReason || g._poolReason,
        _currentHours: base._currentHours,
        _projectedHours: base._projectedHours,
        _shiftHours: base._shiftHours,
        _weeklyCap: base._weeklyCap,
      };
    });

  const rankedPoolA = attachPoolMeta(rankedA);
  const rankedPoolB = attachPoolMeta(rankedB);

  let rankedForNotify;
  if (pools.notifyPolicy === "straight_time_only") {
    rankedForNotify = rankedPoolA;
  } else if (pools.notifyPolicy === "ot_necessary_no_straight_time") {
    rankedForNotify = rankedPoolB;
  } else {
    // include_ot_after_straight_time | admin_allow_ot
    rankedForNotify = [...rankedPoolA, ...rankedPoolB];
  }

  // IMPORTANT: rankings[] is what the UI uses.
  // We will attach calloutId onto each ranking entry after Callout.create().
  const rankings = rankedForNotify.map((g, idx) => {
    // Build enhanced explanation from ranking factors
    const factors = g._rankFactors || {};
    const guardSiteStats = g._siteStats || { successRate: 0.5, shiftCount: 0, onTimeRate: 0.5 };
    const poolLabel =
      g._pool === "overtime"
        ? "OT pool"
        : g._pool === "straight_time"
          ? "straight-time pool"
          : "pool";

    let reasonParts = [`${poolLabel}`];
    if (g._projectedHours != null && g._weeklyCap != null) {
      reasonParts.push(`projected ${g._projectedHours}h/wk (cap ${g._weeklyCap})`);
    }
    if (factors.reliabilityScore !== undefined) {
      reasonParts.push(`${Math.round(factors.reliabilityScore * 100)}% reliability${factors.reliabilityDecayed ? " (decayed)" : ""}`);
    }
    if (factors.acceptanceRate !== undefined) {
      reasonParts.push(`${Math.round(factors.acceptanceRate * 100)}% acceptance rate`);
    }
    if (factors.trustScore !== undefined && factors.trustScore !== null) {
      reasonParts.push(`${Math.round(factors.trustScore * 100)}% trust score`);
    }
    if (guardSiteStats.shiftCount > 0) {
      reasonParts.push(`worked this location ${guardSiteStats.shiftCount} time${guardSiteStats.shiftCount !== 1 ? "s" : ""}`);
    }
    if (factors.weeklyHours !== undefined) {
      if (factors.weeklyHours > 40) {
        reasonParts.push(`high fatigue (${factors.weeklyHours}h/week)`);
      } else if (factors.weeklyHours < 20) {
        reasonParts.push(`low hours (${factors.weeklyHours}h/week)`);
      }
    }

    const reason = `Ranked #${idx + 1}: ${reasonParts.join(", ")}`;

    return {
      guardId: g.id,
      rank: idx + 1,
      reason,
      calloutId: null, // <-- will be set below
      pool: g._pool || null,
      poolReason: g._poolReason || null,
      projectedHours: g._projectedHours ?? null,
      currentHours: g._currentHours ?? null,
      factors,
      siteStats: guardSiteStats,
    };
  });

  // 5) Save AI decision JSON (audit)
  await AIDecision.create({
    shift_id: shift.id,
    decision_json: {
      shiftId: shift.id,
      reason: cleanReason,
      callerGuardId: callerGuardId || null,
      excluded: [
        ...(callerGuardId
          ? [{ guardId: callerGuardId, why: "Caller excluded" }]
          : []),
        ...pools.excluded.map((g) => ({
          guardId: g.id,
          why: g._poolReason || "excluded",
          currentHours: g._currentHours,
          projectedHours: g._projectedHours,
        })),
      ],
      eligibilityNote:
        "Active + callout_eligible + tenant; prefer straight-time (projected <= weekly cap); OT pool only when necessary or allowOt",
      otPolicy: {
        weeklyCap: pools.meta.weeklyCap,
        shiftHours: pools.meta.shiftHours,
        straightTimeCount: pools.meta.straightTimeCount,
        overtimeCount: pools.meta.overtimeCount,
        excludedCount: pools.meta.excludedCount,
        notifyPolicy: pools.notifyPolicy,
        otNecessary: pools.otNecessary,
      },
      poolA: rankedPoolA.map((g) => g.id),
      poolB: rankedPoolB.map((g) => g.id),
      rankings,
      createdAt: new Date().toISOString(),
      model: "ot-pools-ranking-v1",
      feedback: [],
    },
  });

  // 6) Create Callout rows per notified guard + notify in ranked order
  // ✅ IMPORTANT: your callouts table is minimal and does NOT have response/status columns.
  const createdCallouts = [];

  if (!rankings.length) {
    console.warn("[CALL_OUT] rankings empty — no Callout rows will be created", {
      shiftId: shift.id,
      eligibleCount: eligibleGuards.length,
      straightTimeCount: pools.meta.straightTimeCount,
      overtimeCount: pools.meta.overtimeCount,
      excludedCount: pools.meta.excludedCount,
      notifyPolicy: pools.notifyPolicy,
    });
  }

  const maxNotify = parseInt(process.env.CALLOUT_MAX_GUARDS_NOTIFY || "0", 10);
  let notifyCount = 0;

  for (const r of rankings) {
    if (maxNotify > 0 && notifyCount >= maxNotify) {
      console.warn(
        `[CALL_OUT] CALLOUT_MAX_GUARDS_NOTIFY=${maxNotify} — stopped after ${maxNotify} guards (SMS/email/call); ${rankings.length - notifyCount} ranked but not notified`
      );
      break;
    }
    const guard =
      eligibleGuards.find((g) => String(g.id) === String(r.guardId)) ||
      rankedForNotify.find((g) => String(g.id) === String(r.guardId));
    if (!guard || !r.guardId) continue;

    let calloutRow = null;
    try {
      calloutRow = await Callout.create({
        tenant_id: tenantId || shift.tenant_id || null,
        shift_id: shift.id,
        guard_id: guard.id,
        reason: cleanReason,
      });

      createdCallouts.push(calloutRow);

      // ✅ CRITICAL FIX:
      // Attach calloutId onto the SAME ranking object the UI will render.
      r.calloutId = calloutRow.id;
    } catch (e) {
      const code = e?.original?.code || e?.parent?.code;
      console.error("❌ Callout.create failed:", {
        guardId: guard?.id,
        shiftId: shift?.id,
        message: e?.message,
        pgCode: code,
      });
      if (e?.stack) console.error(e.stack);
      r.calloutId = null;
    }

    // notify guard (sms/email/app)
    await notifyGuards(io, guard, shift, {
      aiReason: r.reason,
      calloutId: calloutRow?.id || null,
      rank: r.rank,
    });
    notifyCount += 1;
  }

  // Notify admins only AFTER callout rows exist so /dashboard/live-callouts matches the bell notification.
  const calloutPayload = {
    shiftId: shift.id,
    reason: cleanReason,
    callerGuardId: callerGuardId || null,
    tenantId: tenantId || shift.tenant_id || null,
    shift,
    ts: new Date().toISOString(),
    createdCalloutsCount: createdCallouts.length,
    calloutIds: createdCallouts.map((c) => c.id),
  };
  console.log("📤 [CALLBACK] Emitting callout_started (after DB rows):", {
    shiftId: calloutPayload.shiftId,
    reason: calloutPayload.reason,
    tenantId: calloutPayload.tenantId,
    createdCalloutsCount: calloutPayload.createdCalloutsCount,
  });
  emitAdmin("callout_started", calloutPayload);
  console.log("✅ [CALLBACK] callout_started event emitted");
  publishToGatewayLazy(roomsForTenant(calloutPayload.tenantId), "callout_started", {
    shiftId: calloutPayload.shiftId,
    reason: calloutPayload.reason,
    tenantId: calloutPayload.tenantId,
    createdCalloutsCount: calloutPayload.createdCalloutsCount,
    ts: calloutPayload.ts,
  });

  // Return rankings WITH calloutId so Guard UI can Accept/Decline properly.
  return {
    message: "Callout processed",
    shiftId: shift.id,
    reason: cleanReason,
    excludedCaller: Boolean(callerGuardId),
    callerGuardId: callerGuardId || null,
    otNecessary: pools.otNecessary,
    notifyPolicy: pools.notifyPolicy,
    otPolicy: {
      weeklyCap: pools.meta.weeklyCap,
      shiftHours: pools.meta.shiftHours,
      straightTimeCount: pools.meta.straightTimeCount,
      overtimeCount: pools.meta.overtimeCount,
      excludedCount: pools.meta.excludedCount,
    },
    rankings, // <-- now contains calloutId
    callouts: createdCallouts.map((c) => ({
      calloutId: c.id,
      guardId: c.guard_id,
    })),
  };
}

/**
 * POST /callouts/trigger
 * Body: { shiftId, reason: "SICK"|"EMERGENCY"|"PERSONAL", callerGuardId, tenantId }
 */
async function triggerCallout(req, res) {
  try {
    const io = req.app.get("io");
    const emitAdmin = req.app.get("emitAdmin"); // ✅ only inside handler
    const { shiftId, reason = "SICK", callerGuardId, tenantId, allowOt, alwaysIncludeOt } = req.body;

    const cleanShiftId = String(shiftId || "").trim();
    if (!isUUID(cleanShiftId)) {
      return res.status(400).json({ message: "shiftId must be a valid UUID" });
    }

    let cleanCaller = null;
    if (callerGuardId) {
      cleanCaller = String(callerGuardId).trim();
      if (!isUUID(cleanCaller)) {
        return res.status(400).json({ message: "callerGuardId must be a valid UUID" });
      }
    }

    let cleanTenant = null;
    if (tenantId) {
      cleanTenant = String(tenantId).trim();
      if (!isUUID(cleanTenant)) {
        return res.status(400).json({ message: "tenantId must be a valid UUID" });
      }
    }

    const result = await handleCallout(io, cleanShiftId, reason, {
      callerGuardId: cleanCaller,
      tenantId: cleanTenant,
      allowOt: allowOt === true || allowOt === "true",
      alwaysIncludeOt: alwaysIncludeOt === true || alwaysIncludeOt === "true",
      emitAdmin: typeof emitAdmin === "function" ? emitAdmin : null,
    });

    return res.json(result);
  } catch (e) {
    console.error(e);

    const pgCode = e?.original?.code || e?.parent?.code;
    const msg = String(e?.message || "");

    if (pgCode === "22P02" || msg.includes("invalid input syntax for type uuid")) {
      return res.status(400).json({ message: "Invalid UUID provided" });
    }

    return res.status(e.status || 500).json({ message: e.message || "Server error" });
  }
}

/**
 * POST /callouts/:calloutId/respond
 * Body: { response: "ACCEPTED"|"DECLINED"|"NO_RESPONSE" }
 *
 * ✅ Schema-safe: your callouts table has no response/status columns.
 * ✅ On ACCEPTED: fills the shift (first come, first served)
 */
async function respondToCallout(req, res) {
  try {
    const io = req.app.get("io");
    const emitAdmin = req.app.get("emitAdmin"); // ✅ only inside handler

    const calloutId = String(req.params.calloutId || "").trim();
    const { response } = req.body;

    if (!isUUID(calloutId)) {
      return res.status(400).json({ message: "calloutId must be a valid UUID" });
    }

    const allowed = new Set(["ACCEPTED", "DECLINED", "NO_RESPONSE"]);
    if (!allowed.has(response)) {
      return res.status(400).json({ message: "Invalid response" });
    }

    const callout = await Callout.findByPk(calloutId);
    if (!callout) return res.status(404).json({ message: "Callout not found" });

    // Only the offered guard may accept/decline (JWT may be on req.guard or req.user)
    const actorId =
      req.guard?.id ||
      req.guard?.guardId ||
      req.user?.guardId ||
      req.user?.id ||
      null;
    if (actorId && String(callout.guard_id) !== String(actorId)) {
      return res.status(403).json({
        message: "Only the ranked guard for this offer can respond",
        calloutGuardId: callout.guard_id,
      });
    }

    const now = new Date();

    let filled = false;
    let filledShift = null;

    if (response === "ACCEPTED") {
      const shift = await Shift.findByPk(callout.shift_id);
      if (!shift) return res.status(404).json({ message: "Shift not found" });

      const statusUpper = String(shift.status || "").toUpperCase();

      if (shift.guard_id || (statusUpper !== "OPEN") || shift.pending_guard_id) {
        return res.status(409).json({
          message: "Shift already filled",
          shiftId: shift.id,
          currentGuardId: shift.guard_id,
          pendingGuardId: shift.pending_guard_id || null,
          status: shift.status,
        });
      }

      const {
        beginPendingAcceptSql,
        overrideWindowMinutes,
      } = require("../services/pendingAccept.service");
      let pendingUntil = null;
      try {
        const sequelize = Shift.sequelize;
        const pending = await beginPendingAcceptSql(sequelize, {
          shiftId: shift.id,
          guardId: callout.guard_id,
          source: "callout_accept",
        });
        if (!pending.row) {
          return res.status(409).json({
            message: "Shift already filled",
            shiftId: shift.id,
          });
        }
        pendingUntil = pending.pendingUntil;
        filled = false;
        filledShift = pending.row;
      } catch (colErr) {
        if (!String(colErr.message || "").includes("pending_guard_id")) throw colErr;
        // Pre-migration fallback
        shift.guard_id = callout.guard_id;
        shift.status = "CLOSED";
        await shift.save();
        filled = true;
        filledShift = shift;
      }

      const pendingPayload = {
        shiftId: shift.id,
        guardId: callout.guard_id,
        calloutId: callout.id,
        pendingUntil,
        windowMinutes: overrideWindowMinutes(),
        source: "callout_accept",
      };

      if (filled) {
        if (typeof emitAdmin === "function") {
          emitAdmin("shift_filled", {
            ...pendingPayload,
            filledAt: now.toISOString(),
          });
        } else {
          emitAdminsCompat(io, "shift_filled", {
            ...pendingPayload,
            filledAt: now.toISOString(),
          });
        }
        publishToGatewayLazy(roomsForTenant(shift.tenant_id), "shift_filled", {
          ...pendingPayload,
          filledAt: now.toISOString(),
        });
      } else {
        if (typeof emitAdmin === "function") {
          emitAdmin("shift_accept_pending", pendingPayload);
        } else {
          emitAdminsCompat(io, "shift_accept_pending", pendingPayload);
        }
        if (io) {
          io.to("guards").emit("shift_accept_pending", pendingPayload);
        }
        publishToGatewayLazy(roomsForTenant(shift.tenant_id), "shift_accept_pending", pendingPayload);
      }
    }

    // Learning stats (optional)
    const guard = await Guard.findByPk(callout.guard_id);
    if (guard) {
      let delta = 0;
      if (response === "ACCEPTED") delta = +0.03;
      if (response === "DECLINED") delta = -0.05;
      if (response === "NO_RESPONSE") delta = -0.02;

      guard.acceptance_rate = clamp((guard.acceptance_rate ?? 0.8) + delta, 0.1, 0.99);
      guard.reliability_score = clamp((guard.reliability_score ?? 0.8) + delta / 2, 0, 1);
      await guard.save();
    }

    // Notify admins of response (even if not filled)
    if (typeof emitAdmin === "function") {
      emitAdmin("callout_response", {
        calloutId: callout.id,
        shiftId: callout.shift_id,
        guardId: callout.guard_id,
        response,
        updatedAt: now.toISOString(),
        filled,
      });
    } else {
      // ✅ fallback emits to BOTH rooms for compatibility
      emitAdminsCompat(io, "callout_response", {
        calloutId: callout.id,
        shiftId: callout.shift_id,
        guardId: callout.guard_id,
        response,
        updatedAt: now.toISOString(),
        filled,
      });
    }

    const shiftForTenant = filledShift || (await Shift.findByPk(callout.shift_id));
    publishToGatewayLazy(roomsForTenant(shiftForTenant?.tenant_id), "callout_response", {
      calloutId: callout.id,
      shiftId: callout.shift_id,
      guardId: callout.guard_id,
      response,
      updatedAt: now.toISOString(),
      filled,
    });

    const pendingAccept =
      response === "ACCEPTED" && !filled && Boolean(filledShift?.pending_guard_id || filledShift);
    return res.json({
      success: true,
      filled,
      pendingAccept: response === "ACCEPTED" ? !filled : false,
      pendingGuardId: response === "ACCEPTED" && !filled ? callout.guard_id : null,
      shiftId: filledShift?.id || callout.shift_id,
      assignedGuardId: filled ? filledShift?.guard_id || callout.guard_id : null,
      status: filled ? "CLOSED" : filledShift?.status || "OPEN",
    });
  } catch (e) {
    console.error(e);

    const pgCode = e?.original?.code || e?.parent?.code;
    const msg = String(e?.message || "");

    if (pgCode === "22P02" || msg.includes("invalid input syntax for type uuid")) {
      return res.status(400).json({ message: "Invalid UUID provided" });
    }

    return res.status(500).json({ message: e.message || "Server error" });
  }
}

module.exports = {
  handleCallout,
  triggerCallout,
  respondToCallout,
};
