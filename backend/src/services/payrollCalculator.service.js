/**
 * Hours worked helper for overtime status (guard-ui on unified admin backend).
 */
function calculateHoursWorked(clockIn, clockOut, lunchStart = null, lunchEnd = null) {
  if (!clockIn || !clockOut) return 0;
  const totalMs = new Date(clockOut).getTime() - new Date(clockIn).getTime();
  let totalHours = totalMs / (1000 * 60 * 60);
  if (lunchStart && lunchEnd) {
    const lunchMs = new Date(lunchEnd).getTime() - new Date(lunchStart).getTime();
    totalHours -= lunchMs / (1000 * 60 * 60);
  }
  return Math.max(0, totalHours);
}

module.exports = { calculateHoursWorked };
