// src/services/guardResponseHandler.js
const { Callout, Guard, AIDecision } = require('../models');

/**
 * Handles a guard response (YES/NO) from SMS, Email, or App
 * @param {string} guardId - ID of the responding guard
 * @param {string} shiftId - ID of the shift
 * @param {string} response - 'YES' or 'NO'
 * @param {string} channel - 'SMS', 'EMAIL', 'APP', 'CALL'
 */
async function handleGuardResponse({ guardId, shiftId, response, channel }) {
  // Find the guard and shift
  const guard = await Guard.findByPk(guardId);
  const shift = await Callout.findOne({ where: { guard_id: guardId, shift_id: shiftId } });

  if (!guard || !shift) {
    throw new Error('Guard or shift not found');
  }

  // Save response in Callout record
  shift.response = response.toUpperCase();
  shift.responseChannel = channel.toUpperCase();
  shift.respondedAt = new Date();
  await shift.save();

  // Save AI learning data (attach AI reasoning if exists)
  if (guard.ai_reason) {
    await AIDecision.create({
      shift_id: shiftId,
      guard_id: guardId,
      decision: response.toUpperCase(),
      reasoning: guard.ai_reason,
      channel: channel.toUpperCase(),
    });
  }

  // Notify via Socket.IO to frontend if APP
  if (channel.toUpperCase() === 'APP') {
    io.to(`guards`).emit('guard_responded', {
      guardId,
      shiftId,
      response: response.toUpperCase(),
      channel: channel.toUpperCase(),
    });
  }

  console.log(`✅ Guard ${guard.name} responded ${response.toUpperCase()} via ${channel}`);
  return { guardId, shiftId, response: response.toUpperCase(), channel };
}

module.exports = { handleGuardResponse };
