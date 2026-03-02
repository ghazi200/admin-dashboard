function buildAIContext(shift, guards) {
  return {
    shift: {
      id: shift.id,
      date: shift.shift_date,
      startTime: shift.shift_start,
      endTime: shift.shift_end,
      status: shift.status
    },
    guards: guards.map(g => ({
      id: g.id,
      name: g.name,
      weeklyHours: g.weekly_hours,
      isActive: g.is_active,
      lastShiftEnded: g.last_shift_end || null,
      acceptanceRate: g.acceptance_rate || 0.7
    }))
  };
}

module.exports = buildAIContext;
