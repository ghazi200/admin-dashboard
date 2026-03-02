/**
 * MFA service: create code, send via SMS or email, verify.
 * Uses mfa_codes table and Admins.mfa_enabled, mfa_channel, mfa_phone.
 */

const crypto = require("crypto");

const CODE_LENGTH = 6;
const CODE_EXPIRY_MINUTES = 10;

/**
 * Generate a numeric code (e.g. 6 digits).
 */
function generateCode() {
  const digits = crypto.randomBytes(CODE_LENGTH).reduce((acc, b) => {
    acc += (b % 10).toString();
    return acc;
  }, "");
  return digits.slice(0, CODE_LENGTH).padStart(CODE_LENGTH, "0");
}

/**
 * Create and store a new MFA code for an admin.
 * @param {Object} sequelize - Sequelize instance
 * @param {string|number} adminId - Admin id
 * @param {string} purpose - 'login' or 'setup'
 * @returns {{ code: string, expiresAt: Date }}
 */
async function createAndStoreCode(sequelize, adminId, purpose = "login") {
  const code = generateCode();
  const expiresAt = new Date(Date.now() + CODE_EXPIRY_MINUTES * 60 * 1000);
  await sequelize.query(
    `INSERT INTO mfa_codes (admin_id, code, purpose, expires_at) VALUES (:adminId, :code, :purpose, :expiresAt)`,
    {
      replacements: { adminId, code, purpose, expiresAt },
    }
  );
  return { code, expiresAt };
}

/**
 * Verify code: must match latest unused, not expired.
 * @param {Object} sequelize - Sequelize instance
 * @param {string|number} adminId - Admin id
 * @param {string} code - User-entered code
 * @param {string} purpose - 'login' or 'setup'
 * @returns {Promise<boolean>}
 */
async function verifyCode(sequelize, adminId, code, purpose = "login") {
  const [rows] = await sequelize.query(
    `SELECT id, code, expires_at FROM mfa_codes 
     WHERE admin_id = :adminId AND purpose = :purpose AND used_at IS NULL AND expires_at > NOW() 
     ORDER BY expires_at DESC LIMIT 1`,
    { replacements: { adminId, purpose } }
  );
  const row = rows && rows[0];
  if (!row || row.code !== String(code).trim()) return false;
  await sequelize.query(`UPDATE mfa_codes SET used_at = NOW() WHERE id = :id`, {
    replacements: { id: row.id },
  });
  return true;
}

/**
 * Send code via email (using existing email service).
 */
async function sendCodeByEmail(toEmail, code) {
  const emailService = require("./email.service");
  const subject = "Your login verification code";
  const text = `Your verification code is: ${code}. It expires in ${CODE_EXPIRY_MINUTES} minutes.`;
  const result = await emailService.sendReportEmail({
    to: toEmail,
    subject,
    text,
    html: `<p>Your verification code is: <strong>${code}</strong></p><p>It expires in ${CODE_EXPIRY_MINUTES} minutes.</p>`,
  });
  return result.success;
}

/**
 * Send code via SMS (Twilio if configured).
 * Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER in .env.
 */
async function sendCodeBySms(phoneNumber, code) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_NUMBER;
  if (!accountSid || !authToken || !from) {
    console.warn("MFA SMS: Twilio not configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER.");
    return false;
  }
  try {
    const twilio = require("twilio");
    const client = twilio(accountSid, authToken);
    await client.messages.create({
      body: `Your verification code is: ${code}. Expires in ${CODE_EXPIRY_MINUTES} min.`,
      from,
      to: phoneNumber,
    });
    return true;
  } catch (e) {
    if (e.code === "MODULE_NOT_FOUND") console.warn("MFA SMS: Install twilio: npm install twilio");
    else console.error("MFA SMS send error:", e.message);
    return false;
  }
}

/**
 * Send the MFA code to the admin (email or SMS based on their preference).
 * @param {Object} sequelize - Sequelize instance
 * @param {string|number} adminId - Admin id
 * @param {string} channel - 'sms' or 'email'
 * @param {string} destination - email address or phone number (E.164)
 * @param {string} code - The code to send (from createAndStoreCode)
 * @returns {Promise<boolean>}
 */
async function sendCode(sequelize, adminId, channel, destination, code) {
  if (channel === "sms") return await sendCodeBySms(destination, code);
  if (channel === "email") return await sendCodeByEmail(destination, code);
  return false;
}

module.exports = {
  createAndStoreCode,
  verifyCode,
  sendCode,
  sendCodeByEmail,
  sendCodeBySms,
  CODE_EXPIRY_MINUTES,
};
