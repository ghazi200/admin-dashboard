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

// =====================
// SHIFT SWAP MARKETPLACE
// =====================

/**
 * POST /api/guards/shifts/swap/request
 * Request a shift swap
 */
exports.requestShiftSwap = async (req, res) => {
  try {
    const { ShiftSwap, Shift, Guard } = req.app.locals.models;
    const { shift_id, target_guard_id, target_shift_id, reason } = req.body;
    const guardId = req.guard?.id || req.body.guard_id; // From guard auth or body

    console.log("[requestShiftSwap] Request received:", { shift_id, guardId, hasModels: !!ShiftSwap });

    if (!shift_id) {
      return res.status(400).json({ message: "shift_id is required" });
    }

    if (!guardId) {
      return res.status(400).json({ message: "guard_id is required" });
    }

    // Get the shift
    const shift = await Shift.findByPk(shift_id);
    if (!shift) {
      return res.status(404).json({ message: "Shift not found" });
    }

    console.log("[requestShiftSwap] Shift found:", { id: shift.id, guard_id: shift.guard_id, shift_guard_type: typeof shift.guard_id, req_guard_type: typeof guardId });

    // Verify guard owns this shift (normalize for comparison)
    const shiftGuardId = String(shift.guard_id || "").trim();
    const reqGuardId = String(guardId || "").trim();
    if (shiftGuardId !== reqGuardId) {
      console.log("[requestShiftSwap] Guard mismatch:", { shiftGuardId, reqGuardId });
      return res.status(403).json({ message: "You can only swap your own shifts" });
    }

    // Check if shift is already swapped
    const existingSwap = await ShiftSwap.findOne({
      where: { shift_id, status: "pending" },
    });
    if (existingSwap) {
      return res.status(400).json({ message: "This shift already has a pending swap request" });
    }

    // Create swap request
    // Use guard's tenant_id or shift's tenant_id
    const tenantId = req.guard?.tenant_id || req.admin?.tenant_id || shift.tenant_id || null;
    const swapData = {
      shift_id,
      requester_guard_id: guardId,
      target_guard_id: target_guard_id || null,
      target_shift_id: target_shift_id || null,
      reason: reason || null,
      status: "pending",
      tenant_id: tenantId,
    };

    console.log("[requestShiftSwap] Creating swap with data:", swapData);

    const swap = await ShiftSwap.create(swapData);
    console.log("[requestShiftSwap] Swap created successfully:", swap.id);
    console.log("[requestShiftSwap] Swap data:", JSON.stringify(swap.toJSON(), null, 2));

    // Notify admins (wrap in try-catch to prevent notification errors from failing the request)
    try {
      const { notify } = require("../utils/notify");
      const notification = await notify(req.app, {
        type: "SHIFT_SWAP_REQUESTED",
        title: "New Shift Swap Request",
        message: `Guard requested to swap shift on ${shift.shift_date} ${shift.shift_start}-${shift.shift_end}`,
        entityType: "shift_swap",
        entityId: swap.id,
      });
      console.log("[requestShiftSwap] Notification created:", notification?.id || "created");
    } catch (notifyErr) {
      console.error("[requestShiftSwap] Notification error (non-fatal):", notifyErr.message);
      console.error("[requestShiftSwap] Notification error stack:", notifyErr.stack);
      // Continue even if notification fails
    }

    console.log("[requestShiftSwap] Sending success response...");
    try {
      const responseData = swap.toJSON ? swap.toJSON() : swap;
      console.log("[requestShiftSwap] Response data:", JSON.stringify(responseData, null, 2));
      return res.status(201).json(responseData);
    } catch (responseErr) {
      console.error("[requestShiftSwap] Error sending response:", responseErr);
      // Try to send at least the swap ID
      return res.status(201).json({ 
        id: swap.id,
        shift_id: swap.shift_id,
        status: swap.status,
        message: "Swap created successfully"
      });
    }
  } catch (e) {
    console.error("requestShiftSwap error:", e);
    console.error("Error name:", e.name);
    console.error("Error message:", e.message);
    console.error("Error stack:", e.stack);
    if (e.errors) {
      console.error("Sequelize validation errors:", e.errors);
    }
    return res.status(500).json({ 
      message: "Failed to request shift swap", 
      error: e.message,
      errorName: e.name,
      details: process.env.NODE_ENV === 'development' ? e.stack : undefined,
      validationErrors: e.errors || undefined
    });
  }
};

/**
 * GET /api/guards/shifts/swap/available
 * Get available shifts for swapping
 */
exports.getAvailableSwaps = async (req, res) => {
  try {
    const { ShiftSwap, Shift, Guard, sequelize } = req.app.locals.models;
    const guardId = req.guard?.id || req.query.guard_id;

    // Get shifts available for swap (posted by other guards)
    // Use guard's tenant_id if available, otherwise use admin's
    const tenantId = req.guard?.tenant_id || req.admin?.tenant_id;
    const tenantSql = tenantId 
      ? `AND s.tenant_id = '${tenantId}'`
      : "";

    // Get swaps from other guards (for accepting) AND own swaps (for cancelling)
    const [availableShifts] = await sequelize.query(`
      SELECT 
        s.id,
        s.shift_date,
        s.shift_start,
        s.shift_end,
        s.location,
        s.status as shift_status,
        g.name as guard_name,
        g.email as guard_email,
        ss.id as swap_id,
        ss.status as status,
        ss.reason,
        ss.requester_guard_id,
        ss.created_at as posted_at
      FROM shifts s
      INNER JOIN guards g ON s.guard_id = g.id
      INNER JOIN shift_swaps ss ON s.id = ss.shift_id
      WHERE ss.status = 'pending'
        AND (
          (ss.requester_guard_id != $1 AND s.guard_id != $1)  -- Other guards' swaps (for accepting)
          OR ss.requester_guard_id = $1                        -- Own swaps (for cancelling)
        )
        ${tenantSql}
      ORDER BY ss.created_at DESC
      LIMIT 50
    `, { bind: [guardId] });

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

    // Only the requester can cancel their own swap
    if (swap.requester_guard_id !== guardId) {
      return res.status(403).json({ message: "You can only cancel your own swap requests" });
    }

    // Only pending swaps can be cancelled
    if (swap.status !== "pending") {
      return res.status(400).json({ message: "Only pending swaps can be cancelled" });
    }

    // Update swap status to cancelled
    await swap.update({
      status: "cancelled",
    });

    // Notify admins
    const { notify } = require("../utils/notify");
    await notify(req.app, {
      type: "SHIFT_SWAP_CANCELLED",
      title: "Shift Swap Cancelled",
      message: `Guard cancelled swap request for shift`,
      entityType: "shift_swap",
      entityId: swap.id,
    });

    return res.json({ message: "Swap request cancelled successfully", swap });
  } catch (e) {
    console.error("cancelShiftSwap error:", e);
    return res.status(500).json({ message: "Failed to cancel swap request", error: e.message });
  }
};

/**
 * POST /api/guards/shifts/swap/:id/accept
 * Accept a shift swap request
 */
exports.acceptShiftSwap = async (req, res) => {
  try {
    const { ShiftSwap, Shift, sequelize } = req.app.locals.models;
    const swapId = req.params.id;
    const guardId = req.guard?.id || req.body.guard_id;

    const swap = await ShiftSwap.findByPk(swapId);
    if (!swap) {
      return res.status(404).json({ message: "Swap request not found" });
    }

    if (swap.status !== "pending") {
      return res.status(400).json({ message: "Swap request is not pending" });
    }

    // Get the shift
    const shift = await Shift.findByPk(swap.shift_id);
    if (!shift) {
      return res.status(404).json({ message: "Shift not found" });
    }

    // Update swap to show this guard is interested
    await swap.update({
      target_guard_id: guardId,
      status: "pending", // Still pending admin approval
    });

    // Notify admins
    const { notify } = require("../utils/notify");
    await notify(req.app, {
      type: "SHIFT_SWAP_ACCEPTED",
      title: "Shift Swap Accepted",
      message: `Guard accepted swap request for shift on ${shift.shift_date}`,
      entityType: "shift_swap",
      entityId: swap.id,
    });

    return res.json({ message: "Swap request accepted, awaiting admin approval", swap });
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
