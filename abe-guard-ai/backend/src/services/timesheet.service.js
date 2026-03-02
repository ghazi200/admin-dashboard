/**
 * Timesheet Service
 * 
 * CRUD operations for timesheets and timesheet lines
 * Generates timesheets from time entries
 */

const { Op } = require("sequelize");
const payrollCalculator = require("./payrollCalculator.service");

/**
 * Get current pay period for a tenant
 * @param {string} tenantId - Tenant ID
 * @param {Date} referenceDate - Reference date (defaults to today)
 * @returns {Promise<Object|null>} Pay period object or null
 */
async function getCurrentPayPeriod(tenantId, referenceDate = new Date()) {
  const { PayPeriod } = require("../models");

  // Find open or locked pay period that contains the reference date
  const dateStr = referenceDate.toISOString().split("T")[0];

  const payPeriod = await PayPeriod.findOne({
    where: {
      tenant_id: tenantId,
      period_start: { [Op.lte]: dateStr },
      period_end: { [Op.gte]: dateStr },
      status: { [Op.in]: ["OPEN", "LOCKED"] },
    },
    order: [["period_start", "DESC"]],
  });

  return payPeriod;
}

/**
 * Get current timesheet for a guard
 * @param {string} guardId - Guard ID
 * @param {string} tenantId - Tenant ID
 * @param {Date} referenceDate - Reference date (defaults to today)
 * @returns {Promise<Object|null>} Timesheet object or null
 */
async function getCurrentTimesheet(guardId, tenantId, referenceDate = new Date()) {
  const { Timesheet, PayPeriod } = require("../models");

  // Get current pay period
  const payPeriod = await getCurrentPayPeriod(tenantId, referenceDate);
  if (!payPeriod) return null;

  // Find timesheet for this guard and pay period
  const timesheet = await Timesheet.findOne({
    where: {
      tenant_id: tenantId,
      guard_id: guardId,
      pay_period_id: payPeriod.id,
    },
  });

  return timesheet;
}

/**
 * Generate or update timesheet from time entries
 * @param {string} guardId - Guard ID
 * @param {string} payPeriodId - Pay period ID
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<Object>} Timesheet object
 */
async function generateTimesheet(guardId, payPeriodId, tenantId) {
  const { Timesheet, TimesheetLine, PayPeriod, TimeEntry } = require("../models");
  const { Op } = require("sequelize");

  // Get pay period to get date range
  const payPeriod = await PayPeriod.findByPk(payPeriodId);
  if (!payPeriod) {
    throw new Error("Pay period not found");
  }

  // Find or create timesheet
  let timesheet = await Timesheet.findOne({
    where: {
      tenant_id: tenantId,
      guard_id: guardId,
      pay_period_id: payPeriodId,
    },
  });

  if (!timesheet) {
    timesheet = await Timesheet.create({
      tenant_id: tenantId,
      guard_id: guardId,
      pay_period_id: payPeriodId,
      status: "DRAFT",
      regular_hours: 0,
      overtime_hours: 0,
      double_time_hours: 0,
      total_hours: 0,
    });
  }

  // Fetch time entries for this pay period
  // Note: TimeEntry doesn't have a direct Shift association in models/index.js,
  // but we can get shift_id from the entry itself
  const timeEntries = await TimeEntry.findAll({
    where: {
      guard_id: guardId,
      clock_in_at: {
        [Op.gte]: new Date(payPeriod.period_start + "T00:00:00Z"),
        [Op.lte]: new Date(payPeriod.period_end + "T23:59:59Z"),
      },
    },
    order: [["clock_in_at", "ASC"]],
  });

  // Group time entries by date
  const entriesByDate = {};
  for (const entry of timeEntries) {
    const date = entry.clock_in_at
      ? new Date(entry.clock_in_at).toISOString().split("T")[0]
      : new Date(entry.created_at).toISOString().split("T")[0];

    if (!entriesByDate[date]) {
      entriesByDate[date] = [];
    }
    entriesByDate[date].push(entry);
  }

  // Delete existing timesheet lines
  await TimesheetLine.destroy({
    where: { timesheet_id: timesheet.id },
  });

  // Calculate hours for each day
  const dailyBreakdowns = [];
  const allExceptions = [];

  for (const [date, entries] of Object.entries(entriesByDate)) {
    const breakdown = await payrollCalculator.calculateShiftHours(guardId, date, entries);

    // Create timesheet line
    const line = await TimesheetLine.create({
      timesheet_id: timesheet.id,
      shift_id: entries[0]?.shift_id || null,
      date: date,
      clock_in_at: entries[0]?.clock_in_at || null,
      clock_out_at: entries[entries.length - 1]?.clock_out_at || null,
      regular_hours: breakdown.regular,
      overtime_hours: breakdown.overtime,
      double_time_hours: breakdown.doubleTime,
      premium_hours: 0, // TODO: Calculate premiums (night shift, holiday, etc.)
      premium_type: null,
      has_exception: breakdown.exceptions.length > 0,
      exception_type: breakdown.exceptions.length > 0 ? breakdown.exceptions[0].type : null,
    });

    dailyBreakdowns.push({
      date,
      ...breakdown,
    });

    allExceptions.push(...breakdown.exceptions);
  }

  // Calculate weekly OT with proper thresholds
  const weeklyBreakdown = payrollCalculator.calculateWeeklyOT(dailyBreakdowns);

  // Update timesheet totals
  await timesheet.update({
    regular_hours: weeklyBreakdown.regular,
    overtime_hours: weeklyBreakdown.overtime,
    double_time_hours: weeklyBreakdown.doubleTime,
    total_hours: weeklyBreakdown.total,
    exceptions_count: allExceptions.length,
    exceptions_json: allExceptions,
    calculated_at: new Date(),
    status: timesheet.status === "DRAFT" ? "DRAFT" : timesheet.status, // Keep existing status if not draft
  });

  // Reload with associations
  return await Timesheet.findByPk(timesheet.id, {
    include: [
      {
        model: TimesheetLine,
        as: "lines",
      },
    ],
  });
}

/**
 * Get timesheet with exceptions breakdown
 * @param {string} timesheetId - Timesheet ID
 * @returns {Promise<Object>} Timesheet with lines and exceptions
 */
async function getTimesheetWithExceptions(timesheetId) {
  const { Timesheet, TimesheetLine } = require("../models");

  const timesheet = await Timesheet.findByPk(timesheetId, {
    include: [
      {
        model: TimesheetLine,
        as: "lines",
        order: [["date", "ASC"]],
      },
    ],
  });

  if (!timesheet) {
    throw new Error("Timesheet not found");
  }

  return timesheet;
}

/**
 * Get timesheet lines for a timesheet
 * @param {string} timesheetId - Timesheet ID
 * @returns {Promise<Array>} Array of timesheet lines
 */
async function getTimesheetLines(timesheetId) {
  const { TimesheetLine } = require("../models");

  const lines = await TimesheetLine.findAll({
    where: { timesheet_id: timesheetId },
    order: [["date", "ASC"]],
  });

  return lines;
}

module.exports = {
  getCurrentPayPeriod,
  getCurrentTimesheet,
  generateTimesheet,
  getTimesheetWithExceptions,
  getTimesheetLines,
};
