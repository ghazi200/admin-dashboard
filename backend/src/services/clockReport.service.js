/**
 * Clock Report Service
 *
 * Builds the weekly clock-in/out report per location:
 * - Narratives: "Bob clocked in at 7am, took break 12pm–12:30pm, clocked out at 3pm"
 * - Flags: missed clock-in, missed clock-out, wrong person clocked in
 * - OT notes: guard accepted overtime (don't flag missing clock-out)
 *
 * Week = Monday–Sunday. Uses shifts (schedule) + time_entries + overtime_offers.
 */

const { Op } = require("sequelize");

/**
 * Get Monday and Sunday of the week that contains date, or last week if date is null
 */
function getWeekBounds(dateOrNull) {
  const d = dateOrNull ? new Date(dateOrNull) : new Date();
  const day = d.getDay(); // 0 = Sun, 1 = Mon, ...
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(d);
  monday.setDate(d.getDate() + diffToMonday);
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  return {
    weekStart: monday.toISOString().split("T")[0],
    weekEnd: sunday.toISOString().split("T")[0],
  };
}

/**
 * Format time for report (e.g. "7:00" -> "7am", "15:00" -> "3pm")
 */
function formatTimeForReport(timeStr) {
  if (!timeStr) return "—";
  const parts = String(timeStr).trim().split(":");
  const h = parseInt(parts[0], 10);
  const m = parts[1] ? parseInt(parts[1], 10) : 0;
  if (isNaN(h)) return timeStr;
  if (h === 0 && m === 0) return "12am";
  if (h === 12 && m === 0) return "12pm";
  if (h < 12) return m > 0 ? `${h}:${String(m).padStart(2, "0")}am` : `${h}am`;
  return m > 0 ? `${h - 12}:${String(m).padStart(2, "0")}pm` : `${h - 12}pm`;
}

/**
 * Format a timestamp to report time (e.g. "7am")
 */
function formatTimestampToReportTime(ts) {
  if (!ts) return "—";
  const d = new Date(ts);
  const h = d.getHours();
  const m = d.getMinutes();
  if (h === 0 && m === 0) return "12am";
  if (h === 12 && m === 0) return "12pm";
  if (h < 12) return m > 0 ? `${h}:${String(m).padStart(2, "0")}am` : `${h}am`;
  return m > 0 ? `${h - 12}:${String(m).padStart(2, "0")}pm` : `${h - 12}pm`;
}

/**
 * Derive shift band label from shift_start/shift_end (e.g. "7am–3pm")
 */
function shiftBandLabel(shiftStart, shiftEnd) {
  return `${formatTimeForReport(shiftStart)}–${formatTimeForReport(shiftEnd)}`;
}

/**
 * Build clock report for a tenant (optional: single location, optional: week)
 * @param {Object} options - { tenantId, location (optional), weekStart (optional), weekEnd (optional) }
 * @param {Object} models - Sequelize models
 * @returns {Promise<Object>} { weekStart, weekEnd, locations: [ { location, narratives, flags, otNotes, summary } ], summary, suggestions }
 */
async function buildClockReport(options, models) {
  const { tenantId, location = null, weekStart: inputWeekStart, weekEnd: inputWeekEnd } = options;
  const { sequelize } = models;

  if (!tenantId) {
    return { error: "tenantId is required", weekStart: null, weekEnd: null, locations: [] };
  }

  const { weekStart, weekEnd } = inputWeekStart && inputWeekEnd
    ? { weekStart: inputWeekStart, weekEnd: inputWeekEnd }
    : getWeekBounds(null);

  const params = [tenantId, weekStart, weekEnd];
  let locationFilter = "";
  if (location && location.trim()) {
    params.push(String(location).trim());
    locationFilter = `AND s.location = $${params.length}`;
  }

  // All shifts in the week (and location) for this tenant
  const [shifts] = await sequelize.query(
    `SELECT s.id, s.shift_date, s.shift_start, s.shift_end, s.location, s.guard_id AS scheduled_guard_id,
            gs.name AS scheduled_guard_name
     FROM shifts s
     LEFT JOIN guards gs ON s.guard_id = gs.id
     WHERE s.tenant_id = $1
       AND s.shift_date >= $2 AND s.shift_date <= $3
       ${locationFilter}
     ORDER BY s.location, s.shift_date, s.shift_start`,
    { bind: params }
  );

  // Accepted overtime for these shifts (guard accepted OT => don't flag missing clock-out for that shift)
  const shiftIds = [...new Set(shifts.map((s) => s.id))];
  let acceptedOtShiftGuardSet = new Set(); // "shiftId:guardId"
  if (shiftIds.length > 0) {
    const [otRows] = await sequelize.query(
      `SELECT shift_id, guard_id FROM overtime_offers
       WHERE shift_id = ANY($1::uuid[]) AND status = 'accepted'`,
      { bind: [shiftIds] }
    );
    otRows.forEach((r) => acceptedOtShiftGuardSet.add(`${r.shift_id}:${r.guard_id}`));
  }

  // Time entries for these shifts
  let timeEntries = [];
  if (shiftIds.length > 0) {
    const [teRows] = await sequelize.query(
      `SELECT te.id, te.shift_id, te.guard_id AS actual_guard_id, te.clock_in_at, te.clock_out_at,
              te.lunch_start_at, te.lunch_end_at,
              ga.name AS actual_guard_name
       FROM time_entries te
       LEFT JOIN guards ga ON te.guard_id = ga.id
       WHERE te.shift_id = ANY($1::uuid[])`,
      { bind: [shiftIds] }
    );
    timeEntries = teRows || [];
  }

  const teByShift = new Map();
  timeEntries.forEach((te) => {
    if (!teByShift.has(te.shift_id)) teByShift.set(te.shift_id, []);
    teByShift.get(te.shift_id).push(te);
  });

  const locationsMap = new Map(); // location -> { narratives, flags, otNotes }

  for (const shift of shifts) {
    const loc = shift.location || "Unspecified";
    if (!locationsMap.has(loc)) {
      locationsMap.set(loc, { narratives: [], flags: [], otNotes: [] });
    }
    const locData = locationsMap.get(loc);
    const dayName = formatDayName(shift.shift_date);
    const band = shiftBandLabel(shift.shift_start, shift.shift_end);
    const rawEntries = teByShift.get(shift.id) || [];
    const entries = rawEntries.filter((e) => e != null && typeof e === "object");
    const acceptedOt = acceptedOtShiftGuardSet.has(`${shift.id}:${shift.scheduled_guard_id}`);

    // Wrong person: time_entry.guard_id !== shift.guard_id
    for (const te of entries) {
      if (shift.scheduled_guard_id && te.actual_guard_id && shift.scheduled_guard_id !== te.actual_guard_id) {
        locData.flags.push({
          type: "wrong_person_clock_in",
          shiftId: shift.id,
          shiftDate: shift.shift_date,
          shiftBand: band,
          dayName,
          location: loc,
          scheduledGuardId: shift.scheduled_guard_id,
          scheduledGuardName: shift.scheduled_guard_name || "—",
          actualGuardId: te.actual_guard_id,
          actualGuardName: te.actual_guard_name || "—",
          message: `${te.actual_guard_name || "Someone"} clocked in but ${shift.scheduled_guard_name || "scheduled guard"} was scheduled for ${dayName} ${band} at ${loc}.`,
        });
      }
    }

    // No time entry at all => missed clock-in (and missed clock-out) for scheduled guard
    if (entries.length === 0 && shift.scheduled_guard_id) {
      locData.flags.push({
        type: "missed_clock_in",
        shiftId: shift.id,
        shiftDate: shift.shift_date,
        shiftBand: band,
        dayName,
        location: loc,
        guardId: shift.scheduled_guard_id,
        guardName: shift.scheduled_guard_name || "—",
        message: `${shift.scheduled_guard_name || "Guard"} did not clock in for ${dayName} ${band} at ${loc}.`,
      });
      continue;
    }

    // Has time entry/entries: check missed clock-out and build narrative for the one we treat as "primary" (scheduled guard's or first)
    const primaryEntry = entries.find((e) => (e && (e.actual_guard_id === shift.scheduled_guard_id))) || entries[0];
    if (!primaryEntry || typeof primaryEntry !== "object") continue;

    const clockInAt = primaryEntry.clock_in_at ?? primaryEntry.clockInAt;
    const clockOutAt = primaryEntry.clock_out_at ?? primaryEntry.clockOutAt;
    const hasClockOut = clockOutAt && clockInAt && new Date(clockOutAt) >= new Date(clockInAt);

    if (!hasClockOut && shift.scheduled_guard_id) {
      if (acceptedOt) {
        locData.otNotes.push({
          shiftId: shift.id,
          shiftDate: shift.shift_date,
          shiftBand: band,
          dayName,
          location: loc,
          guardId: shift.scheduled_guard_id,
          guardName: shift.scheduled_guard_name || "—",
          message: `${shift.scheduled_guard_name || "Guard"} accepted overtime for ${dayName} ${band} at ${loc}; no clock-out yet (expected).`,
        });
      } else {
        locData.flags.push({
          type: "missed_clock_out",
          shiftId: shift.id,
          shiftDate: shift.shift_date,
          shiftBand: band,
          dayName,
          location: loc,
          guardId: primaryEntry.actual_guard_id,
          guardName: primaryEntry.actual_guard_name || "—",
          message: `${primaryEntry.actual_guard_name || "Guard"} did not clock out for ${dayName} ${band} at ${loc}.`,
        });
      }
    }

    // Narrative for primary entry (complete punch set)
    if (clockInAt && hasClockOut) {
      const narrative = buildNarrative({ ...primaryEntry, clock_in_at: clockInAt, clock_out_at: clockOutAt }, shift, dayName, band, loc);
      if (narrative) locData.narratives.push(narrative);
    }
  }

  const locations = [];
  for (const [loc, data] of locationsMap.entries()) {
    locations.push({
      location: loc,
      narratives: data.narratives,
      flags: data.flags,
      otNotes: data.otNotes,
      summary: buildLocationSummary(data),
    });
  }

  const summary = buildOverallSummary(locations);
  const suggestions = buildSuggestions(locations);

  return {
    weekStart,
    weekEnd,
    locations,
    summary,
    suggestions,
  };
}

function formatDayName(dateStr) {
  if (!dateStr) return "—";
  const d = new Date(dateStr + "T12:00:00");
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  return days[d.getDay()];
}

function buildNarrative(te, shift, dayName, band, loc) {
  if (!te || typeof te !== "object") return null;
  const clockIn = te.clock_in_at ?? te.clockInAt;
  const clockOut = te.clock_out_at ?? te.clockOutAt;
  const breakStart = te.lunch_start_at ?? te.lunchStartAt;
  const breakEnd = te.lunch_end_at ?? te.lunchEndAt;
  const breakText =
    breakStart && breakEnd
      ? ` took break at ${formatTimestampToReportTime(breakStart)}–${formatTimestampToReportTime(breakEnd)}`
      : " no break";
  const name = te.actual_guard_name ?? te.actualGuardName ?? "Guard";
  return {
    guardId: te.actual_guard_id ?? te.actualGuardId,
    guardName: name,
    shiftId: shift.id,
    shiftDate: shift.shift_date,
    dayName,
    shiftBand: band,
    location: loc,
    clockIn: formatTimestampToReportTime(clockIn),
    breakStart: breakStart ? formatTimestampToReportTime(breakStart) : null,
    breakEnd: breakEnd ? formatTimestampToReportTime(breakEnd) : null,
    clockOut: formatTimestampToReportTime(clockOut),
    text: `${name} clocked in at ${formatTimestampToReportTime(clockIn)}${breakText}, clocked out at ${formatTimestampToReportTime(clockOut)} (${dayName} ${band}, ${loc}).`,
  };
}

function buildLocationSummary(data) {
  const n = data.narratives.length;
  const f = data.flags.length;
  const ot = data.otNotes.length;
  const parts = [];
  if (n > 0) parts.push(`${n} guard(s) with complete punches`);
  if (f > 0) parts.push(`${f} flag(s)`);
  if (ot > 0) parts.push(`${ot} OT note(s)`);
  return parts.length ? parts.join("; ") : "No activity";
}

function buildOverallSummary(locations) {
  let totalN = 0;
  let totalFlags = 0;
  let totalOt = 0;
  const flagBreakdown = { missed_clock_in: 0, missed_clock_out: 0, wrong_person_clock_in: 0 };
  locations.forEach((loc) => {
    totalN += loc.narratives.length;
    totalFlags += loc.flags.length;
    totalOt += loc.otNotes.length;
    loc.flags.forEach((f) => {
      if (flagBreakdown[f.type] != null) flagBreakdown[f.type]++;
    });
  });
  const parts = [];
  if (totalN > 0) parts.push(`${totalN} complete punch set(s)`);
  if (totalFlags > 0) {
    parts.push(`${totalFlags} flag(s)`);
    if (flagBreakdown.missed_clock_in) parts.push(`${flagBreakdown.missed_clock_in} missed clock-in`);
    if (flagBreakdown.missed_clock_out) parts.push(`${flagBreakdown.missed_clock_out} missed clock-out`);
    if (flagBreakdown.wrong_person_clock_in) parts.push(`${flagBreakdown.wrong_person_clock_in} wrong person clock-in`);
  }
  if (totalOt > 0) parts.push(`${totalOt} OT note(s)`);
  return parts.length ? parts.join("; ") : "No activity for this week.";
}

function buildSuggestions(locations) {
  const list = [];
  locations.forEach((loc) => {
    loc.flags.forEach((f) => {
      if (f.type === "missed_clock_out") {
        list.push(`Use scheduled end time for ${f.dayName} ${f.shiftBand} (${f.guardName}) at ${loc.location}, or request correction.`);
      } else if (f.type === "missed_clock_in") {
        list.push(`Request ${f.guardName} to confirm clock-in for ${f.dayName} ${f.shiftBand} at ${loc.location}.`);
      } else if (f.type === "wrong_person_clock_in") {
        list.push(`Confirm with ${f.actualGuardName} and ${f.scheduledGuardName} for ${f.dayName} ${f.shiftBand} at ${loc.location}; correct assignment or record swap if intended.`);
      }
    });
  });
  return list;
}

module.exports = {
  buildClockReport,
  getWeekBounds,
  formatTimeForReport,
  formatTimestampToReportTime,
  shiftBandLabel,
};
