let cachedTransporter = null;

function getTransporter() {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user) return null;

  if (cachedTransporter) return cachedTransporter;

  try {
    // eslint-disable-next-line import/no-extraneous-dependencies, global-require
    const nodemailer = require("nodemailer");
    cachedTransporter = nodemailer.createTransport({
      host,
      port: parseInt(process.env.SMTP_PORT || "587", 10),
      secure: String(process.env.SMTP_SECURE || "").toLowerCase() === "true",
      auth: { user, pass },
    });
    return cachedTransporter;
  } catch (e) {
    console.warn("nodemailer not installed; run: npm install nodemailer");
    return null;
  }
}

/**
 * Email for callout / shift offer.
 */
async function sendCalloutEmail(guard, shift, meta = {}) {
  const transporter = getTransporter();
  const from = process.env.SMTP_FROM || process.env.SMTP_USER;
  const to = guard?.email;
  if (!transporter || !from || !to) {
    return { sent: false, reason: "missing_smtp_config_or_email" };
  }

  const text =
    meta.emailBody ||
    `Callout — shift needs coverage

Date: ${shift.shift_date}
Time: ${shift.shift_start} - ${shift.shift_end}
${meta.aiReason ? `Ranking note: ${meta.aiReason}\n` : ""}${meta.calloutId ? `Callout ID: ${meta.calloutId}\n` : ""}
Open the ABE Guard app to accept or decline this offer.`;

  try {
    await transporter.sendMail({
      from,
      to,
      subject: meta.subject || "Shift callout — action needed",
      text,
    });
    console.log(`📧 Email sent to ${to}`);
    return { sent: true, to };
  } catch (err) {
    console.error("Email send failed:", err?.message || err);
    return { sent: false, error: err?.message };
  }
}

async function sendEmail(guard, shift, meta) {
  return sendCalloutEmail(guard, shift, meta);
}

async function processEmailReply() {
  console.warn("processEmailReply: stub");
}

module.exports = { sendCalloutEmail, sendEmail, processEmailReply, getTransporter };
