/**
 * Pure helpers for guard personal dashboard (shared with abe-guard-ai logic).
 */

function calculatePerformanceMetrics(shifts, timeEntries, callouts) {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const recentShifts = shifts.filter((s) => {
    const shiftDate = new Date(s.shift_date);
    return shiftDate >= thirtyDaysAgo;
  });

  const assignedShifts = shifts.filter((s) => s.status === "CLOSED" || s.guard_id);
  const completedShifts = shifts.filter((s) => {
    const hasTimeEntry = timeEntries.some((te) => te.shift_id === s.id && te.clock_out_at);
    return s.status === "CLOSED" && hasTimeEntry;
  });

  const reliabilityScore =
    assignedShifts.length > 0 ? (completedShifts.length / assignedShifts.length) * 100 : 100;

  const clockIns = timeEntries.filter((te) => te.clock_in_at);
  let onTimeCount = 0;

  clockIns.forEach((te) => {
    const shift = shifts.find((s) => s.id === te.shift_id);
    if (shift && shift.shift_date && shift.shift_start) {
      const shiftDateTime = new Date(`${shift.shift_date}T${shift.shift_start}`);
      const clockInTime = new Date(te.clock_in_at);
      const bufferMinutes = 15;
      const onTimeThreshold = new Date(shiftDateTime.getTime() + bufferMinutes * 60 * 1000);

      if (clockInTime <= onTimeThreshold) {
        onTimeCount++;
      }
    }
  });

  const onTimePercentage = clockIns.length > 0 ? (onTimeCount / clockIns.length) * 100 : 100;

  const recentCallouts = callouts.filter((c) => {
    const calloutDate = new Date(c.created_at);
    return calloutDate >= thirtyDaysAgo;
  });

  const calloutRate =
    recentShifts.length > 0 ? (recentCallouts.length / recentShifts.length) * 100 : 0;

  const shiftsWithClockIn = timeEntries.filter((te) => te.clock_in_at).map((te) => te.shift_id);
  const shiftsWithClockOut = timeEntries.filter((te) => te.clock_out_at).map((te) => te.shift_id);
  const uniqueShiftsWithClockIn = [...new Set(shiftsWithClockIn)];
  const uniqueShiftsWithClockOut = [...new Set(shiftsWithClockOut)];

  const completionRate =
    uniqueShiftsWithClockIn.length > 0
      ? (uniqueShiftsWithClockOut.length / uniqueShiftsWithClockIn.length) * 100
      : 100;

  const overallScore =
    (reliabilityScore + onTimePercentage + completionRate + (100 - Math.min(calloutRate, 100))) / 4;

  return {
    reliabilityScore: Math.round(reliabilityScore * 10) / 10,
    onTimePercentage: Math.round(onTimePercentage * 10) / 10,
    calloutRate: Math.round(calloutRate * 10) / 10,
    completionRate: Math.round(completionRate * 10) / 10,
    overallScore: Math.round(overallScore * 10) / 10,
  };
}

function calculateEarnings(timeEntries, shifts) {
  const now = new Date();
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay());
  startOfWeek.setHours(0, 0, 0, 0);

  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  function calculateHours(entries) {
    return entries.reduce((total, te) => {
      if (te.clock_in_at && te.clock_out_at) {
        const start = new Date(te.clock_in_at);
        const end = new Date(te.clock_out_at);
        const hours = (end - start) / (1000 * 60 * 60);

        if (te.lunch_start_at && te.lunch_end_at) {
          const breakStart = new Date(te.lunch_start_at);
          const breakEnd = new Date(te.lunch_end_at);
          const breakHours = (breakEnd - breakStart) / (1000 * 60 * 60);
          return total + Math.max(0, hours - breakHours);
        }

        return total + Math.max(0, hours);
      }
      return total;
    }, 0);
  }

  const thisWeekEntries = timeEntries.filter((te) => {
    if (!te.clock_in_at) return false;
    const entryDate = new Date(te.clock_in_at);
    return entryDate >= startOfWeek;
  });

  const thisMonthEntries = timeEntries.filter((te) => {
    if (!te.clock_in_at) return false;
    const entryDate = new Date(te.clock_in_at);
    return entryDate >= startOfMonth;
  });

  const thisWeekHours = calculateHours(thisWeekEntries);
  const thisMonthHours = calculateHours(thisMonthEntries);
  const totalHours = calculateHours(timeEntries);

  const upcomingShifts = shifts.filter((s) => {
    if (!s.shift_date || !s.shift_start || !s.shift_end) return false;
    const shiftDate = new Date(s.shift_date);
    return shiftDate >= now && (s.status === "OPEN" || s.guard_id);
  });

  const upcomingHours = upcomingShifts.reduce((total, shift) => {
    if (shift.shift_start && shift.shift_end) {
      const start = shift.shift_start.split(":").map(Number);
      const end = shift.shift_end.split(":").map(Number);
      const startMinutes = start[0] * 60 + start[1];
      const endMinutes = end[0] * 60 + end[1];
      const hours = (endMinutes - startMinutes) / 60;
      return total + Math.max(0, hours);
    }
    return total;
  }, 0);

  return {
    thisWeek: { hours: Math.round(thisWeekHours * 10) / 10 },
    thisMonth: { hours: Math.round(thisMonthHours * 10) / 10 },
    totalHours: Math.round(totalHours * 10) / 10,
    upcoming: { hours: Math.round(upcomingHours * 10) / 10 },
  };
}

function getUpcomingShifts(shifts) {
  const now = new Date();
  const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  return shifts
    .filter((s) => {
      if (!s.shift_date) return false;
      const shiftDate = new Date(s.shift_date);
      return shiftDate >= now && shiftDate <= sevenDaysFromNow && (s.status === "OPEN" || s.guard_id);
    })
    .sort((a, b) => {
      const dateA = new Date(a.shift_date);
      const dateB = new Date(b.shift_date);
      return dateA - dateB;
    })
    .slice(0, 10)
    .map((s) => ({
      id: s.id,
      shift_date: s.shift_date,
      shift_start: s.shift_start,
      shift_end: s.shift_end,
      location: s.location || "TBD",
      status: s.status,
    }));
}

function calculateAchievements(shifts, timeEntries, callouts, performance) {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const earned = [];
  const inProgress = [];

  const recentCallouts = callouts.filter((c) => {
    const calloutDate = new Date(c.created_at);
    return calloutDate >= thirtyDaysAgo;
  });

  if (recentCallouts.length === 0 && shifts.length > 0) {
    earned.push({
      id: "perfect_attendance_30",
      name: "Perfect Attendance",
      icon: "🟢",
      description: "No callouts in the last 30 days",
      earnedAt: new Date().toISOString(),
    });
  }

  const clockIns = timeEntries.filter((te) => te.clock_in_at).slice(0, 30);
  let onTimeStreak = 0;

  for (let i = 0; i < clockIns.length; i++) {
    const te = clockIns[i];
    const shift = shifts.find((s) => s.id === te.shift_id);
    if (shift && shift.shift_date && shift.shift_start) {
      const shiftDateTime = new Date(`${shift.shift_date}T${shift.shift_start}`);
      const clockInTime = new Date(te.clock_in_at);
      const bufferMinutes = 15;
      const onTimeThreshold = new Date(shiftDateTime.getTime() + bufferMinutes * 60 * 1000);

      if (clockInTime <= onTimeThreshold) {
        onTimeStreak++;
      } else {
        break;
      }
    }
  }

  if (onTimeStreak >= 30) {
    earned.push({
      id: "on_time_streak_30",
      name: "30-Day On-Time Streak",
      icon: "🔴",
      description: "30 consecutive on-time clock-ins",
      earnedAt: new Date().toISOString(),
    });
  } else if (onTimeStreak >= 10) {
    earned.push({
      id: "on_time_streak_10",
      name: "10-Day On-Time Streak",
      icon: "🟠",
      description: "10 consecutive on-time clock-ins",
      earnedAt: new Date().toISOString(),
    });
  } else if (onTimeStreak >= 5) {
    earned.push({
      id: "on_time_streak_5",
      name: "5-Day On-Time Streak",
      icon: "🟡",
      description: "5 consecutive on-time clock-ins",
      earnedAt: new Date().toISOString(),
    });
  } else if (onTimeStreak > 0) {
    inProgress.push({
      id: "on_time_streak_30",
      name: "30-Day On-Time Streak",
      progress: onTimeStreak,
      target: 30,
    });
  }

  const completedShifts = shifts.filter((s) => {
    return s.status === "CLOSED" && timeEntries.some((te) => te.shift_id === s.id && te.clock_out_at);
  }).length;

  if (completedShifts >= 500) {
    earned.push({
      id: "shifts_500",
      name: "500 Shifts Completed",
      icon: "👑",
      description: "Completed 500 shifts",
      earnedAt: new Date().toISOString(),
    });
  } else if (completedShifts >= 250) {
    earned.push({
      id: "shifts_250",
      name: "250 Shifts Completed",
      icon: "💎",
      description: "Completed 250 shifts",
      earnedAt: new Date().toISOString(),
    });
  } else if (completedShifts >= 100) {
    earned.push({
      id: "shifts_100",
      name: "100 Shifts Completed",
      icon: "🥇",
      description: "Completed 100 shifts",
      earnedAt: new Date().toISOString(),
    });
  } else if (completedShifts >= 50) {
    earned.push({
      id: "shifts_50",
      name: "50 Shifts Completed",
      icon: "🥈",
      description: "Completed 50 shifts",
      earnedAt: new Date().toISOString(),
    });
  } else if (completedShifts >= 10) {
    earned.push({
      id: "shifts_10",
      name: "10 Shifts Completed",
      icon: "🥉",
      description: "Completed 10 shifts",
      earnedAt: new Date().toISOString(),
    });
  } else {
    const nextMilestone =
      completedShifts < 10 ? 10 : completedShifts < 50 ? 50 : completedShifts < 100 ? 100 : 250;
    inProgress.push({
      id: `shifts_${nextMilestone}`,
      name: `${nextMilestone} Shifts Completed`,
      progress: completedShifts,
      target: nextMilestone,
    });
  }

  if (performance.reliabilityScore >= 95) {
    earned.push({
      id: "highly_reliable",
      name: "Highly Reliable",
      icon: "⭐",
      description: "95%+ reliability score",
      earnedAt: new Date().toISOString(),
    });
  } else if (performance.reliabilityScore >= 90) {
    earned.push({
      id: "reliable",
      name: "Reliable",
      icon: "✅",
      description: "90%+ reliability score",
      earnedAt: new Date().toISOString(),
    });
  } else if (performance.reliabilityScore >= 85) {
    earned.push({
      id: "dependable",
      name: "Dependable",
      icon: "👍",
      description: "85%+ reliability score",
      earnedAt: new Date().toISOString(),
    });
  }

  return { earned, inProgress };
}

function calculateStreaks(shifts, timeEntries, callouts) {
  const now = new Date();
  const sortedShifts = shifts
    .filter((s) => s.shift_date)
    .sort((a, b) => new Date(b.shift_date) - new Date(a.shift_date));

  let attendanceStreak = 0;
  const seenDates = new Set();

  sortedShifts.forEach((s) => {
    const shiftDate = new Date(s.shift_date).toDateString();
    if (!seenDates.has(shiftDate)) {
      seenDates.add(shiftDate);
      attendanceStreak++;
    }
  });

  const clockIns = timeEntries.filter((te) => te.clock_in_at).slice(0, 30);
  let onTimeStreak = 0;

  for (let i = 0; i < clockIns.length; i++) {
    const te = clockIns[i];
    const shift = shifts.find((s) => s.id === te.shift_id);
    if (shift && shift.shift_date && shift.shift_start) {
      const shiftDateTime = new Date(`${shift.shift_date}T${shift.shift_start}`);
      const clockInTime = new Date(te.clock_in_at);
      const bufferMinutes = 15;
      const onTimeThreshold = new Date(shiftDateTime.getTime() + bufferMinutes * 60 * 1000);

      if (clockInTime <= onTimeThreshold) {
        onTimeStreak++;
      } else {
        break;
      }
    }
  }

  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const recentCallouts = callouts.filter((c) => {
    const calloutDate = new Date(c.created_at);
    return calloutDate >= thirtyDaysAgo;
  });

  const noCalloutsStreak = recentCallouts.length === 0 ? 30 : 0;

  return {
    attendance: Math.min(attendanceStreak, 30),
    onTime: onTimeStreak,
    noCallouts: noCalloutsStreak,
  };
}

module.exports = {
  calculatePerformanceMetrics,
  calculateEarnings,
  getUpcomingShifts,
  calculateAchievements,
  calculateStreaks,
};
