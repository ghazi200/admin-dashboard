// src/ai/calloutAgent.js
const { Guard, Shift } = require('../models');
const notifyGuards = require('../services/notification.service');
const { io } = require('../server');

// Rank guards based on custom logic (availability, hours, etc.)
function rankGuards(guards) {
  return guards.sort((a, b) => a.weekly_hours - b.weekly_hours);
}

async function handleCallout(shiftId) {
  // 1️⃣ Mark the shift as OPEN
  const shift = await Shift.findByPk(shiftId);
  if (!shift) throw new Error('Shift not found');

  shift.status = 'OPEN';
  shift.guard_id = null;
  await shift.save();

  // 2️⃣ Get all eligible guards
  const guards = await Guard.findAll({ where: { is_active: true } });

  // 3️⃣ Rank guards (RULES for now)
  const rankedGuards = rankGuards(guards);
  const source = 'rules'; // ← IMPORTANT: current ranking source

  // ✅ ADD THIS LOG RIGHT HERE
  console.log(`[CALL_OUT] ranking source = ${source}`);

  // 4️⃣ Notify guards
  for (const guard of rankedGuards) {
    await notifyGuards(guard, shift);
  }

  // 5️⃣ Emit real-time events
  io.to('guards').emit('shift_opened', shift);
  io.to('admin').emit('callout_started', shift);

  return {
    message: 'Callout processed',
    source, // ← helpful for frontend & audits
    shiftId: shift.id,
  };
}

module.exports = { handleCallout };
