/**
 * Real-time overtime status for guards (raw SQL via Sequelize — same DB as clock-in).
 */
const { calculateHoursWorked } = require("./payrollCalculator.service");

async function getOvertimeStatus(sequelize, guardId, shiftId, thresholds = {}) {
  const dailyOT = thresholds.dailyOT || 8;
  const weeklyOT = thresholds.weeklyOT || 40;
  const doubleTimeThreshold = thresholds.doubleTimeThreshold || 12;

  const [shiftRows] = await sequelize.query(
    `SELECT id, shift_date, shift_start, shift_end
     FROM public.shifts WHERE id = $1::uuid LIMIT 1`,
    { bind: [shiftId] }
  );
  const shift = shiftRows?.[0];
  if (!shift) {
    throw new Error("Shift not found");
  }

  const [teRows] = await sequelize.query(
    `SELECT id, clock_in_at, clock_out_at, lunch_start_at, lunch_end_at
     FROM public.time_entries
     WHERE shift_id = $1::uuid AND guard_id = $2::uuid
     ORDER BY created_at DESC NULLS LAST
     LIMIT 1`,
    { bind: [shiftId, guardId] }
  );
  const timeEntry = teRows?.[0];

  if (!timeEntry?.clock_in_at) {
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
  const lunchStart = timeEntry.lunch_start_at ? new Date(timeEntry.lunch_start_at) : null;
  const lunchEnd = timeEntry.lunch_end_at ? new Date(timeEntry.lunch_end_at) : null;

  let currentHours = 0;
  if (timeEntry.clock_out_at) {
    currentHours = calculateHoursWorked(clockIn, new Date(timeEntry.clock_out_at), lunchStart, lunchEnd);
  } else {
    currentHours = calculateHoursWorked(clockIn, now, lunchStart, lunchEnd);
  }

  const weekStart = new Date(now);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  weekStart.setHours(0, 0, 0, 0);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);

  const [weeklyRows] = await sequelize.query(
    `SELECT clock_in_at, clock_out_at, lunch_start_at, lunch_end_at
     FROM public.time_entries
     WHERE guard_id = $1::uuid
       AND clock_in_at >= $2
       AND clock_in_at < $3`,
    { bind: [guardId, weekStart, weekEnd] }
  );

  let weeklyHours = 0;
  for (const entry of weeklyRows || []) {
    if (!entry.clock_in_at) continue;
    const end = entry.clock_out_at ? new Date(entry.clock_out_at) : now;
    weeklyHours += calculateHoursWorked(
      new Date(entry.clock_in_at),
      end,
      entry.lunch_start_at ? new Date(entry.lunch_start_at) : null,
      entry.lunch_end_at ? new Date(entry.lunch_end_at) : null
    );
  }

  let projectedDaily = currentHours;
  let projectedWeekly = weeklyHours;
  const shiftEndStr = shift.shift_end;
  if (shiftEndStr && shift.shift_date && !timeEntry.clock_out_at) {
    const datePart =
      shift.shift_date instanceof Date
        ? shift.shift_date.toISOString().split("T")[0]
        : String(shift.shift_date).split("T")[0];
    const shiftEnd = new Date(`${datePart}T${shiftEndStr}`);
    if (!Number.isNaN(shiftEnd.getTime()) && now < shiftEnd) {
      const remainingHours = (shiftEnd.getTime() - now.getTime()) / (1000 * 60 * 60);
      projectedDaily = currentHours + remainingHours;
      projectedWeekly = weeklyHours + remainingHours;
    }
  }

  const alerts = [];
  let status = "safe";
  let requiresApproval = false;

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

  const hoursUntilWeeklyOT = weeklyOT - weeklyHours;
  if (weeklyHours >= weeklyOT) {
    status = "overtime";
    alerts.push({
      type: "critical",
      message: `You're in weekly overtime (${weeklyHours.toFixed(1)}h / ${weeklyOT}h)`,
    });
    requiresApproval = true;
  } else if (hoursUntilWeeklyOT <= 1 && hoursUntilWeeklyOT > 0) {
    if (status !== "overtime") status = "warning";
    alerts.push({
      type: "warning",
      message: `${Math.round(hoursUntilWeeklyOT * 60)} minutes until weekly overtime`,
    });
  }

  if (currentHours >= doubleTimeThreshold) {
    alerts.push({
      type: "critical",
      message: `You're in double-time (${currentHours.toFixed(1)}h / ${doubleTimeThreshold}h)`,
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
}

module.exports = { getOvertimeStatus };
