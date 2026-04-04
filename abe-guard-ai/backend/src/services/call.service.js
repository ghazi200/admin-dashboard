const { getTwilioClient } = require("../config/twilio");
const { toE164 } = require("./sms.services");

/**
 * Outbound voice: Twilio fetches TwiML from PUBLIC_BASE_URL (or BASE_URL) + /twilio/voice
 * Set CALLOUT_ENABLE_VOICE_CALL=true to place calls during callouts (Twilio charges apply).
 */
async function callGuardForCallout(guard, shift, meta = {}) {
  if (String(process.env.CALLOUT_ENABLE_VOICE_CALL || "").toLowerCase() !== "true") {
    return { placed: false, reason: "CALLOUT_ENABLE_VOICE_CALL not true" };
  }

  const client = getTwilioClient();
  const from = process.env.TWILIO_PHONE_NUMBER || process.env.TWILIO_FROM_NUMBER;
  const to = toE164(guard?.phone);
  const base = String(process.env.PUBLIC_BASE_URL || process.env.BASE_URL || "")
    .trim()
    .replace(/\/+$/, "");

  if (!client || !from || !to || !base) {
    console.warn(
      "callGuardForCallout: need Twilio creds, TWILIO_PHONE_NUMBER, guard phone, and PUBLIC_BASE_URL"
    );
    return { placed: false, reason: "missing_config" };
  }

  const q = new URLSearchParams({
    shiftId: shift.id,
    ...(meta.calloutId ? { calloutId: meta.calloutId } : {}),
  });

  try {
    const call = await client.calls.create({
      url: `${base}/twilio/voice?${q.toString()}`,
      to,
      from,
    });
    console.log(`📞 Outbound call started sid=${call.sid} to=${to}`);
    return { placed: true, sid: call.sid };
  } catch (err) {
    console.error("Voice call failed:", err?.message || err);
    return { placed: false, error: err?.message };
  }
}

module.exports = { callGuardForCallout };
