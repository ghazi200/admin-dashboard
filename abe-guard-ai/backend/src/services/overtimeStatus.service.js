/**
 * Overtime Status Service
 * Real-time overtime calculation for guards
 */
const { Op } = require("sequelize");
const { calculateHoursWorked } = require("./payrollCalculator.service");

/**
 * Get real-time overtime status for a guard on a shift
 * @param {Object} models - Sequelize models
 * @param {string} guardId - Guard ID
 * @param {string} shiftId - Shift ID
 * @param {Object} thresholds - Overtime thresholds (optional)
 * @returns {Promise<Object>} Overtime status object
 */
async function getOvertimeStatus(models, guardId, shiftId, thresholds = {}) {
  const { TimeEntry, Shift } = models;
  const dailyOT = thresholds.dailyOT || 8;
  const weeklyOT = thresholds.weeklyOT || 40;
  const doubleTimeThreshold = thresholds.doubleTimeThreshold || 12;

  try {
    // Get current shift
    const shift = await Shift.findByPk(shiftId);
    if (!shift) {
      throw new Error("Shift not found");
    }

    // Get current time entry
    const timeEntry = await TimeEntry.findOne({
      where: {
        shift_id: shiftId,
        guard_id: guardId,
      },
    });

    if (!timeEntry || !timeEntry.clock_in_at) {
      return {
        currentHours: 0,
        weeklyHours: 0,
        projectedDaily: 0,
        projectedWeekly: 0,
        dailyOTThreshold: dailyOT,
        weeklyOTThreshold: weeklyOT,
        status: "not_clocked_in",
        alerts: [],
        requiresApproval: false,
      };
    }

    const now = new Date();
    const clockIn = new Date(timeEntry.clock_in_at);
    const shiftEnd = shift.shift_end ? new Date(`${shift.shift_date}T${shift.shift_end}`) : null;

    // Calculate current hours worked today (excluding breaks)
    let currentHours = 0;
    if (timeEntry.clock_out_at) {
      // Already clocked out - use clock_out_at
      const clockOut = new Date(timeEntry.clock_out_at);
      currentHours = calculateHoursWorked(
        clockIn,
        clockOut,
        timeEntry.lunch_start_at ? new Date(timeEntry.lunch_start_at) : null,
        timeEntry.lunch_end_at ? new Date(timeEntry.lunch_end_at) : null
      );
    } else {
      // Still clocked in - calculate from clock_in to now
      currentHours = calculateHoursWorked(
        clockIn,
        now,
        timeEntry.lunch_start_at ? new Date(timeEntry.lunch_start_at) : null,
        timeEntry.lunch_end_at ? new Date(timeEntry.lunch_end_at) : null
      );
    }

    // Calculate weekly hours (all shifts this week)
    const weekStart = new Date(now);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay()); // Sunday
    weekStart.setHours(0, 0, 0, 0);

    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);

    const weeklyEntries = await TimeEntry.findAll({
      where: {
        guard_id: guardId,
        clock_in_at: {
          [Op.gte]: weekStart,
          [Op.lt]: weekEnd,
        },
      },
    });

    let weeklyHours = 0;
    for (const entry of weeklyEntries) {
      if (entry.clock_in_at && entry.clock_out_at) {
        const entryHours = calculateHoursWorked(
          new Date(entry.clock_in_at),
          new Date(entry.clock_out_at),
          entry.lunch_start_at ? new Date(entry.lunch_start_at) : null,
          entry.lunch_end_at ? new Date(entry.lunch_end_at) : null
        );
        weeklyHours += entryHours;
      } else if (entry.clock_in_at && !entry.clock_out_at) {
        // Current shift - use current hours
        const entryHours = calculateHoursWorked(
          new Date(entry.clock_in_at),
          now,
          entry.lunch_start_at ? new Date(entry.lunch_start_at) : null,
          entry.lunch_end_at ? new Date(entry.lunch_end_at) : null
        );
        weeklyHours += entryHours;
      }
    }

    // Projected hours if shift continues to end
    let projectedDaily = currentHours;
    let projectedWeekly = weeklyHours;
    
    if (shiftEnd && now < shiftEnd && !timeEntry.clock_out_at) {
      const remainingMs = shiftEnd.getTime() - now.getTime();
      const remainingHours = remainingMs / (1000 * 60 * 60);
      projectedDaily = currentHours + remainingHours;
      projectedWeekly = weeklyHours + remainingHours;
    }

    // Determine status and alerts
    const alerts = [];
    let status = "safe";
    let requiresApproval = false;

    // Check daily OT
    const minutesUntilDailyOT = (dailyOT - currentHours) * 60;
    if (currentHours >= dailyOT) {
      status = "overtime";
      alerts.push({
        type: "critical",
        message: `You're in daily overtime (${currentHours.toFixed(1)}h / ${dailyOT}h)`,
      });
      requiresApproval = true;
    } else if (minutesUntilDailyOT <= 30 && minutesUntilDailyOT > 0) {
      status = "warning";
      alerts.push({
        type: "warning",
        message: `${Math.round(minutesUntilDailyOT)} minutes until daily overtime`,
      });
    } else if (minutesUntilDailyOT <= 60 && minutesUntilDailyOT > 30) {
      status = "approaching";
      alerts.push({
        type: "info",
        message: `${Math.round(minutesUntilDailyOT)} minutes until daily overtime`,
      });
    }

    // Check weekly OT
    const hoursUntilWeeklyOT = weeklyOT - weeklyHours;
    if (weeklyHours >= weeklyOT) {
      status = "overtime";
      alerts.push({
        type: "critical",
        message: `You're in weekly overtime (${weeklyHours.toFixed(1)}h / ${weeklyOT}h)`,
      });
      requiresApproval = true;
    } else if (hoursUntilWeeklyOT <= 1 && hoursUntilWeeklyOT > 0) {
      if (status !== "overtime") {
        status = "warning";
      }
      alerts.push({
        type: "warning",
        message: `${Math.round(hoursUntilWeeklyOT * 60)} minutes until weekly overtime`,
      });
    }

    // Check double-time threshold
    if (currentHours >= doubleTimeThreshold) {
      alerts.push({
        type: "critical",
        message: `You're in double-time (${currentHours.toFixed(1)}h / ${doubleTimeThreshold}h)`,
      });
    } else if (currentHours >= doubleTimeThreshold - 0.25) {
      alerts.push({
        type: "critical",
        message: `15 minutes until double-time threshold`,
      });
    }

    return {
      currentHours: Math.round(currentHours * 10) / 10,
      weeklyHours: Math.round(weeklyHours * 10) / 10,
      projectedDaily: Math.round(projectedDaily * 10) / 10,
      projectedWeekly: Math.round(projectedWeekly * 10) / 10,
      dailyOTThreshold: dailyOT,
      weeklyOTThreshold: weeklyOT,
      doubleTimeThreshold,
      status,
      alerts,
      requiresApproval,
      clockInAt: timeEntry.clock_in_at,
      clockOutAt: timeEntry.clock_out_at,
    };
  } catch (error) {
    console.error("Error calculating overtime status:", error);
    throw error;
  }
}

module.exports = {
  getOvertimeStatus,
};
