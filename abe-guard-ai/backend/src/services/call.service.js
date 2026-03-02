// src/services/call.service.js
const twilio = require("../config/twilio");

async function callGuard(guard, shift) {
  return twilio.calls.create({
    url: `${process.env.BASE_URL}/twilio/voice?shiftId=${shift.id}`,
    to: guard.phone,
    from: process.env.TWILIO_PHONE_NUMBER
  });
}

module.exports = callGuard;
