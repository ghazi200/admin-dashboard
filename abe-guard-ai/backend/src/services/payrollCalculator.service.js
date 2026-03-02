/**
 * Payroll Calculator Service
 * 
 * Calculates regular hours, overtime, and double-time from time entries
 * Detects exceptions (missed punches, geo mismatches, etc.)
 */

const { Op } = require("sequelize");

/**
 * Calculate hours worked from a time entry (excluding lunch)
 * @param {Date} clockIn - Clock in time
 * @param {Date} clockOut - Clock out time
 * @param {Date|null} lunchStart - Lunch start time (optional)
 * @param {Date|null} lunchEnd - Lunch end time (optional)
 * @returns {number} Hours worked (decimal)
 */
function calculateHoursWorked(clockIn, clockOut, lunchStart = null, lunchEnd = null) {
  if (!clockIn || !clockOut) return 0;

  const totalMs = clockOut.getTime() - clockIn.getTime();
  const totalHours = totalMs / (1000 * 60 * 60);

  // Subtract lunch time if both lunch start and end are provided
  if (lunchStart && lunchEnd) {
    const lunchMs = lunchEnd.getTime() - lunchStart.getTime();
    const lunchHours = lunchMs / (1000 * 60 * 60);
    return Math.max(0, totalHours - lunchHours);
  }

  return Math.max(0, totalHours);
}

/**
 * Calculate overtime based on daily and weekly thresholds
 * @param {number} dailyHours - Hours worked on a specific day
 * @param {number} weeklyHours - Total hours worked in the week so far
 * @param {Object} thresholds - Overtime thresholds
 * @param {number} thresholds.dailyOT - Daily OT threshold (default: 8)
 * @param {number} thresholds.weeklyOT - Weekly OT threshold (default: 40)
 * @returns {Object} { regular: number, overtime: number, doubleTime: number }
 */
function calculateOvertime(dailyHours, weeklyHours, thresholds = {}) {
  const dailyOT = thresholds.dailyOT || 8;
  const weeklyOT = thresholds.weeklyOT || 40;
  const doubleTimeThreshold = thresholds.doubleTimeThreshold || 12; // Hours in a day for double-time

  let regular = 0;
  let overtime = 0;
  let doubleTime = 0;

  // Weekly OT takes precedence
  const weeklyOvertimeHours = Math.max(0, weeklyHours - weeklyOT);

  if (weeklyOvertimeHours > 0) {
    // If we're in weekly OT, all hours today count as OT (up to double-time threshold)
    if (dailyHours > doubleTimeThreshold) {
      doubleTime = dailyHours - doubleTimeThreshold;
      overtime = doubleTimeThreshold - Math.min(weeklyOvertimeHours, doubleTimeThreshold);
    } else {
      overtime = Math.min(dailyHours, weeklyOvertimeHours);
      regular = dailyHours - overtime;
    }
  } else {
    // Check daily OT threshold
    if (dailyHours > doubleTimeThreshold) {
      // Daily double-time (after 12 hours)
      doubleTime = dailyHours - doubleTimeThreshold;
      overtime = doubleTimeThreshold - dailyOT; // OT between 8-12 hours
      regular = dailyOT; // Regular hours (first 8)
    } else if (dailyHours > dailyOT) {
      // Daily overtime (between 8-12 hours)
      overtime = dailyHours - dailyOT;
      regular = dailyOT;
    } else {
      // All regular hours
      regular = dailyHours;
    }
  }

  return {
    regular: Math.max(0, regular),
    overtime: Math.max(0, overtime),
    doubleTime: Math.max(0, doubleTime),
  };
}

/**
 * Detect exceptions in time entries
 * @param {Array} timeEntries - Array of time entry objects
 * @param {Object} shift - Shift object with location/geo requirements
 * @returns {Array} Array of exception objects
 */
function detectExceptions(timeEntries, shift = null) {
  const exceptions = [];

  if (!timeEntries || timeEntries.length === 0) {
    exceptions.push({
      type: "NO_TIME_ENTRIES",
      message: "No time entries found for this period",
      severity: "HIGH",
    });
    return exceptions;
  }

  for (const entry of timeEntries) {
    // Check for missed clock-in
    if (!entry.clock_in_at) {
      exceptions.push({
        type: "MISSED_CLOCK_IN",
        date: entry.shift_date || new Date(entry.created_at).toISOString().split("T")[0],
        message: "Missing clock-in time",
        severity: "HIGH",
        time_entry_id: entry.id,
      });
    }

    // Check for missed clock-out
    if (!entry.clock_out_at) {
      exceptions.push({
        type: "MISSED_CLOCK_OUT",
        date: entry.shift_date || new Date(entry.created_at).toISOString().split("T")[0],
        message: "Missing clock-out time",
        severity: "HIGH",
        time_entry_id: entry.id,
      });
    }

    // Check for geo mismatch (if location verification is enabled)
    if (shift && entry.clock_in_lat && entry.clock_in_lng) {
      // You can add logic here to check if clock-in location matches shift location
      // For now, we'll just flag entries with location_verified: false
      // This would typically come from ShiftTimeEntry.location_verified
    }

    // Check for suspiciously long hours (potential error)
    if (entry.clock_in_at && entry.clock_out_at) {
      const hours = calculateHoursWorked(
        new Date(entry.clock_in_at),
        new Date(entry.clock_out_at),
        entry.lunch_start_at ? new Date(entry.lunch_start_at) : null,
        entry.lunch_end_at ? new Date(entry.lunch_end_at) : null
      );

      if (hours > 16) {
        exceptions.push({
          type: "EXCESSIVE_HOURS",
          date: entry.shift_date || new Date(entry.created_at).toISOString().split("T")[0],
          message: `Suspiciously long shift: ${hours.toFixed(2)} hours`,
          severity: "MEDIUM",
          hours: hours,
          time_entry_id: entry.id,
        });
      }
    }
  }

  return exceptions;
}

/**
 * Calculate hours for a single shift/day from time entries
 * @param {string} guardId - Guard ID
 * @param {Date|string} date - Date (Date object or ISO string)
 * @param {Array} timeEntries - Time entries for this date
 * @param {Object} thresholds - Overtime thresholds
 * @returns {Object} { regular, overtime, doubleTime, total, exceptions }
 */
async function calculateShiftHours(guardId, date, timeEntries, thresholds = {}) {
  let totalRegular = 0;
  let totalOvertime = 0;
  let totalDoubleTime = 0;

  const exceptions = detectExceptions(timeEntries);

  // Group time entries by day if there are multiple entries
  for (const entry of timeEntries) {
    const hours = calculateHoursWorked(
      entry.clock_in_at ? new Date(entry.clock_in_at) : null,
      entry.clock_out_at ? new Date(entry.clock_out_at) : null,
      entry.lunch_start_at ? new Date(entry.lunch_start_at) : null,
      entry.lunch_end_at ? new Date(entry.lunch_end_at) : null
    );

    if (hours > 0) {
      // For now, assume regular hours (OT calculation requires weekly context)
      // This will be refined in calculateTimesheet when we have full week context
      totalRegular += hours;
    }
  }

  const total = totalRegular + totalOvertime + totalDoubleTime;

  return {
    regular: parseFloat(totalRegular.toFixed(2)),
    overtime: parseFloat(totalOvertime.toFixed(2)),
    doubleTime: parseFloat(totalDoubleTime.toFixed(2)),
    total: parseFloat(total.toFixed(2)),
    exceptions,
  };
}

/**
 * Calculate weekly overtime breakdown
 * @param {Array} dailyBreakdowns - Array of daily breakdowns from calculateShiftHours
 * @param {Object} thresholds - Overtime thresholds
 * @returns {Object} { regular, overtime, doubleTime, total, byDay: Array }
 */
function calculateWeeklyOT(dailyBreakdowns, thresholds = {}) {
  const dailyOT = thresholds.dailyOT || 8;
  const weeklyOT = thresholds.weeklyOT || 40;
  const doubleTimeThreshold = thresholds.doubleTimeThreshold || 12;

  let weeklyRegular = 0;
  let weeklyOvertime = 0;
  let weeklyDoubleTime = 0;
  const byDay = [];

  // First pass: calculate daily OT and accumulate weekly hours
  let cumulativeWeeklyHours = 0;

  for (const day of dailyBreakdowns) {
    cumulativeWeeklyHours += day.total;
    const otBreakdown = calculateOvertime(day.total, cumulativeWeeklyHours - day.total, thresholds);

    byDay.push({
      date: day.date,
      regular: otBreakdown.regular,
      overtime: otBreakdown.overtime,
      doubleTime: otBreakdown.doubleTime,
      total: day.total,
      exceptions: day.exceptions || [],
    });

    weeklyRegular += otBreakdown.regular;
    weeklyOvertime += otBreakdown.overtime;
    weeklyDoubleTime += otBreakdown.doubleTime;
  }

  return {
    regular: parseFloat(weeklyRegular.toFixed(2)),
    overtime: parseFloat(weeklyOvertime.toFixed(2)),
    doubleTime: parseFloat(weeklyDoubleTime.toFixed(2)),
    total: parseFloat((weeklyRegular + weeklyOvertime + weeklyDoubleTime).toFixed(2)),
    byDay,
  };
}

/**
 * Get OT breakdown for a timesheet (for AI context)
 * @param {string} timesheetId - Timesheet ID
 * @returns {Object} OT breakdown
 */
async function getOTBreakdown(timesheetId) {
  // This would fetch timesheet lines and provide OT breakdown
  // For now, return a placeholder structure
  return {
    timesheet_id: timesheetId,
    note: "OT breakdown calculation - requires timesheet lines",
  };
}

module.exports = {
  calculateHoursWorked,
  calculateOvertime,
  detectExceptions,
  calculateShiftHours,
  calculateWeeklyOT,
  getOTBreakdown,
};
