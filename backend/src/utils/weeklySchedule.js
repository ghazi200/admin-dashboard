/**
 * Weekly schedule template used by Schedule page when schedule_config is empty.
 * Late clock-in must use the same slots or the dashboard will never see today's posts.
 */

function getDefaultWeeklyTemplate() {
  const weekday = [
    { id: "SHIFT-MF-1", time: "7:00 AM - 3:00 PM", start: "07:00", end: "15:00", scheduledGuard: "Bob Smith", hours: 8 },
    { id: "SHIFT-MF-2", time: "3:00 PM - 11:00 PM", start: "15:00", end: "23:00", scheduledGuard: "Ghazi Abdullah", hours: 8 },
    { id: "SHIFT-MF-3", time: "11:00 PM - 7:00 AM", start: "23:00", end: "07:00", scheduledGuard: "Mark Smith", hours: 8 },
  ];
  const weekend = [
    { id: "SHIFT-WE-1", time: "7:00 AM - 3:00 PM", start: "07:00", end: "15:00", scheduledGuard: "Kenny Smith", hours: 8 },
    { id: "SHIFT-WE-2", time: "3:00 PM - 11:00 PM", start: "15:00", end: "23:00", scheduledGuard: "Keisha Wright", hours: 8 },
    { id: "SHIFT-WE-3", time: "11:00 PM - 7:00 AM", start: "23:00", end: "07:00", scheduledGuard: "Ralph", hours: 8 },
  ];
  return [
    { day: "Monday", shifts: weekday },
    { day: "Tuesday", shifts: weekday },
    { day: "Wednesday", shifts: weekday },
    { day: "Thursday", shifts: weekday },
    { day: "Friday", shifts: weekday },
    { day: "Saturday", shifts: weekend },
    { day: "Sunday", shifts: weekend },
  ];
}

function dateInTimeZone(timeZone = "America/New_York", date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function weekdayInTimeZone(timeZone = "America/New_York", date = new Date()) {
  return new Intl.DateTimeFormat("en-US", { timeZone, weekday: "long" }).format(date);
}

function normalizeName(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function findGuardByName(guards, scheduledName) {
  const want = normalizeName(scheduledName);
  if (!want || want === "unassigned") return null;
  const exact = guards.find((g) => normalizeName(g.name) === want);
  if (exact) return exact;
  return (
    guards.find((g) => {
      const n = normalizeName(g.name);
      return n && (n.includes(want) || want.includes(n));
    }) || null
  );
}

module.exports = {
  getDefaultWeeklyTemplate,
  dateInTimeZone,
  weekdayInTimeZone,
  findGuardByName,
  normalizeName,
};
