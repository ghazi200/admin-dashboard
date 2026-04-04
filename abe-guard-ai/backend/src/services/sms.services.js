const { getTwilioClient } = require("../config/twilio");

function toE164(phone) {
  const raw = String(phone || "").trim();
  if (!raw) return null;
  if (raw.startsWith("+")) return raw.replace(/\s/g, "");
  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return `+${digits}`;
}

/**
 * SMS for callout / shift offer (Twilio).
 */
async function sendCalloutSms(guard, shift, meta = {}) {
  const client = getTwilioClient();
  const from = process.env.TWILIO_PHONE_NUMBER || process.env.TWILIO_FROM_NUMBER;
  const to = toE164(guard?.phone);
  if (!client || !from || !to) {
    return { sent: false, reason: "missing_twilio_config_or_phone" };
  }

  const body =
    meta.smsBody ||
    `ABE callout: shift ${shift.shift_date} ${shift.shift_start}-${shift.shift_end}. Open the Guard app to respond.${meta.calloutId ? ` Ref ${String(meta.calloutId).slice(0, 8)}…` : ""}`;

  try {
    await client.messages.create({ body, from, to });
    console.log(`📱 SMS sent to ${to}`);
    return { sent: true, to };
  } catch (err) {
    console.error("SMS send failed:", err?.message || err);
    return { sent: false, error: err?.message };
  }
}

/** Legacy name — same as sendCalloutSms with default message */
async function sendSMS(guard, shift, meta) {
  return sendCalloutSms(guard, shift, meta);
}

async function processSMSReply() {
  console.warn("processSMSReply: stub — wire Twilio webhook to respond flow");
}

module.exports = { sendCalloutSms, sendSMS, processSMSReply, toE164 };
