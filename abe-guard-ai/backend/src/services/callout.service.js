const { Shift, Guard } = require('../models');
const { rankGuardsWithAI } = require('./aiDecisionEngine');
const notifyGuards = require('./notification.service');

async function handleCallout(shiftId, reason) {
  // 1️⃣ Fetch shift
  const shift = await Shift.findByPk(shiftId);
  if (!shift) throw new Error('Shift not found');

  // 2️⃣ Mark shift open
  shift.status = 'OPEN';
  shift.guard_id = null;
  await shift.save();

  // 3️⃣ Fetch eligible guards
  const guards = await Guard.findAll({
    where: { is_active: true }
  });

  // 4️⃣ Build AI context (minimal for now)
  const context = {
    shift: {
      id: shift.id,
      date: shift.shift_date,
      start: shift.shift_start,
      end: shift.shift_end,
      reason
    },
    guards: guards.map(g => ({
      id: g.id,
      name: g.name,
      weeklyHours: g.weekly_hours,
      isActive: g.is_active
    }))
  };

  // 5️⃣ Rank guards using AI
  const rankedGuards = await rankGuardsWithAI(context);

  // 6️⃣ Notify guards in ranked order
  for (const guard of rankedGuards) {
    await notifyGuards(guard, shift);
  }

  return {
    shiftId,
    notifiedGuards: rankedGuards.length
  };
}

module.exports = { handleCallout };
