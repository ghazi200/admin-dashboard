// backend/src/controllers/callouts.controller.js
const { Shift, Guard, AIDecision, Callout } = require("../models");
const rankGuards = require("../services/ranking.service");
const notifyGuards = require("../services/notification.service");

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

  // 2) Notify admins that callout started
  const calloutPayload = {
    shiftId: shift.id,
    reason: cleanReason,
    callerGuardId: callerGuardId || null,
    tenantId: tenantId || shift.tenant_id || null,
    shift, // OK for internal UI; remove if you want a smaller payload later
    ts: new Date().toISOString(),
  };
  console.log("📤 [CALLBACK] Emitting callout_started event to admins:", {
    shiftId: calloutPayload.shiftId,
    reason: calloutPayload.reason,
    tenantId: calloutPayload.tenantId,
  });
  emitAdmin("callout_started", calloutPayload);
  console.log("✅ [CALLBACK] callout_started event emitted");

  // 3) Eligible guards: all active, excluding caller
  const allActive = await Guard.findAll({ where: { is_active: true } });

  const eligibleGuards = callerGuardId
    ? allActive.filter((g) => String(g.id) !== callerGuardId)
    : allActive;

  // 4) Rank guards (enhanced ranking with reliability decay and site success rates)
  const source = process.env.OPENAI_API_KEY ? "openai" : "simple";
  console.log(
    `[CALL_OUT] ranking source=${source} shift=${shift.id} eligibleGuards=${eligibleGuards.length}`
  );

  // Get models for enhanced ranking
  const models = { Shift, Guard };
  const rankedGuards = await rankGuards(eligibleGuards, shift, models);

  // IMPORTANT: rankings[] is what the UI uses.
  // We will attach calloutId onto each ranking entry after Callout.create().
  const rankings = rankedGuards.map((g, idx) => {
    // Build enhanced explanation from ranking factors
    const factors = g._rankFactors || {};
    const guardSiteStats = g._siteStats || { successRate: 0.5, shiftCount: 0, onTimeRate: 0.5 };
    
    let reasonParts = [];
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

    const reason = reasonParts.length > 0
      ? `Ranked #${idx + 1}: ${reasonParts.join(", ")}`
      : `Ranked #${idx + 1} by enhanced scoring algorithm`;

    return {
      guardId: g.id,
      rank: idx + 1,
      reason: reason,
      calloutId: null, // <-- will be set below
      factors: factors, // Include detailed factors for explainability
      siteStats: guardSiteStats, // Include site stats
    };
  });

  // 5) Save AI decision JSON (audit)
  await AIDecision.create({
    shift_id: shift.id,
    decision_json: {
      shiftId: shift.id,
      reason: cleanReason,
      callerGuardId: callerGuardId || null,
      excluded: callerGuardId ? [{ guardId: callerGuardId, why: "Caller excluded" }] : [],
      rankings, // contains calloutId:null at this point; fine for audit
      createdAt: new Date().toISOString(),
      model: "simple-ranking-v1",
      feedback: [],
    },
  });

  // 6) Create Callout rows per notified guard + notify in ranked order
  // ✅ IMPORTANT: your callouts table is minimal and does NOT have response/status columns.
  const createdCallouts = [];

  for (const r of rankings) {
    const guard = rankedGuards.find((g) => String(g.id) === String(r.guardId));
    if (!guard) continue;

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
      console.log("ℹ️ Callout.create for guard skipped:", e?.message);
      r.calloutId = null;
    }

    // notify guard (sms/email/app)
    await notifyGuards(io, guard, shift, {
      aiReason: r.reason,
      calloutId: calloutRow?.id || null,
      rank: r.rank,
    });
  }

  // Return rankings WITH calloutId so Guard UI can Accept/Decline properly.
  return {
    message: "Callout processed",
    shiftId: shift.id,
    reason: cleanReason,
    excludedCaller: Boolean(callerGuardId),
    callerGuardId: callerGuardId || null,
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
    const { shiftId, reason = "SICK", callerGuardId, tenantId } = req.body;

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

    const now = new Date();

    let filled = false;
    let filledShift = null;

    if (response === "ACCEPTED") {
      const shift = await Shift.findByPk(callout.shift_id);
      if (!shift) return res.status(404).json({ message: "Shift not found" });

      const statusUpper = String(shift.status || "").toUpperCase();

      if (shift.guard_id && statusUpper !== "OPEN") {
        return res.status(409).json({
          message: "Shift already filled",
          shiftId: shift.id,
          currentGuardId: shift.guard_id,
          status: shift.status,
        });
      }

      shift.guard_id = callout.guard_id;
      shift.status = "CLOSED";
      await shift.save();

      filled = true;
      filledShift = shift;

      // ✅ realtime to admins + guards
      if (typeof emitAdmin === "function") {
        emitAdmin("shift_filled", {
          shiftId: shift.id,
          guardId: shift.guard_id,
          calloutId: callout.id,
          filledAt: now.toISOString(),
          source: "callout_accept",
        });
      } else {
        // ✅ fallback emits to BOTH rooms for compatibility
        emitAdminsCompat(io, "shift_filled", {
          shiftId: shift.id,
          guardId: shift.guard_id,
          calloutId: callout.id,
          filledAt: now.toISOString(),
          source: "callout_accept",
        });
      }

      if (io) {
        io.to("guards").emit("shift_filled", {
          shiftId: shift.id,
          guardId: shift.guard_id,
        });
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

    return res.json({
      success: true,
      filled,
      shiftId: filledShift?.id || callout.shift_id,
      assignedGuardId: filledShift?.guard_id || null,
      status: filledShift?.status || null,
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
