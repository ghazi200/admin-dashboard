// backend/src/controllers/timeEntries.controller.js
const { Op } = require("sequelize");

// ✅ Make sure these models exist in your models/index.js exports:
const { Shift, Guard, ShiftTimeEntry, TimeEntry, Admin, ClockInVerification } = require("../models");

// ✅ Geofencing and Spoofing Detection Services
const geofencingService = require("../services/geofencing.service");
const spoofingDetectionService = require("../services/spoofingDetection.service");

// -------------------- helpers --------------------
function parseShiftStart(shift) {
  // expects shift.shift_date = YYYY-MM-DD and shift.shift_start = HH:MM or HH:MM:SS
  return new Date(`${shift.shift_date}T${shift.shift_start}`);
}

function minutesDiff(a, b) {
  return Math.floor((b - a) / 60000);
}

function clampInt(n, min, max) {
  const x = Number.parseInt(n, 10);
  if (!Number.isFinite(x)) return null;
  return Math.max(min, Math.min(max, x));
}

function getIp(req) {
  return (
    req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    req.socket?.remoteAddress ||
    null
  );
}

async function loadShiftOr404(shiftId) {
  const shift = await Shift.findByPk(shiftId, { include: [{ model: Guard }] });
  return shift || null;
}

async function upsertTimeEntryState({ shift, guardId, ip, patch }) {
  // One row per shift/guard
  let te = await TimeEntry.findOne({
    where: { shift_id: shift.id, guard_id: guardId },
  });

  if (!te) {
    te = await TimeEntry.create({
      tenant_id: shift.tenant_id || null,
      shift_id: shift.id,
      guard_id: guardId,
      ip_address: ip || null,
      ...patch,
    });
  } else {
    Object.assign(te, patch);
    if (ip) te.ip_address = ip;
    await te.save();
  }

  return te;
}

async function createShiftEvent({ shiftId, guardId, eventType, req, meta = {}, source = "MOBILE" }) {
  const ip = getIp(req);
  const userAgent = req.headers["user-agent"] || null;

  const lat = req.body?.lat ?? null;
  const lng = req.body?.lng ?? null;
  const accuracy_m = req.body?.accuracyM ?? req.body?.accuracy_m ?? null;
  const device_tz = req.body?.deviceTz ?? null;

  return ShiftTimeEntry.create({
    shift_id: shiftId,
    guard_id: guardId,
    event_type: eventType,
    event_time: new Date(),
    source,
    device_tz,
    lat,
    lng,
    accuracy_m,
    ip_address: ip,
    user_agent: userAgent,
    meta: meta || {},
  });
}

function emitTimeEvent(req, eventName, payload) {
  const io = req.app.get("io");
  if (!io) return;

  io.to("admin").emit(eventName, payload);
  io.to("admins").emit(eventName, payload); // Also emit to admins room for admin dashboard
  io.to("guards").emit("time_entry_updated", payload);
}

// -------------------- handlers --------------------

// ✅ CLOCK IN
async function clockIn(req, res) {
   
  try {
    const { shiftId } = req.params;

    // ✅ Get guardId from authenticated user (set by guardAuth middleware)
    const guardId = req.user?.guardId || req.guard?.id || req.body?.guardId;
    if (!guardId) return res.status(401).json({ message: "Missing guard identity (auth)" });

    const shift = await loadShiftOr404(shiftId);
    if (!shift) return res.status(404).json({ message: "Shift not found" });

    // ✅ Allow clock-in if:
    // 1. Guard is assigned to shift (guard_id matches), OR
    // 2. Shift is OPEN and guard_id is NULL (unassigned shift - assign guard on clock-in)
    // Handle Sequelize null values (can be null, undefined, or special null object)
    const shiftGuardIdRaw = shift.guard_id;
    const shiftGuardId = (shiftGuardIdRaw && shiftGuardIdRaw !== null && shiftGuardIdRaw !== undefined) 
      ? String(shiftGuardIdRaw) 
      : null;
    const shiftStatus = String(shift.status || "").toUpperCase();
    const isAssigned = shiftGuardId && shiftGuardId === String(guardId);
    const isOpenAndUnassigned = shiftStatus === "OPEN" && !shiftGuardId;
    
    // Debug logging
    console.log(`🔍 Clock-in check for shift ${shiftId}:`, {
      shiftGuardId,
      guardId,
      shiftStatus,
      isAssigned,
      isOpenAndUnassigned,
      canClockIn: isAssigned || isOpenAndUnassigned
    });
    
    if (!isAssigned && !isOpenAndUnassigned) {
      console.log(`❌ Clock-in blocked: shift guard_id=${shiftGuardId}, guardId=${guardId}, status=${shiftStatus}`);
      return res.status(403).json({ message: "Guard is not assigned to this shift" });
    }

    // ✅ If shift is OPEN and unassigned, assign guard to shift when they clock in
    if (isOpenAndUnassigned) {
      await Shift.update(
        { guard_id: guardId, status: "CLOSED" },
        { where: { id: shift.id } }
      );
      console.log(`✅ Auto-assigned shift ${shiftId} to guard ${guardId} on clock-in`);
    }

    const ip = getIp(req);

    const existing = await TimeEntry.findOne({
      where: { shift_id: shift.id, guard_id: guardId },
    });
    // ✅ Allow clock in if: no existing entry OR already clocked out
    // Block clock in if: clocked in but NOT clocked out yet
    if (existing?.clock_in_at && !existing?.clock_out_at) {
      return res.status(400).json({ message: "Already clocked in for this shift." });
    }

    // ========== Geofencing Validation ==========
    if (shift.location_lat && shift.location_lng && req.body.lat && req.body.lng) {
      const geofenceCheck = geofencingService.isWithinGeofence(
        req.body.lat,
        req.body.lng,
        shift.location_lat,
        shift.location_lng,
        shift.geofence_radius_m || 100
      );
      
      if (!geofenceCheck.within) {
        return res.status(400).json({ 
          message: "Clock-in location is outside the allowed geofence area",
          distance: geofenceCheck.distance,
          radius: geofenceCheck.radius,
          geofence: {
            distance: geofenceCheck.distance,
            radius: geofenceCheck.radius,
            reason: geofenceCheck.reason
          }
        });
      }
    }

    // ========== Spoofing Detection (AI Analysis) ==========
    let riskAnalysis = null;
    let verificationNotes = {};

    if (req.body.lat && req.body.lng) {
      try {
        riskAnalysis = await spoofingDetectionService.calculateRiskScore(
          {
            guardId,
            shiftId: shift.id,
            location: { 
              lat: req.body.lat, 
              lng: req.body.lng,
              accuracy: req.body.accuracyM || req.body.accuracy_m || null
            },
            device: {
              id: req.body.deviceId,
              type: req.body.deviceType,
              os: req.body.deviceOS,
              ip: ip
            },
            timestamp: new Date()
          },
          {}, // historicalData will be fetched inside calculateRiskScore
          { TimeEntry } // Pass models
        );

        verificationNotes = {
          riskScore: riskAnalysis.riskScore,
          factors: riskAnalysis.factors,
          flagged: riskAnalysis.shouldFlag,
          timestamp: riskAnalysis.timestamp
        };

        // Log high-risk check-ins (don't block, just flag for review)
        if (riskAnalysis.shouldFlag) {
          console.warn(`⚠️ High-risk clock-in detected for guard ${guardId}, shift ${shift.id}, risk score: ${riskAnalysis.riskScore}`);
        }
      } catch (error) {
        console.error('❌ Spoofing detection error:', error);
        // Don't block clock-in if detection fails (fail open)
      }
    }

    // 1) event log
    await createShiftEvent({
      shiftId: shift.id,
      guardId,
      eventType: "CLOCK_IN",
      req,
      meta: {
        deviceType: req.body?.deviceType || null,
        deviceOS: req.body?.deviceOS || null,
        deviceId: req.body?.deviceId || null,
      },
    });

    // 2) state update
    console.log(`🔄 Creating/updating time entry for shift ${shift.id}, guard ${guardId}...`);
    let te;
    try {
      te = await upsertTimeEntryState({
        shift,
        guardId,
        ip,
        patch: {
          clock_in_at: new Date(),
          clock_in_lat: req.body?.lat ?? null,
          clock_in_lng: req.body?.lng ?? null,
          clock_in_accuracy_m: req.body?.accuracyM ?? null,
          device_type: req.body?.deviceType || null,
          device_os: req.body?.deviceOS || null,
          device_id: req.body?.deviceId || null,
          // Store spoofing risk score and verification notes
          spoofing_risk_score: riskAnalysis?.riskScore || null,
          verification_notes: Object.keys(verificationNotes).length > 0 ? verificationNotes : null,
        },
      });
      console.log(`✅ Time entry created/updated:`, {
        id: te.id,
        shift_id: te.shift_id,
        guard_id: te.guard_id,
        clock_in_at: te.clock_in_at,
      });
    } catch (teError) {
      console.error(`❌ Error creating/updating time entry:`, teError);
      console.error(`   Error message:`, teError.message);
      console.error(`   Error stack:`, teError.stack);
      if (teError.errors) {
        teError.errors.forEach(err => {
          console.error(`   - Field ${err.path}: ${err.message}`);
        });
      }
      throw teError; // Re-throw to be caught by outer try/catch
    }

    // ========== Create Verification Records ==========
    try {
      // Get tenant_id from shift, time entry, or guard (fallback)
      const tenantId = shift.tenant_id || te.tenant_id || (shift.Guard?.tenant_id);
      
      // Only create verification records if we have a tenant_id (required for multi-tenant)
      if (tenantId) {
        // Create geofence verification record (if geofence was checked)
        if (shift.location_lat && shift.location_lng && req.body.lat && req.body.lng) {
          const geofenceCheck = geofencingService.isWithinGeofence(
            req.body.lat,
            req.body.lng,
            shift.location_lat,
            shift.location_lng,
            shift.geofence_radius_m || 100
          );

          await ClockInVerification.create({
            time_entry_id: te.id,
            tenant_id: tenantId,
            guard_id: guardId,
            shift_id: shift.id,
            verification_type: 'geofence',
            verification_result: geofenceCheck.within ? 'passed' : 'failed',
            verification_data: {
              guard_location: { lat: req.body.lat, lng: req.body.lng },
              shift_location: { lat: shift.location_lat, lng: shift.location_lng },
              radius_m: shift.geofence_radius_m || 100,
              distance_m: geofenceCheck.distance,
              within: geofenceCheck.within
            }
          });
        }

        // Create AI analysis verification record (if high risk or always for audit)
        if (riskAnalysis) {
          await ClockInVerification.create({
            time_entry_id: te.id,
            tenant_id: tenantId,
            guard_id: guardId,
            shift_id: shift.id,
            verification_type: 'ai_analysis',
            verification_result: riskAnalysis.shouldFlag ? 'flagged' : 'passed',
            verification_data: {
              risk_score: riskAnalysis.riskScore,
              factors: riskAnalysis.factors,
              should_flag: riskAnalysis.shouldFlag,
              timestamp: riskAnalysis.timestamp
            }
          });
        }
      } else {
        console.warn('⚠️ Skipping verification records: tenant_id not available');
      }
    } catch (verificationError) {
      // Don't fail clock-in if verification record creation fails
      console.error('❌ Error creating verification records:', verificationError);
    }

    const payload = {
      type: "CLOCK_IN",
      shiftId: shift.id,
      guardId,
      guardName: shift.Guard?.name || null,
      timeEntryId: te.id,
      at: te.clock_in_at,
    };

    emitTimeEvent(req, "guard_clocked_in", payload);

    return res.json({ ok: true, timeEntry: te });
  } catch (e) {
    return res.status(500).json({ message: "Server error", error: String(e.message || e) });
  }
}

// ✅ CLOCK OUT
async function clockOut(req, res) {
  try {
    const { shiftId } = req.params;

    // ✅ Get guardId from authenticated user (set by guardAuth middleware)
    const guardId = req.user?.guardId || req.guard?.id || req.body?.guardId;
    if (!guardId) return res.status(401).json({ message: "Missing guard identity (auth)" });

    const shift = await loadShiftOr404(shiftId);
    if (!shift) return res.status(404).json({ message: "Shift not found" });

    const ip = getIp(req);

    // ✅ Check if guard has a time entry (has clocked in) - if so, allow action
    const te = await TimeEntry.findOne({ where: { shift_id: shift.id, guard_id: guardId } });
    
    // ✅ Allow if: guard is assigned to shift OR guard has clocked in (has time entry)
    const shiftGuardId = shift.guard_id ? String(shift.guard_id) : null;
    const isAssigned = shiftGuardId === String(guardId);
    const hasTimeEntry = Boolean(te?.clock_in_at);
    
    // Debug logging
    console.log(`🔍 Clock-out check for shift ${shiftId}:`, {
      shiftGuardId,
      guardId,
      isAssigned,
      hasTimeEntry,
      timeEntryId: te?.id || null,
      clockInAt: te?.clock_in_at || null,
      canClockOut: isAssigned || hasTimeEntry
    });
    
    if (!isAssigned && !hasTimeEntry) {
      console.log(`❌ Clock-out blocked: shift guard_id=${shiftGuardId}, guardId=${guardId}, hasTimeEntry=${hasTimeEntry}`);
      return res.status(403).json({ message: "Guard is not assigned to this shift" });
    }
    
    if (!te?.clock_in_at) {
      return res.status(400).json({ message: "Cannot clock out before clocking in." });
    }
    // ✅ Check if already clocked out (clock_out_at exists AND is after clock_in_at)
    const isCurrentlyClockedOut = te.clock_out_at && te.clock_in_at && 
      new Date(te.clock_out_at) >= new Date(te.clock_in_at);
    if (isCurrentlyClockedOut) {
      return res.status(400).json({ message: "Already clocked out for this shift." });
    }

    // 1) event log
    await createShiftEvent({ shiftId: shift.id, guardId, eventType: "CLOCK_OUT", req });

    // 2) state update
    const updated = await upsertTimeEntryState({
      shift,
      guardId,
      ip,
      patch: {
        clock_out_at: new Date(),
        clock_out_lat: req.body?.lat ?? null,
        clock_out_lng: req.body?.lng ?? null,
        clock_out_accuracy_m: req.body?.accuracyM ?? null,
      },
    });

    const payload = {
      type: "CLOCK_OUT",
      shiftId: shift.id,
      guardId,
      guardName: shift.Guard?.name || null,
      timeEntryId: updated.id,
      at: updated.clock_out_at,
    };

    emitTimeEvent(req, "guard_clocked_out", payload);

    return res.json({ ok: true, timeEntry: updated });
  } catch (e) {
    return res.status(500).json({ message: "Server error", error: String(e.message || e) });
  }
}

// ✅ BREAK START (Lunch start)
async function breakStart(req, res) {
  try {
    const { shiftId } = req.params;

    // ✅ Get guardId from authenticated user (set by guardAuth middleware)
    const guardId = req.user?.guardId || req.guard?.id || req.body?.guardId;
    if (!guardId) return res.status(401).json({ message: "Missing guard identity (auth)" });

    const shift = await loadShiftOr404(shiftId);
    if (!shift) return res.status(404).json({ message: "Shift not found" });

    const ip = getIp(req);

    // ✅ Check if guard has a time entry (has clocked in) - if so, allow action
    const te = await TimeEntry.findOne({ where: { shift_id: shift.id, guard_id: guardId } });
    
    // ✅ Allow if: guard is assigned to shift OR guard has clocked in (has time entry)
    const isAssigned = String(shift.guard_id) === String(guardId);
    const hasTimeEntry = Boolean(te?.clock_in_at);
    
    if (!isAssigned && !hasTimeEntry) {
      return res.status(403).json({ message: "Guard is not assigned to this shift" });
    }
    
    if (!te?.clock_in_at) return res.status(400).json({ message: "Cannot start break before clocking in." });
    // ✅ Check if currently clocked out (clock_out_at exists AND is after clock_in_at)
    const isCurrentlyClockedOut = te.clock_out_at && te.clock_in_at && 
      new Date(te.clock_out_at) >= new Date(te.clock_in_at);
    if (isCurrentlyClockedOut) return res.status(400).json({ message: "Cannot start break after clocking out." });
    if (te.lunch_start_at && !te.lunch_end_at) return res.status(400).json({ message: "Break already started." });

    // 1) event log
    await createShiftEvent({ shiftId: shift.id, guardId, eventType: "BREAK_START", req });

    // 2) state update
    const updated = await upsertTimeEntryState({
      shift,
      guardId,
      ip,
      patch: { lunch_start_at: new Date(), lunch_end_at: null },
    });

    const payload = {
      type: "BREAK_START",
      shiftId: shift.id,
      guardId,
      guardName: shift.Guard?.name || null,
      timeEntryId: updated.id,
      at: updated.lunch_start_at,
    };

    emitTimeEvent(req, "guard_lunch_started", payload);

    return res.json({ ok: true, timeEntry: updated });
  } catch (e) {
    return res.status(500).json({ message: "Server error", error: String(e.message || e) });
  }
}

// ✅ BREAK END (Lunch end)
async function breakEnd(req, res) {
  try {
    const { shiftId } = req.params;

    // ✅ Get guardId from authenticated user (set by guardAuth middleware)
    const guardId = req.user?.guardId || req.guard?.id || req.body?.guardId;
    if (!guardId) return res.status(401).json({ message: "Missing guard identity (auth)" });

    const shift = await loadShiftOr404(shiftId);
    if (!shift) return res.status(404).json({ message: "Shift not found" });

    const ip = getIp(req);

    // ✅ Check if guard has a time entry (has clocked in) - if so, allow action
    const te = await TimeEntry.findOne({ where: { shift_id: shift.id, guard_id: guardId } });
    
    // ✅ Allow if: guard is assigned to shift OR guard has clocked in (has time entry)
    const isAssigned = String(shift.guard_id) === String(guardId);
    const hasTimeEntry = Boolean(te?.clock_in_at);
    
    if (!isAssigned && !hasTimeEntry) {
      return res.status(403).json({ message: "Guard is not assigned to this shift" });
    }
    if (!te?.clock_in_at) return res.status(400).json({ message: "Cannot end break before clocking in." });
    // ✅ Check if currently clocked out (clock_out_at exists AND is after clock_in_at)
    const isCurrentlyClockedOut = te.clock_out_at && te.clock_in_at && 
      new Date(te.clock_out_at) >= new Date(te.clock_in_at);
    if (isCurrentlyClockedOut) return res.status(400).json({ message: "Cannot end break after clocking out." });
    if (!te.lunch_start_at) return res.status(400).json({ message: "Cannot end break before starting it." });
    if (te.lunch_end_at) return res.status(400).json({ message: "Break already ended." });

    // 1) event log
    await createShiftEvent({ shiftId: shift.id, guardId, eventType: "BREAK_END", req });

    // 2) state update
    const updated = await upsertTimeEntryState({
      shift,
      guardId,
      ip,
      patch: { lunch_end_at: new Date() },
    });

    const payload = {
      type: "BREAK_END",
      shiftId: shift.id,
      guardId,
      guardName: shift.Guard?.name || null,
      timeEntryId: updated.id,
      at: updated.lunch_end_at,
    };

    emitTimeEvent(req, "guard_lunch_ended", payload);

    return res.json({ ok: true, timeEntry: updated });
  } catch (e) {
    return res.status(500).json({ message: "Server error", error: String(e.message || e) });
  }
}

/**
 * POST /api/time/shifts/:shiftId/running-late
 * body: { etaMinutes?: number, reason?: string }
 *
 * Logs an audit event to shift_time_entries and notifies admin/supervisors in realtime.
 */
async function runningLate(req, res) {
  try {
    const io = req.app.get("io");
    const ip = getIp(req);

    const { shiftId } = req.params;

    // ✅ Get guardId from authenticated user (set by guardAuth middleware)
    const guardId = req.user?.guardId || req.guard?.id || req.body?.guardId;

    if (!shiftId) return res.status(400).json({ message: "Missing shiftId" });
    if (!guardId) return res.status(401).json({ message: "Missing guard identity (auth)" });

    const etaMinutes = clampInt(req.body?.etaMinutes, 1, 180);
    const reasonRaw = String(req.body?.reason || "").trim();
    const reason = reasonRaw.length ? reasonRaw.slice(0, 160) : null;

    const shift = await Shift.findByPk(shiftId, { include: [{ model: Guard }] });
    if (!shift) return res.status(404).json({ message: "Shift not found" });

    // ✅ Check if guard has a time entry (has clocked in) - if so, allow action
    let alreadyClockedIn = false;
    let hasTimeEntry = false;

    if (TimeEntry) {
      const te = await TimeEntry.findOne({
        where: { shift_id: shift.id, guard_id: guardId },
      });
      if (te?.clock_in_at) {
        alreadyClockedIn = true;
        hasTimeEntry = true;
      }
    }

    if (!alreadyClockedIn && ShiftTimeEntry) {
      const clockInEvt = await ShiftTimeEntry.findOne({
        where: { shift_id: shift.id, guard_id: guardId, event_type: "CLOCK_IN" },
      });
      if (clockInEvt) alreadyClockedIn = true;
    }

    // ✅ Allow if: guard is assigned to shift OR shift is OPEN and unassigned OR guard has clocked in
    const isAssigned = String(shift.guard_id) === String(guardId);
    const shiftStatus = String(shift.status || "").toUpperCase();
    const isOpenAndUnassigned = shiftStatus === "OPEN" && !shift.guard_id;
    
    if (!isAssigned && !isOpenAndUnassigned && !hasTimeEntry) {
      return res.status(403).json({ message: "Guard is not assigned to this shift" });
    }

    if (alreadyClockedIn) {
      return res.status(400).json({ message: "Already clocked in; running-late not allowed." });
    }

    // Rate limit: 1 notice per X minutes
    // TODO: Change back to 30 minutes when testing is complete
    const cooldownMinutes = 1; // Testing: 1 minute | Production: 30 minutes
    const lastNotice = await ShiftTimeEntry.findOne({
      where: { shift_id: shift.id, guard_id: guardId, event_type: "LATE_NOTICE" },
      order: [["event_time", "DESC"]],
    });

    if (lastNotice) {
      const minsSince = minutesDiff(new Date(lastNotice.event_time), new Date());
      if (minsSince < cooldownMinutes) {
        return res.status(429).json({
          message: `Running-late already sent. Try again in ${cooldownMinutes - minsSince} min.`,
        });
      }
    }

    const now = new Date();
    const start = parseShiftStart(shift);
    const minsLate = minutesDiff(start, now);

    const evt = await ShiftTimeEntry.create({
      shift_id: shift.id,
      guard_id: guardId,
      event_type: "LATE_NOTICE",
      event_time: now,
      source: "MOBILE",
      ip_address: ip || null,
      user_agent: req.headers["user-agent"] || null,
      meta: { etaMinutes: etaMinutes ?? null, reason },
    });

    // ✅ Update shift's ai_decision to mark as running late (for admin dashboard)
    const currentAiDecision = shift.ai_decision || {};
    shift.ai_decision = {
      ...currentAiDecision,
      running_late: true,
      late_reason: reason || "Running late",
      marked_late_at: now.toISOString(),
    };
    await shift.save();

    const payload = {
      type: "RUNNING_LATE",
      shiftId: shift.id,
      guardId,
      guardName: shift.Guard?.name || null,
      minsLate,
      etaMinutes: etaMinutes ?? null,
      reason,
      eventId: evt.id,
      createdAt: now.toISOString(),
    };

    if (io) {
      io.to("admin").emit("guard_running_late", payload);
      io.to("admins").emit("guard_running_late", payload); // Also emit to admins room
      // Note: Supervisor alerts removed since Admin model doesn't have a role column
    }

    return res.json({ ok: true, payload });
  } catch (e) {
    return res.status(500).json({ message: "Server error", error: String(e.message || e) });
  }
}

// ✅ Optional: current state/history endpoint for UI
async function getMyShiftState(req, res) {
  try {
    const { shiftId } = req.params;
    // ✅ Get guardId from authenticated user (set by guardAuth middleware)
    const guardId = req.user?.guardId || req.guard?.id || req.query?.guardId || req.body?.guardId;

    if (!shiftId) return res.status(400).json({ message: "Missing shiftId" });
    if (!guardId) return res.status(401).json({ message: "Missing guard identity (auth)" });

    const te = await TimeEntry.findOne({ where: { shift_id: shiftId, guard_id: guardId } });

    const events = await ShiftTimeEntry.findAll({
      where: { shift_id: shiftId, guard_id: guardId },
      order: [["event_time", "ASC"]],
    });

    // ✅ Transform timeEntry to include user-friendly status fields
    // Determine actual status: if clocked out exists AND is after clock in, then clocked out
    // Otherwise, if clocked in exists, then clocked in (even if there was a previous clock out)
    const hasClockIn = Boolean(te?.clock_in_at);
    const hasClockOut = Boolean(te?.clock_out_at);
    const isCurrentlyClockedOut = hasClockOut && hasClockIn && 
      new Date(te.clock_out_at) >= new Date(te.clock_in_at);
    const isOnBreak = Boolean(te?.lunch_start_at && !te?.lunch_end_at);
    const isCurrentlyClockedIn = hasClockIn && !isCurrentlyClockedOut;
    
    const state = {
      ok: true,
      timeEntry: te || null,
      events: events || [],
      // User-friendly status fields for frontend
      clockedIn: isCurrentlyClockedIn,
      clocked_in: isCurrentlyClockedIn,
      clockedOut: isCurrentlyClockedOut,
      clocked_out: isCurrentlyClockedOut,
      onBreak: isOnBreak,
      on_break: isOnBreak,
      // Status string for easy checking
      status: isCurrentlyClockedOut
        ? "CLOCKED_OUT"
        : isOnBreak
        ? "ON_BREAK"
        : isCurrentlyClockedIn
        ? "CLOCKED_IN"
        : "NOT_STARTED",
      // Timestamps
      clockInAt: te?.clock_in_at || null,
      clockOutAt: te?.clock_out_at || null,
      lunchStartAt: te?.lunch_start_at || null,
      lunchEndAt: te?.lunch_end_at || null,
    };

    return res.json(state);
  } catch (e) {
    return res.status(500).json({ message: "Server error", error: String(e.message || e) });
  }
}

module.exports = {
  clockIn,
  clockOut,
  breakStart,
  breakEnd,
  getMyShiftState,
  runningLate,
};
 