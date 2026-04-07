const { getTwilioClient, normalizeMessagingServiceSid } = require("../config/twilio");

/** Twilio will reject fake “from” numbers; common .env.example leftovers */
function isPlaceholderFromNumber(from) {
  if (!from) return false;
  const digits = String(from).replace(/\D/g, "");
  return (
    digits === "1234567890" ||
    digits === "5555555555" ||
    digits === "1111111111" ||
    /^0+$/.test(digits)
  );
}

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
  const messagingServiceSid = normalizeMessagingServiceSid(
    process.env.TWILIO_MESSAGING_SERVICE_SID || process.env.TWILIO_MESSAGE_SERVICE_SID
  );
  const from = process.env.TWILIO_PHONE_NUMBER || process.env.TWILIO_FROM_NUMBER;
  const to = toE164(guard?.phone);

  if (!client || !to) {
    const reason = !client
      ? "twilio_client_missing (install twilio + set TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN)"
      : "guard.phone missing or invalid";
    console.warn("SMS not sent:", reason, { to });
    return { sent: false, reason };
  }

  if (messagingServiceSid && isPlaceholderFromNumber(from)) {
    console.warn(
      "TWILIO_PHONE_NUMBER looks like a placeholder (+1234567890) — ignoring; using Messaging Service only."
    );
  }

  if (!messagingServiceSid && isPlaceholderFromNumber(from)) {
    console.error(
      "SMS not sent: TWILIO_PHONE_NUMBER is a placeholder (+1234567890). Remove it or set your real Twilio number, OR set TWILIO_MESSAGING_SERVICE_SID=MG… from Twilio Console."
    );
    return { sent: false, reason: "placeholder_twilio_phone_in_env" };
  }

  if (!messagingServiceSid && !from) {
    console.warn(
      "SMS not sent: set TWILIO_MESSAGING_SERVICE_SID (Messaging Service) or TWILIO_PHONE_NUMBER (From)"
    );
    return { sent: false, reason: "missing_from_or_messaging_service_sid" };
  }

  // Default body stays short (single GSM segment) — trial accounts reject multi-segment SMS.
  const body =
    meta.smsBody ||
    (() => {
      const date = String(shift.shift_date || "")
        .slice(0, 10)
        .replace(/T.*/, "");
      const a = String(shift.shift_start || "").slice(0, 8);
      const b = String(shift.shift_end || "").slice(0, 8);
      const ref = meta.calloutId ? String(meta.calloutId).replace(/-/g, "").slice(0, 8) : "";
      let s = `ABE callout ${date} ${a}-${b}. Open Guard app.`;
      if (ref) s += ` Ref:${ref}`;
      return s.length > 160 ? `${s.slice(0, 157)}...` : s;
    })();

  try {
    const payload = messagingServiceSid
      ? { body, to, messagingServiceSid }
      : { body, to, from };
    const msg = await client.messages.create(payload);
    console.log(`📱 SMS queued/sent to ${to} sid=${msg.sid} status=${msg.status}`);
    return { sent: true, to, sid: msg.sid, status: msg.status };
  } catch (err) {
    const code = err?.code;
    const more = err?.moreInfo || err?.more_info;
    console.error("SMS send failed:", err?.message || err, code != null ? `code=${code}` : "", more || "");
    return { sent: false, error: err?.message, code, moreInfo: more };
  }
}

/** Legacy name — same as sendCalloutSms with default message */
async function sendSMS(guard, shift, meta) {
  return sendCalloutSms(guard, shift, meta);
}

async function processSMSReply() {
  console.warn("processSMSReply: stub — wire Twilio webhook to respond flow");
}

module.exports = { sendCalloutSms, sendSMS, processSMSReply, toE164, isPlaceholderFromNumber };
