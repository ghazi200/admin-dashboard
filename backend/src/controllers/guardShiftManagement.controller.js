/**
 * Guard Shift Management Controller
 * 
 * Handles:
 * - Shift Swap Marketplace
 * - Shift Availability Preferences
 * - Shift Notes & Reports
 * - Shift History & Analytics
 */

const { getTenantWhere, ensureTenantId, canAccessTenant } = require("../utils/tenantFilter");
const {
  normId,
  isUUID,
  checkShiftEligibleForSwap,
  shiftWhen,
  notifyGuardSwap,
} = require("../utils/shiftSwapHelpers");

// =====================
// SHIFT SWAP MARKETPLACE
// =====================

/**
 * POST /api/guards/shifts/swap/request
 * Request a shift swap
 */
exports.requestShiftSwap = async (req, res) => {
  try {
    const { ShiftSwap, Shift } = req.app.locals.models;
    const { shift_id, target_guard_id, target_shift_id, reason } = req.body;
    const guardId = req.guard?.id || req.body.guard_id;

    if (!shift_id) {
      return res.status(400).json({ message: "shift_id is required" });
    }
    if (!guardId) {
      return res.status(400).json({ message: "guard_id is required" });
    }

    const shift = await Shift.findByPk(shift_id);
    if (!shift) {
      return res.status(404).json({ message: "Shift not found" });
    }

    if (normId(shift.guard_id) !== normId(guardId)) {
      return res.status(403).json({ message: "You can only swap your own shifts" });
    }

    const eligible = checkShiftEligibleForSwap(shift);
    if (!eligible.ok) {
      return res.status(eligible.status).json({ message: eligible.message });
    }

    const guardTenant = req.guard?.tenant_id ? String(req.guard.tenant_id) : null;
    const shiftTenant = shift.tenant_id != null ? String(shift.tenant_id) : null;
    if (guardTenant && shiftTenant && guardTenant !== shiftTenant) {
      return res.status(403).json({ message: "Shift belongs to a different tenant" });
    }

    const existingSwap = await ShiftSwap.findOne({
      where: { shift_id, status: "pending" },
    });
    if (existingSwap) {
      return res.status(400).json({ message: "This shift already has a pending swap request" });
    }

    const tenantId = req.guard?.tenant_id || shift.tenant_id || null;
    const swap = await ShiftSwap.create({
      shift_id,
      requester_guard_id: guardId,
      // Direct target is optional; marketplace accept fills this. Ignore empty string.
      target_guard_id: target_guard_id && isUUID(target_guard_id) ? target_guard_id : null,
      target_shift_id: target_shift_id && isUUID(target_shift_id) ? target_shift_id : null,
      reason: reason || null,
      status: "pending",
      tenant_id: tenantId,
    });

    try {
      const { notify } = require("../utils/notify");
      await notify(req.app, {
        type: "SHIFT_SWAP_REQUESTED",
        title: "New Shift Swap Request",
        message: `Guard requested to swap ${shiftWhen(shift)}`,
        entityType: "shift_swap",
        entityId: swap.id,
      });
    } catch (notifyErr) {
      console.error("[requestShiftSwap] Notification error (non-fatal):", notifyErr.message);
    }

    return res.status(201).json(swap.toJSON ? swap.toJSON() : swap);
  } catch (e) {
    console.error("requestShiftSwap error:", e);
    return res.status(500).json({
      message: "Failed to request shift swap",
      error: e.message,
    });
  }
};

/**
 * GET /api/guards/shifts/swap/available
 * Get available shifts for swapping
 */
exports.getAvailableSwaps = async (req, res) => {
  try {
    const { sequelize } = req.app.locals.models;
    const guardId = req.guard?.id || req.query.guard_id;
    if (!guardId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const tenantId = req.guard?.tenant_id || null;
    // Prefer parameterized tenant filter; if tenant missing, still show only swaps matching
    // the guard's own shift tenant via join (own swaps) — do not open all tenants.
    const bind = [guardId];
    let tenantSql = "";
    if (tenantId) {
      bind.push(tenantId);
      tenantSql = `AND (s.tenant_id = $${bind.length}::uuid OR s.tenant_id IS NULL)`;
    } else {
      // No tenant on guard: only own swaps (cannot browse others cross-tenant)
      tenantSql = `AND ss.requester_guard_id = $1::uuid`;
    }

    const [availableShifts] = await sequelize.query(
      `
      SELECT 
        s.id,
        s.shift_date,
        s.shift_start,
        s.shift_end,
        s.location,
        s.status as shift_status,
        s.pending_guard_id,
        g.name as guard_name,
        g.email as guard_email,
        ss.id as swap_id,
        ss.status as status,
        ss.reason,
        ss.requester_guard_id,
        ss.target_guard_id,
        ss.created_at as posted_at
      FROM shifts s
      INNER JOIN guards g ON s.guard_id = g.id
      INNER JOIN shift_swaps ss ON s.id = ss.shift_id
      WHERE ss.status = 'pending'
        AND UPPER(TRIM(s.status::text)) <> 'CLOSED'
        AND s.pending_guard_id IS NULL
        AND (
          (ss.requester_guard_id <> $1::uuid AND s.guard_id <> $1::uuid)
          OR ss.requester_guard_id = $1::uuid
        )
        ${tenantSql}
      ORDER BY ss.created_at DESC
      LIMIT 50
      `,
      { bind }
    );

    return res.json({ data: availableShifts });
  } catch (e) {
    console.error("getAvailableSwaps error:", e);
    return res.status(500).json({ message: "Failed to load available swaps", error: e.message });
  }
};

/**
 * DELETE /api/guards/shifts/swap/:id/cancel
 * Cancel a shift swap request (only if requester is the current guard)
 */
exports.cancelShiftSwap = async (req, res) => {
  try {
    const { ShiftSwap, Shift } = req.app.locals.models;
    const swapId = req.params.id;
    const guardId = req.guard?.id || req.body.guard_id;

    const swap = await ShiftSwap.findByPk(swapId);
    if (!swap) {
      return res.status(404).json({ message: "Swap request not found" });
    }

    if (normId(swap.requester_guard_id) !== normId(guardId)) {
      return res.status(403).json({ message: "You can only cancel your own swap requests" });
    }

    if (swap.status !== "pending") {
      return res.status(400).json({ message: "Only pending swaps can be cancelled" });
    }

    const claimedBy = swap.target_guard_id;
    await swap.update({ status: "cancelled" });

    const shift = await Shift.findByPk(swap.shift_id);

    try {
      const { notify } = require("../utils/notify");
      await notify(req.app, {
        type: "SHIFT_SWAP_CANCELLED",
        title: "Shift Swap Cancelled",
        message: `Guard cancelled swap request for ${shiftWhen(shift)}`,
        entityType: "shift_swap",
        entityId: swap.id,
      });
    } catch (_) {
      /* non-fatal */
    }

    if (claimedBy && normId(claimedBy) !== normId(guardId)) {
      await notifyGuardSwap(req.app, {
        guardId: claimedBy,
        type: "SHIFT_SWAP_CANCELLED",
        title: "Swap offer withdrawn",
        message: `The swap you claimed for ${shiftWhen(shift)} was cancelled by the poster.`,
        shiftId: swap.shift_id,
        swapId: swap.id,
      });
    }

    return res.json({ message: "Swap request cancelled successfully", swap });
  } catch (e) {
    console.error("cancelShiftSwap error:", e);
    return res.status(500).json({ message: "Failed to cancel swap request", error: e.message });
  }
};

/**
 * POST /api/guards/shifts/swap/:id/accept
 * Claim a pending swap (first claim wins; still needs admin approval)
 */
exports.acceptShiftSwap = async (req, res) => {
  try {
    const { sequelize } = req.app.locals.models;
    const swapId = req.params.id;
    const guardId = req.guard?.id || req.body.guard_id;

    if (!guardId || !isUUID(guardId)) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    if (!isUUID(swapId)) {
      return res.status(400).json({ message: "Invalid swap id" });
    }

    const [swapRows] = await sequelize.query(
      `SELECT ss.*, s.status AS shift_status, s.guard_id AS shift_guard_id,
              s.tenant_id AS shift_tenant_id, s.pending_guard_id,
              s.location, s.shift_date, s.shift_start, s.shift_end
       FROM shift_swaps ss
       INNER JOIN shifts s ON s.id = ss.shift_id
       WHERE ss.id = $1::uuid
       LIMIT 1`,
      { bind: [swapId] }
    );
    const swap = swapRows?.[0];
    if (!swap) {
      return res.status(404).json({ message: "Swap request not found" });
    }

    if (String(swap.status) !== "pending") {
      return res.status(400).json({ message: "Swap request is not pending" });
    }
    if (normId(swap.requester_guard_id) === normId(guardId)) {
      return res.status(400).json({ message: "You cannot accept your own swap request" });
    }
    if (swap.target_guard_id) {
      return res.status(409).json({
        message: "This swap was already claimed by another guard",
        target_guard_id: swap.target_guard_id,
      });
    }

    const eligible = checkShiftEligibleForSwap({
      status: swap.shift_status,
      pending_guard_id: swap.pending_guard_id,
    });
    if (!eligible.ok) {
      return res.status(eligible.status).json({ message: eligible.message });
    }

    const guardTenant = req.guard?.tenant_id ? String(req.guard.tenant_id) : null;
    const shiftTenant = swap.shift_tenant_id != null ? String(swap.shift_tenant_id) : null;
    if (guardTenant && shiftTenant && guardTenant !== shiftTenant) {
      return res.status(403).json({ message: "Cannot accept a swap from another tenant" });
    }

    // Atomic first-claim
    const [claimed] = await sequelize.query(
      `
      UPDATE shift_swaps
      SET target_guard_id = $1::uuid, updated_at = NOW()
      WHERE id = $2::uuid
        AND status = 'pending'
        AND target_guard_id IS NULL
      RETURNING *
      `,
      { bind: [guardId, swapId] }
    );
    const updated = claimed?.[0];
    if (!updated) {
      return res.status(409).json({ message: "This swap was already claimed by another guard" });
    }

    try {
      const { notify } = require("../utils/notify");
      await notify(req.app, {
        type: "SHIFT_SWAP_ACCEPTED",
        title: "Shift Swap Claimed",
        message: `Guard claimed swap for ${shiftWhen(swap)} — awaiting approval`,
        entityType: "shift_swap",
        entityId: swapId,
      });
    } catch (_) {
      /* non-fatal */
    }

    await notifyGuardSwap(req.app, {
      guardId: swap.requester_guard_id,
      type: "SHIFT_SWAP_CLAIMED",
      title: "Someone claimed your swap",
      message: `Another guard claimed your swap for ${shiftWhen(swap)}. Waiting for admin approval.`,
      shiftId: swap.shift_id,
      swapId,
    });

    return res.json({
      message: "Swap claimed — awaiting admin/supervisor approval",
      swap: updated,
    });
  } catch (e) {
    console.error("acceptShiftSwap error:", e);
    return res.status(500).json({ message: "Failed to accept swap", error: e.message });
  }
};

// =====================
// SHIFT AVAILABILITY PREFERENCES
// =====================

/**
 * GET /api/guards/availability/preferences
 * Get guard availability preferences
 */
exports.getAvailabilityPreferences = async (req, res) => {
  try {
    const { GuardAvailabilityPref } = req.app.locals.models;
    const guardId = req.guard?.id || req.query.guard_id;

    if (!guardId) {
      return res.status(400).json({ message: "guard_id is required" });
    }

    let prefs = await GuardAvailabilityPref.findOne({ where: { guard_id: guardId } });

    // Create default if doesn't exist
    if (!prefs) {
      const tenantId = req.guard?.tenant_id || req.admin?.tenant_id;
      const tenantData = { guard_id: guardId, tenant_id: tenantId };
      prefs = await GuardAvailabilityPref.create({
        guard_id: guardId,
        preferred_days: [],
        preferred_times: [],
        blocked_dates: [],
        min_hours_per_week: 0,
        max_hours_per_week: 40,
        location_preferences: [],
        tenant_id: tenantData.tenant_id,
      });
    }

    return res.json(prefs);
  } catch (e) {
    console.error("getAvailabilityPreferences error:", e);
    return res.status(500).json({ message: "Failed to load preferences", error: e.message });
  }
};

/**
 * PUT /api/guards/availability/preferences
 * Update guard availability preferences
 */
exports.updateAvailabilityPreferences = async (req, res) => {
  try {
    const { GuardAvailabilityPref } = req.app.locals.models;
    const guardId = req.guard?.id || req.body.guard_id;

    if (!guardId) {
      return res.status(400).json({ message: "guard_id is required" });
    }

    const {
      preferred_days,
      preferred_times,
      blocked_dates,
      min_hours_per_week,
      max_hours_per_week,
      location_preferences,
    } = req.body;

    let prefs = await GuardAvailabilityPref.findOne({ where: { guard_id: guardId } });

    if (prefs) {
      await prefs.update({
        preferred_days: preferred_days || prefs.preferred_days,
        preferred_times: preferred_times || prefs.preferred_times,
        blocked_dates: blocked_dates || prefs.blocked_dates,
        min_hours_per_week: min_hours_per_week ?? prefs.min_hours_per_week,
        max_hours_per_week: max_hours_per_week ?? prefs.max_hours_per_week,
        location_preferences: location_preferences || prefs.location_preferences,
      });
    } else {
      const tenantId = req.guard?.tenant_id || req.admin?.tenant_id;
      const tenantData = { guard_id: guardId, tenant_id: tenantId };
      prefs = await GuardAvailabilityPref.create({
        guard_id: guardId,
        preferred_days: preferred_days || [],
        preferred_times: preferred_times || [],
        blocked_dates: blocked_dates || [],
        min_hours_per_week: min_hours_per_week || 0,
        max_hours_per_week: max_hours_per_week || 40,
        location_preferences: location_preferences || [],
        tenant_id: tenantData.tenant_id,
      });
    }

    return res.json(prefs);
  } catch (e) {
    console.error("updateAvailabilityPreferences error:", e);
    return res.status(500).json({ message: "Failed to update preferences", error: e.message });
  }
};

// =====================
// SHIFT NOTES & REPORTS
// =====================

/**
 * POST /api/guards/shifts/:id/report
 * Submit a shift report/notes
 */
exports.submitShiftReport = async (req, res) => {
  try {
    const { Shift, ShiftReportPhoto } = req.app.locals.models;
    const shiftId = req.params.id;
    const guardId = req.guard?.id || req.body.guard_id;
    const { notes, report_type, photos } = req.body;

    const shift = await Shift.findByPk(shiftId);
    if (!shift) {
      return res.status(404).json({ message: "Shift not found" });
    }

    // Verify guard is assigned to this shift
    if (shift.guard_id !== guardId) {
      return res.status(403).json({ message: "You can only report on your assigned shifts" });
    }

    // Update shift with notes/report
    await shift.update({
      notes: notes || shift.notes,
      report_type: report_type || shift.report_type,
      report_submitted_at: new Date(),
      report_submitted_by: guardId,
    });

    // Handle photo uploads (if provided)
    if (photos && Array.isArray(photos) && photos.length > 0) {
      const tenantId = req.guard?.tenant_id || req.admin?.tenant_id || shift.tenant_id;
      const tenantData = { tenant_id: tenantId };
      
      for (const photo of photos) {
        await ShiftReportPhoto.create({
          shift_id: shiftId,
          photo_url: photo.url || photo,
          photo_type: photo.type || "incident",
          description: photo.description || null,
          uploaded_by: guardId,
          tenant_id: tenantData.tenant_id,
        });
      }
    }

    // Notify admins
    const { notify } = require("../utils/notify");
    await notify(req.app, {
      type: "SHIFT_REPORT_SUBMITTED",
      title: "Shift Report Submitted",
      message: `Report submitted for shift on ${shift.shift_date} at ${shift.location}`,
      entityType: "shift",
      entityId: shiftId,
    });

    return res.json({ message: "Report submitted successfully", shift });
  } catch (e) {
    console.error("submitShiftReport error:", e);
    return res.status(500).json({ message: "Failed to submit report", error: e.message });
  }
};

/**
 * GET /api/guards/shifts/:id/report
 * Get shift report
 */
exports.getShiftReport = async (req, res) => {
  try {
    const { Shift, ShiftReportPhoto } = req.app.locals.models;
    const shiftId = req.params.id;

    const shift = await Shift.findByPk(shiftId);
    if (!shift) {
      return res.status(404).json({ message: "Shift not found" });
    }

    const photos = await ShiftReportPhoto.findAll({
      where: { shift_id: shiftId },
      order: [["created_at", "DESC"]],
    });

    return res.json({
      shift: {
        id: shift.id,
        notes: shift.notes,
        report_type: shift.report_type,
        report_submitted_at: shift.report_submitted_at,
      },
      photos: photos.map(p => ({
        id: p.id,
        photo_url: p.photo_url,
        photo_type: p.photo_type,
        description: p.description,
        created_at: p.created_at,
      })),
    });
  } catch (e) {
    console.error("getShiftReport error:", e);
    return res.status(500).json({ message: "Failed to load report", error: e.message });
  }
};

// =====================
// SHIFT HISTORY & ANALYTICS
// =====================

/**
 * GET /api/guards/shifts/history
 * Get guard's shift history with analytics
 */
exports.getShiftHistory = async (req, res) => {
  try {
    const { sequelize } = req.app.locals.models;
    const guardId = req.guard?.id || req.query.guard_id;
    const { start_date, end_date, limit = 50 } = req.query;

    if (!guardId) {
      return res.status(400).json({ message: "guard_id is required" });
    }

    let dateFilter = "";
    const params = [guardId];
    
    if (start_date && end_date) {
      params.push(start_date, end_date);
      dateFilter = `AND s.shift_date BETWEEN $${params.length - 1} AND $${params.length}`;
    }

    // Get shift history with overtime breakdown
    // First, get shifts with time entries
    const [history] = await sequelize.query(`
      SELECT 
        s.id,
        s.shift_date,
        s.shift_start,
        s.shift_end,
        s.location,
        s.status,
        s.notes,
        s.report_type,
        te.clock_in_at,
        te.clock_out_at,
        CASE 
          -- Use actual clock in/out times if available
          WHEN te.clock_in_at IS NOT NULL AND te.clock_out_at IS NOT NULL 
          THEN EXTRACT(EPOCH FROM (te.clock_out_at - te.clock_in_at)) / 3600
          -- Fallback to shift duration if no time entries
          WHEN s.shift_start IS NOT NULL AND s.shift_end IS NOT NULL
          THEN EXTRACT(EPOCH FROM (
            (s.shift_date::date + s.shift_end::time)::timestamp - 
            (s.shift_date::date + s.shift_start::time)::timestamp
          )) / 3600
          ELSE NULL
        END as hours_worked
      FROM shifts s
      LEFT JOIN time_entries te ON s.id = te.shift_id
      WHERE s.guard_id = $1
        ${dateFilter}
      ORDER BY s.shift_date DESC, s.shift_start DESC
      LIMIT $${params.length + 1}
    `, { bind: [...params, parseInt(limit)] });

    // Now enrich with overtime data from timesheet_lines
    // Match by shift_date and guard_id through timesheets
    const shiftIds = history.map(s => s.id);
    const shiftDates = [...new Set(history.map(s => {
      // Normalize dates to YYYY-MM-DD format
      const date = s.shift_date instanceof Date 
        ? s.shift_date.toISOString().split('T')[0]
        : String(s.shift_date).split('T')[0];
      return date;
    }))];
    
    let overtimeData = {};
    if (shiftDates.length > 0) {
      try {
        // Use date comparison that handles different date formats
        const [overtimeRows] = await sequelize.query(`
          SELECT 
            tl.date::text as date,
            tl.regular_hours,
            tl.overtime_hours,
            tl.double_time_hours,
            tl.premium_hours,
            tl.premium_type,
            ts.guard_id,
            ts.status as timesheet_status
          FROM timesheet_lines tl
          JOIN timesheets ts ON tl.timesheet_id = ts.id
          WHERE ts.guard_id = $1::uuid
            AND tl.date::text = ANY($2::text[])
        `, { 
          bind: [guardId, shiftDates],
          type: sequelize.QueryTypes.SELECT
        });
        
        // Create a map by date for quick lookup
        overtimeRows.forEach(row => {
          // Handle date format - convert to string for consistent matching
          const dateKey = row.date instanceof Date 
            ? row.date.toISOString().split('T')[0] 
            : String(row.date).split('T')[0];
          
          overtimeData[dateKey] = {
            regular_hours: parseFloat(row.regular_hours || 0),
            overtime_hours: parseFloat(row.overtime_hours || 0),
            double_time_hours: parseFloat(row.double_time_hours || 0),
            premium_hours: parseFloat(row.premium_hours || 0),
            premium_type: row.premium_type,
            timesheet_status: row.timesheet_status,
          };
        });
      } catch (err) {
        console.warn("⚠️ Could not fetch overtime data (timesheets may not exist yet):", err.message);
        // Continue without overtime data - it's optional
      }
      
      // Always calculate overtime on-the-fly from time entries if timesheet data is missing
      // This ensures we show overtime even if timesheets haven't been generated yet
      try {
        // Calculate overtime for ALL shifts with hours_worked
        for (const shift of history) {
          if (shift.hours_worked != null && shift.hours_worked > 0) {
            const hours = parseFloat(shift.hours_worked);
            const shiftDate = shift.shift_date instanceof Date
              ? shift.shift_date.toISOString().split('T')[0]
              : String(shift.shift_date).split('T')[0];
            
            // If we already have timesheet data for this date, use it (don't override)
            if (overtimeData[shiftDate] && overtimeData[shiftDate].timesheet_status !== 'CALCULATED') {
              continue;
            }
            
            // Simple overtime calculation: >8 hours = OT, >12 hours = DT
            let regular = Math.min(hours, 8);
            let overtime = 0;
            let doubleTime = 0;
            
            if (hours > 12) {
              doubleTime = hours - 12;
              overtime = 4; // 8-12 hours
              regular = 8;
            } else if (hours > 8) {
              overtime = hours - 8;
              regular = 8;
            }
            
            // Always store calculated overtime (even if 0, so we have the breakdown)
            overtimeData[shiftDate] = {
              regular_hours: regular,
              overtime_hours: overtime,
              double_time_hours: doubleTime,
              premium_hours: 0,
              premium_type: null,
              timesheet_status: 'CALCULATED',
            };
          }
        }
      } catch (calcErr) {
        // Continue without calculated overtime - it's optional
      }
    }

    // Enrich history with overtime data
    const enrichedHistory = history.map(shift => {
      // Handle date format - convert to string for consistent matching
      const shiftDate = shift.shift_date instanceof Date
        ? shift.shift_date.toISOString().split('T')[0]
        : String(shift.shift_date).split('T')[0];
      
      const otData = overtimeData[shiftDate] || {};
      
      // ALWAYS calculate overtime if we have hours_worked
      // This ensures we always have the breakdown, even if timesheet data doesn't exist
      const hours = parseFloat(shift.hours_worked) || 0;
      let finalOtData;
      
      // Check if we have valid timesheet data (not just an empty object)
      const hasTimesheetData = otData && Object.keys(otData).length > 0 &&
        (otData.regular_hours != null || otData.overtime_hours != null || otData.double_time_hours != null);
      
      if (hasTimesheetData) {
        // Use timesheet data if available
        finalOtData = {
          regular_hours: parseFloat(otData.regular_hours || 0),
          overtime_hours: parseFloat(otData.overtime_hours || 0),
          double_time_hours: parseFloat(otData.double_time_hours || 0),
          premium_hours: parseFloat(otData.premium_hours || 0),
          premium_type: otData.premium_type || null,
          timesheet_status: otData.timesheet_status || null,
        };
      } else if (hours > 0) {
        // Calculate on-the-fly from hours_worked
        let regular = Math.min(hours, 8);
        let overtime = 0;
        let doubleTime = 0;
        
        if (hours > 12) {
          doubleTime = hours - 12;
          overtime = 4; // 8-12 hours
          regular = 8;
        } else if (hours > 8) {
          overtime = hours - 8;
          regular = 8;
        }
        
        finalOtData = {
          regular_hours: regular,
          overtime_hours: overtime,
          double_time_hours: doubleTime,
          premium_hours: 0,
          premium_type: null,
          timesheet_status: 'CALCULATED',
        };
      } else {
        // No hours worked
        finalOtData = {
          regular_hours: 0,
          overtime_hours: 0,
          double_time_hours: 0,
          premium_hours: 0,
          premium_type: null,
          timesheet_status: null,
        };
      }
      
      const enrichedShift = {
        ...shift,
        regular_hours: finalOtData.regular_hours != null ? Number(finalOtData.regular_hours) : 0,
        overtime_hours: finalOtData.overtime_hours != null ? Number(finalOtData.overtime_hours) : 0,
        double_time_hours: finalOtData.double_time_hours != null ? Number(finalOtData.double_time_hours) : 0,
        premium_hours: finalOtData.premium_hours != null ? finalOtData.premium_hours : 0,
        premium_type: finalOtData.premium_type || null,
        timesheet_status: finalOtData.timesheet_status || null,
      };
      
      return enrichedShift;
    });

    // Calculate analytics including overtime
    const totalShifts = enrichedHistory.length;
    const completedShifts = enrichedHistory.filter(s => s.status === "CLOSED" || s.clock_out_at).length;
    const totalHours = enrichedHistory.reduce((sum, s) => sum + (parseFloat(s.hours_worked) || 0), 0);
    const avgHoursPerShift = totalShifts > 0 ? totalHours / totalShifts : 0;
    
    // Overtime analytics
    const totalRegularHours = enrichedHistory.reduce((sum, s) => sum + (parseFloat(s.regular_hours) || 0), 0);
    const totalOvertimeHours = enrichedHistory.reduce((sum, s) => sum + (parseFloat(s.overtime_hours) || 0), 0);
    const totalDoubleTimeHours = enrichedHistory.reduce((sum, s) => sum + (parseFloat(s.double_time_hours) || 0), 0);
    const shiftsWithOvertime = enrichedHistory.filter(s => (parseFloat(s.overtime_hours) || 0) > 0 || (parseFloat(s.double_time_hours) || 0) > 0).length;
    const overtimePercentage = totalHours > 0 ? (totalOvertimeHours + totalDoubleTimeHours) / totalHours * 100 : 0;
    
    return res.json({
      history: enrichedHistory,
      analytics: {
        total_shifts: totalShifts,
        completed_shifts: completedShifts,
        total_hours: Math.round(totalHours * 100) / 100,
        avg_hours_per_shift: Math.round(avgHoursPerShift * 100) / 100,
        completion_rate: totalShifts > 0 ? Math.round((completedShifts / totalShifts) * 100) : 0,
        // Overtime breakdown
        regular_hours: Math.round(totalRegularHours * 100) / 100,
        overtime_hours: Math.round(totalOvertimeHours * 100) / 100,
        double_time_hours: Math.round(totalDoubleTimeHours * 100) / 100,
        shifts_with_overtime: shiftsWithOvertime,
        overtime_percentage: Math.round(overtimePercentage * 100) / 100,
      },
    });
  } catch (e) {
    console.error("getShiftHistory error:", e);
    return res.status(500).json({ message: "Failed to load shift history", error: e.message });
  }
};

/**
 * GET /api/guards/shifts/analytics
 * Get detailed shift analytics for guard
 */
exports.getShiftAnalytics = async (req, res) => {
  try {
    const { sequelize } = req.app.locals.models;
    const guardId = req.guard?.id || req.query.guard_id;
    const { period = "month" } = req.query; // month, year, all

    if (!guardId) {
      return res.status(400).json({ message: "guard_id is required" });
    }

    let dateFilter = "";
    if (period === "month") {
      dateFilter = "AND s.shift_date >= CURRENT_DATE - INTERVAL '30 days'";
    } else if (period === "year") {
      dateFilter = "AND s.shift_date >= CURRENT_DATE - INTERVAL '365 days'";
    }

    // Get analytics
    const [analytics] = await sequelize.query(`
      SELECT 
        COUNT(*) as total_shifts,
        COUNT(CASE WHEN s.status = 'CLOSED' OR te.clock_out_at IS NOT NULL THEN 1 END) as completed_shifts,
        COUNT(CASE WHEN s.status = 'OPEN' AND te.clock_out_at IS NULL THEN 1 END) as open_shifts,
        SUM(CASE 
          -- Use actual clock in/out times if available
          WHEN te.clock_in_at IS NOT NULL AND te.clock_out_at IS NOT NULL 
          THEN EXTRACT(EPOCH FROM (te.clock_out_at - te.clock_in_at)) / 3600
          -- Fallback to shift duration if no time entries
          WHEN s.shift_start IS NOT NULL AND s.shift_end IS NOT NULL
          THEN EXTRACT(EPOCH FROM (
            (s.shift_date::date + s.shift_end::time)::timestamp - 
            (s.shift_date::date + s.shift_start::time)::timestamp
          )) / 3600
          ELSE 0
        END) as total_hours,
        AVG(CASE 
          -- Use actual clock in/out times if available
          WHEN te.clock_in_at IS NOT NULL AND te.clock_out_at IS NOT NULL 
          THEN EXTRACT(EPOCH FROM (te.clock_out_at - te.clock_in_at)) / 3600
          -- Fallback to shift duration if no time entries
          WHEN s.shift_start IS NOT NULL AND s.shift_end IS NOT NULL
          THEN EXTRACT(EPOCH FROM (
            (s.shift_date::date + s.shift_end::time)::timestamp - 
            (s.shift_date::date + s.shift_start::time)::timestamp
          )) / 3600
          ELSE NULL
        END) as avg_hours_per_shift
      FROM shifts s
      LEFT JOIN time_entries te ON s.id = te.shift_id
      WHERE s.guard_id = $1
        ${dateFilter}
    `, { bind: [guardId] });

    const stats = analytics[0] || {};

    // Get overtime analytics from timesheets for this period
    let overtimeStats = {
      regular_hours: 0,
      overtime_hours: 0,
      double_time_hours: 0,
      shifts_with_overtime: 0,
    };

    try {
      let periodFilter = "";
      if (period === "month") {
        periodFilter = "AND pp.period_start >= CURRENT_DATE - INTERVAL '30 days'";
      } else if (period === "year") {
        periodFilter = "AND pp.period_start >= CURRENT_DATE - INTERVAL '365 days'";
      }

      const [otAnalytics] = await sequelize.query(`
        SELECT 
          COALESCE(SUM(tl.regular_hours), 0) as regular_hours,
          COALESCE(SUM(tl.overtime_hours), 0) as overtime_hours,
          COALESCE(SUM(tl.double_time_hours), 0) as double_time_hours,
          COUNT(DISTINCT CASE WHEN tl.overtime_hours > 0 OR tl.double_time_hours > 0 THEN tl.date END) as shifts_with_overtime
        FROM timesheet_lines tl
        JOIN timesheets ts ON tl.timesheet_id = ts.id
        JOIN pay_periods pp ON ts.pay_period_id = pp.id
        WHERE ts.guard_id = $1
          ${periodFilter}
      `, { bind: [guardId] });

      if (otAnalytics && otAnalytics.length > 0) {
        overtimeStats = {
          regular_hours: Math.round(parseFloat(otAnalytics[0].regular_hours || 0) * 100) / 100,
          overtime_hours: Math.round(parseFloat(otAnalytics[0].overtime_hours || 0) * 100) / 100,
          double_time_hours: Math.round(parseFloat(otAnalytics[0].double_time_hours || 0) * 100) / 100,
          shifts_with_overtime: parseInt(otAnalytics[0].shifts_with_overtime || 0),
        };
      }
    } catch (err) {
      console.warn("⚠️ Could not fetch overtime analytics (timesheets may not exist yet):", err.message);
      // Continue without overtime data - it's optional
    }

    const totalHours = parseFloat(stats.total_hours || 0);
    const overtimePercentage = totalHours > 0 
      ? ((overtimeStats.overtime_hours + overtimeStats.double_time_hours) / totalHours * 100) 
      : 0;

    return res.json({
      period,
      stats: {
        total_shifts: parseInt(stats.total_shifts || 0),
        completed_shifts: parseInt(stats.completed_shifts || 0),
        open_shifts: parseInt(stats.open_shifts || 0),
        total_hours: Math.round(totalHours * 100) / 100,
        avg_hours_per_shift: Math.round(parseFloat(stats.avg_hours_per_shift || 0) * 100) / 100,
        completion_rate: stats.total_shifts > 0 
          ? Math.round((stats.completed_shifts / stats.total_shifts) * 100) 
          : 0,
        // Overtime breakdown
        regular_hours: overtimeStats.regular_hours,
        overtime_hours: overtimeStats.overtime_hours,
        double_time_hours: overtimeStats.double_time_hours,
        shifts_with_overtime: overtimeStats.shifts_with_overtime,
        overtime_percentage: Math.round(overtimePercentage * 100) / 100,
      },
    });
  } catch (e) {
    console.error("getShiftAnalytics error:", e);
    return res.status(500).json({ message: "Failed to load analytics", error: e.message });
  }
};
