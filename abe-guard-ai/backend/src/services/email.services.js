// src/services/email.service.js
const nodemailer = require('nodemailer');
const { handleGuardResponse } = require('./guardResponseHandler');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

/**
 * Send shift notification via Email
 * @param {Object} guard - Guard object { id, name, email }
 * @param {Object} shift - Shift object { id, shift_date, shift_start, shift_end }
 */
async function sendEmail(guard, shift) {
  const message = `
🚨 ABE Security Shift Available
Date: ${shift.shift_date}
Time: ${shift.shift_start} - ${shift.shift_end}

Click YES to accept, NO to decline.
`;

  try {
    await transporter.sendMail({
      from: process.env.SMTP_FROM,
      to: guard.email,
      subject: 'Shift Available',
      text: message
    });
    console.log(`📧 Email sent to ${guard.email}`);
  } catch (err) {
    console.error('Error sending Email:', err);
  }
}

/**
 * Process incoming email response
 * This could be triggered via a webhook or email parser
 */
async function processEmailReply({ email, body, shiftId }) {
  const response = body.trim().toUpperCase();
  const guardId = await findGuardByEmail(email); // Implement this lookup

  if (!guardId) {
    console.log(`⚠️ Unknown email: ${email}`);
    return;
  }

  await handleGuardResponse({
    guardId,
    shiftId,
    response,
    channel: 'EMAIL'
  });
}

module.exports = { sendEmail, processEmailReply };
