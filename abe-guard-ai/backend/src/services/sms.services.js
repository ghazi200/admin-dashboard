// src/services/sms.service.js
const twilio = require('twilio');
const { handleGuardResponse } = require('./guardResponseHandler');

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

/**
 * Send shift notification via SMS
 * @param {Object} guard - Guard object { id, name, phone }
 * @param {Object} shift - Shift object { id, shift_date, shift_start, shift_end }
 */
async function sendSMS(guard, shift) {
  const message = `🚨 Shift Available: ${shift.shift_date} ${shift.shift_start}-${shift.shift_end}
Reply YES to accept, NO to decline.`;

  try {
    await client.messages.create({
      body: message,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: guard.phone
    });
    console.log(`📱 SMS sent to ${guard.phone}`);
  } catch (err) {
    console.error('Error sending SMS:', err);
  }
}

/**
 * Process incoming SMS reply
 * This would be called from your Twilio webhook
 * @param {string} from - Phone number of the guard
 * @param {string} body - Reply message (YES/NO)
 * @param {string} shiftId - Shift ID being responded to
 */
async function processSMSReply({ from, body, shiftId }) {
  const response = body.trim().toUpperCase();
  const guardId = await findGuardByPhone(from); // Implement this lookup

  if (!guardId) {
    console.log(`⚠️ Unknown phone: ${from}`);
    return;
  }

  await handleGuardResponse({
    guardId,
    shiftId,
    response,
    channel: 'SMS'
  });
}

module.exports = { sendSMS, processSMSReply };
