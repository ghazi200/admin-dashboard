// /Users/ghaziabdullah/abe-guard-ai/backend/src/routes/shifts.routes.js
const express = require("express");
const { pool } = require("../config/db");
const router = express.Router();
const auth = require("../middleware/guardAuth");
const { 
  runningLate,
  clockIn,
  clockOut,
  breakStart,
  breakEnd,
  getMyShiftState,
} = require("../controllers/timeEntries.controller");
const { 
  getGuardTenantSqlFilter, 
  canGuardAccessResource 
} = require("../utils/guardTenantFilter");

function isUUID(v) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(v || "").trim()
  );
}

// ✅ FIX: helper to emit to admin room(s) safely - aligned with callouts.controller.js pattern
/**
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
  if (!io) {
    console.warn("⚠️ [emitAdmins] No Socket.IO instance found - event", event, "not emitted");
    return;
  }
  emitAdminsCompat(io, event, payload);
}

/* =========================
   SHIFTS
   ========================= */

// Get all shifts (with tenant filtering for guards)
router.get("/", auth, async (req, res) => {
  try {
    const guardId = req.user?.guardId || req.user?.id;
    const params = [];
    let whereClauses = [];
    
    // ✅ Multi-tenant: Filter by guard's tenant_id
    const tenantFilter = getGuardTenantSqlFilter(req.user, params);
    if (tenantFilter) {
      whereClauses.push(tenantFilter);
    }
    
    // Only show OPEN shifts or shifts assigned to this guard
    if (guardId) {
      params.push(guardId);
      whereClauses.push(`(status = 'OPEN' OR guard_id = $${params.length})`);
    } else {
      // If no guardId, only show OPEN shifts
      whereClauses.push("status = 'OPEN'");
    }
    
    const whereSql = whereClauses.length > 0 
      ? `WHERE ${whereClauses.join(" AND ")}` 
      : "";
    
    const query = `SELECT * FROM shifts ${whereSql} ORDER BY shift_date, shift_start`;
    const result = await pool.query(query, params);
    
    res.json(result.rows);
  } catch (err) {
    console.error("Get shifts error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/**
 * ✅ Option A (Production): Accept a shift using guardId from JWT
 * POST /accept/:shiftId
 */
router.post("/accept/:shiftId", auth, async (req, res) => {
  const shiftId = String(req.params.shiftId || "").trim();
  const guardId = String(req.user?.guardId || "").trim();

  try {
    console.log("🔍 Accept shift request:", { shiftId, guardId, user: req.user });

    if (!isUUID(shiftId)) {
      console.error("❌ Invalid shiftId:", shiftId);
      return res.status(400).json({ error: "Invalid shiftId" });
    }
    if (!isUUID(guardId)) {
      console.error("❌ Invalid guardId:", guardId, "req.user:", req.user);
      return res.status(401).json({ error: "Unauthorized (missing guardId)" });
    }

    const shiftRes = await pool.query("SELECT * FROM shifts WHERE id=$1", [shiftId]);
    const shift = shiftRes.rows[0];

    if (!shift) {
      console.error("❌ Shift not found:", shiftId);
      return res.status(404).json({ error: "Shift not found" });
    }

    // ✅ Multi-tenant: Verify guard can access this shift's tenant
    if (!canGuardAccessResource(req.user, shift)) {
      console.error("❌ Tenant access denied:", { 
        shiftId, 
        shiftTenantId: shift.tenant_id, 
        guardTenantId: req.user?.tenant_id 
      });
      return res.status(403).json({ 
        error: "Access denied - shift belongs to different tenant" 
      });
    }

    if (String(shift.status || "").toUpperCase() !== "OPEN") {
      console.log("⚠️  Shift not OPEN:", { shiftId, status: shift.status, currentGuardId: shift.guard_id });
      return res.status(409).json({
        error: "Shift already taken",
        shiftId: shift.id,
        status: shift.status,
        currentGuardId: shift.guard_id,
      });
    }

    await pool.query("UPDATE shifts SET guard_id=$1, status=$2 WHERE id=$3", [
      guardId,
      "CLOSED",
      shiftId,
    ]);

    console.log("✅ Shift updated:", { shiftId, guardId, status: "CLOSED" });

    // ✅ ✅ ✅ FIX: Emit WebSocket event to admin dashboard for live updates
    try {
      emitAdmins(req, "shift_filled", {
        shiftId,
        guardId,
        status: "CLOSED",
        filledAt: new Date().toISOString(),
        source: "accept_shift",
      });
    } catch (emitErr) {
      // Don't fail the request if emit fails
      console.error("⚠️  Failed to emit shift_filled event:", emitErr.message);
    }

    return res.json({
      success: true,
      message: "Shift accepted",
      shiftId,
      assignedGuardId: guardId,
      status: "CLOSED",
    });
  } catch (err) {
    console.error("❌ Accept shift (token) error:", err);
    console.error("   Error stack:", err.stack);
    res.status(500).json({ error: "Server error", message: err.message });
  }
});

/**
 * ✅ NEW: Guard responds to a callout offer (Accept / Decline / No response)
 * POST /callouts/:calloutId/respond
 *
 * Body:
 * { "response": "ACCEPTED" | "DECLINED" | "NO_RESPONSE" }
 *
 * Your callouts table has NO status/updated_at, so:
 * - ACCEPTED: set callouts.guard_id = accepting guard + close shift (shifts.status=CLOSED)
 * - DECLINED/NO_RESPONSE: does not modify DB (optional logging only)
 *
 * "Callout closed" is implied by shift.status=CLOSED.
 */
/**
 * ✅ Guard responds to a callout OFFER row (one row per guard)
 * POST /callouts/:calloutId/respond
 *
 * Body: { "response": "ACCEPTED" | "DECLINED" | "NO_RESPONSE" }
 *
 * Your schema:
 * callouts(id, tenant_id, shift_id, guard_id, reason, created_at)
 *
 * Important:
 * - callouts.guard_id = the guard who RECEIVED the offer
 * - So on ACCEPTED we must verify callout.guard_id === req.user.guardId
 * - "Closed" is represented by shifts.status = CLOSED (since callouts has no status column)
 */
router.post("/callouts/:calloutId/respond", auth, async (req, res) => {
  const calloutId = String(req.params.calloutId || "").trim();
  const response = String(req.body?.response || "").trim().toUpperCase();
  const guardId = String(req.user?.guardId || "").trim();

  try {
    if (!isUUID(calloutId)) return res.status(400).json({ error: "Invalid calloutId" });
    if (!isUUID(guardId)) return res.status(401).json({ error: "Unauthorized (missing guardId)" });

    if (!["ACCEPTED", "DECLINED", "NO_RESPONSE"].includes(response)) {
      return res.status(400).json({ error: "Invalid response" });
    }

    // Load the OFFER row
    const offerRes = await pool.query("SELECT * FROM callouts WHERE id=$1", [calloutId]);
    const offer = offerRes.rows[0];

    if (!offer) return res.status(404).json({ error: "Callout offer not found" });

    const shiftId = String(offer.shift_id || "").trim();
    if (!isUUID(shiftId)) return res.status(500).json({ error: "Offer missing shift_id" });

    // ✅ Security: only the guard who received this offer can respond to it
    const offeredToGuardId = String(offer.guard_id || "").trim();
    if (!isUUID(offeredToGuardId)) {
      return res.status(500).json({ error: "Offer missing guard_id" });
    }

    if (offeredToGuardId !== guardId) {
      return res.status(403).json({
        error: "This offer does not belong to your guard account",
        calloutId,
        offeredToGuardId,
        yourGuardId: guardId,
      });
    }

    // If not accepted, we just acknowledge (no status column to update)
    if (response !== "ACCEPTED") {
      // ✅ Optional realtime: tell admins a guard responded (declined/no_response)
      emitAdmins(req, "callout_response", {
        calloutId,
        shiftId,
        guardId,
        response,
        updatedAt: new Date().toISOString(),
        filled: false,
      });

      return res.json({
        success: true,
        message: `Offer ${response.toLowerCase()}`,
        calloutId,
        shiftId,
        status: response,
      });
    }

    // ACCEPTED: transaction + lock so only one guard can win
    await pool.query("BEGIN");

    const shiftRes = await pool.query("SELECT * FROM shifts WHERE id=$1 FOR UPDATE", [shiftId]);
    const shift = shiftRes.rows[0];

    if (!shift) {
      await pool.query("ROLLBACK");
      return res.status(404).json({ error: "Shift not found", shiftId });
    }

    if (String(shift.status || "").toUpperCase() !== "OPEN") {
      await pool.query("ROLLBACK");
      return res.status(409).json({
        error: "Shift already taken",
        shiftId: shift.id,
        status: shift.status,
        currentGuardId: shift.guard_id,
      });
    }

    // Assign + close shift
    await pool.query("UPDATE shifts SET guard_id=$1, status=$2 WHERE id=$3", [
      guardId,
      "CLOSED",
      shiftId,
    ]);

    // Optional cleanup: remove other offers for this shift (prevents dashboard confusion)
    // If you prefer to keep history, comment this out.
    await pool.query("DELETE FROM callouts WHERE shift_id=$1", [shiftId]);

    await pool.query("COMMIT");

    // ✅ ✅ ✅ FIX: realtime events so admin dashboard updates immediately
    emitAdmins(req, "callout_response", {
      calloutId,
      shiftId,
      guardId,
      response: "ACCEPTED",
      updatedAt: new Date().toISOString(),
      filled: true,
    });

    emitAdmins(req, "shift_filled", {
      shiftId,
      guardId,
      status: "CLOSED",
      filledAt: new Date().toISOString(),
      source: "callout_accept",
      calloutId,
    });

    return res.json({
      success: true,
      message: "Callout accepted — shift assigned",
      calloutId,
      shiftId,
      assignedGuardId: guardId,
      status: "CLOSED",
    });
  } catch (err) {
    try {
      await pool.query("ROLLBACK");
    } catch {}
    console.error("Respond to callout (offer) error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

/**
 * ✅ Clock in/out and lunch routes - MUST come before /:shiftId/state (more specific routes first)
 */
router.post("/:shiftId/clock-in", auth, clockIn);
router.post("/:shiftId/clock-out", auth, clockOut);
router.post("/:shiftId/break-start", auth, breakStart);
router.post("/:shiftId/break-end", auth, breakEnd);

/**
 * ✅ Running late - MUST come before /:shiftId/state (more specific routes first)
 * POST /:shiftId/running-late
 */
router.post("/:shiftId/running-late", auth, runningLate);

/**
 * ✅ Get shift time entry state (clock in/out, lunch status)
 * GET /:shiftId/state
 * Uses getMyShiftState to return time entry status, not just shift status
 */
router.get("/:shiftId/state", auth, getMyShiftState);

module.exports = router;
