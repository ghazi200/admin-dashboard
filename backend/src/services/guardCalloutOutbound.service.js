/**
 * Email / SMS / voice to ranked replacement guards after AI callout.
 * Runs on the admin (unified) backend so SMTP/Twilio on Railway admin work
 * even when Guard AI only delivers in-app events.
 */
const { sendReportEmail } = require("./email.service");

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

function buildEmailBody({ guardName, shift, reason, rank, aiReason, calloutId }) {
  const place = shift.location || "the open shift";
  const when =
    shift.shift_date && shift.shift_start && shift.shift_end
      ? `${shift.shift_date} ${shift.shift_start}-${shift.shift_end}`
      : shift.shift_date || "see app";
  return [
    `Hi ${guardName || "Guard"},`,
    "",
    "ABE Security — a shift needs coverage and you were ranked by AI as a replacement.",
    "",
    `Location: ${place}`,
    `When: ${when}`,
    reason ? `Callout reason: ${reason}` : null,
    rank != null ? `Your rank: #${rank}` : null,
    aiReason ? `Note: ${aiReason}` : null,
    calloutId ? `Ref: ${calloutId}` : null,
    "",
    "Open the ABE Guard app → Callouts to Accept or Decline.",
    "",
    "— ABE Security",
  ]
    .filter((line) => line != null)
    .join("\n");
}

function buildSmsBody({ shift, rank, calloutId }) {
  const date = String(shift.shift_date || "")
    .slice(0, 10)
    .replace(/T.*/, "");
  const a = String(shift.shift_start || "").slice(0, 8);
  const b = String(shift.shift_end || "").slice(0, 8);
  const place = String(shift.location || "shift").slice(0, 24);
  const ref = calloutId ? String(calloutId).replace(/-/g, "").slice(0, 8) : "";
  let s = `ABE callout ${place} ${date} ${a}-${b}. Open Guard app.`;
  if (rank != null) s += ` #${rank}`;
  if (ref) s += ` Ref:${ref}`;
  return s.length > 160 ? `${s.slice(0, 157)}...` : s;
}

async function sendSms(to, body) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const messagingServiceSid =
    process.env.TWILIO_MESSAGING_SERVICE_SID || process.env.TWILIO_MESSAGE_SERVICE_SID;
  const from = process.env.TWILIO_PHONE_NUMBER || process.env.TWILIO_FROM_NUMBER;
  if (!accountSid || !authToken) {
    return { sent: false, reason: "twilio_not_configured" };
  }
  if (!messagingServiceSid && !from) {
    return { sent: false, reason: "missing_from_or_messaging_service" };
  }
  try {
    const twilio = require("twilio");
    const client = twilio(accountSid, authToken);
    const payload = messagingServiceSid
      ? { body, to, messagingServiceSid }
      : { body, to, from };
    const msg = await client.messages.create(payload);
    return { sent: true, to, sid: msg.sid, status: msg.status };
  } catch (e) {
    return { sent: false, error: e?.message || String(e), code: e?.code };
  }
}

/**
 * Place outbound Twilio voice call offering the shift (press 1/2 on connect).
 */
async function placeCalloutVoiceCall(guard, shift, meta = {}) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_PHONE_NUMBER || process.env.TWILIO_FROM_NUMBER;
  const to = toE164(guard?.phone);
  const base = String(process.env.PUBLIC_BASE_URL || process.env.BASE_URL || "")
    .trim()
    .replace(/\/+$/, "");

  if (!accountSid || !authToken) {
    return { placed: false, reason: "twilio_not_configured" };
  }
  if (!from || isPlaceholderFromNumber(from)) {
    return {
      placed: false,
      reason: "missing_TWILIO_PHONE_NUMBER (voice needs a From number, not only Messaging Service)",
    };
  }
  if (!to) return { placed: false, reason: "no_phone" };
  if (!base || !/^https:\/\//i.test(base)) {
    return {
      placed: false,
      reason: "PUBLIC_BASE_URL must be your public https admin URL (Twilio fetches TwiML)",
    };
  }

  try {
    const twilio = require("twilio");
    const client = twilio(accountSid, authToken);
    const q = new URLSearchParams({
      shiftId: String(shift.id),
      ...(meta.calloutId ? { calloutId: String(meta.calloutId) } : {}),
      ...(guard?.id ? { guardId: String(guard.id) } : {}),
    });
    const call = await client.calls.create({
      to,
      from,
      url: `${base}/twilio/voice?${q.toString()}`,
      method: "POST",
    });
    console.log(`📞 Callout voice started sid=${call.sid} to=${to}`);
    return { placed: true, to, sid: call.sid, status: call.status };
  } catch (e) {
    return { placed: false, error: e?.message || String(e), code: e?.code };
  }
}

/**
 * @param {import('express').Application} app
 * @param {{ shiftId: string, reason?: string, rankings?: Array, callouts?: Array }} payload
 */
async function notifyRankedGuardsOutbound(app, payload = {}) {
  const emailEnabled =
    String(process.env.CALLOUT_OUTBOUND_EMAIL || "true").toLowerCase() !== "false";
  const smsEnabled =
    String(process.env.CALLOUT_OUTBOUND_SMS || "true").toLowerCase() !== "false";
  const callEnabled =
    String(process.env.CALLOUT_OUTBOUND_CALL || "").toLowerCase() === "true" ||
    String(process.env.CALLOUT_ENABLE_VOICE_CALL || "").toLowerCase() === "true";

  const { sequelize } = app.locals.models || {};
  const shiftId = payload.shiftId ? String(payload.shiftId) : "";
  const reason = payload.reason || null;
  const rankings = Array.isArray(payload.rankings) ? payload.rankings : [];

  if (!sequelize || !shiftId || rankings.length === 0) {
    return {
      emailed: 0,
      smsed: 0,
      called: 0,
      results: [],
      skipped: { email: !emailEnabled, sms: !smsEnabled, call: !callEnabled },
    };
  }

  if (!emailEnabled && !smsEnabled && !callEnabled) {
    console.log("📤 Callout outbound paused (EMAIL/SMS/CALL all off)");
    return {
      emailed: 0,
      smsed: 0,
      called: 0,
      results: [],
      skipped: { email: true, sms: true, call: true },
    };
  }

  const [shiftRows] = await sequelize.query(
    `SELECT id, location, shift_date, shift_start, shift_end, tenant_id
     FROM shifts WHERE id = $1::uuid LIMIT 1`,
    { bind: [shiftId] }
  );
  const shift = shiftRows[0];
  if (!shift) {
    return { emailed: 0, smsed: 0, called: 0, results: [], error: "shift_not_found" };
  }

  const guardIds = [
    ...new Set(
      rankings
        .map((r) => r.guardId || r.guard_id)
        .filter(Boolean)
        .map(String)
    ),
  ];
  if (guardIds.length === 0) {
    return { emailed: 0, smsed: 0, called: 0, results: [] };
  }

  const [guards] = await sequelize.query(
    `SELECT id::text AS id, name, email, phone
     FROM guards
     WHERE id::text = ANY($1::text[]) AND COALESCE(is_active, true) = true`,
    { bind: [guardIds] }
  );
  const byId = new Map((guards || []).map((g) => [String(g.id), g]));

  const maxNotify = parseInt(process.env.CALLOUT_MAX_GUARDS_NOTIFY || "0", 10);
  let emailed = 0;
  let smsed = 0;
  let called = 0;
  const results = [];
  let count = 0;

  for (const r of rankings) {
    if (maxNotify > 0 && count >= maxNotify) break;
    const gid = String(r.guardId || r.guard_id || "");
    const guard = byId.get(gid);
    if (!guard) continue;
    count += 1;

    const calloutId = r.calloutId || r.callout_id || null;
    const rank = r.rank != null ? r.rank : count;
    const aiReason = r.reason || r.aiReason || null;
    const entry = { guardId: gid, name: guard.name, email: null, sms: null, call: null };

    if (emailEnabled && guard.email) {
      const text = buildEmailBody({
        guardName: guard.name,
        shift,
        reason,
        rank,
        aiReason,
        calloutId,
      });
      const mail = await sendReportEmail({
        to: guard.email,
        subject: `Shift callout — ${shift.location || "coverage needed"}`,
        text,
        html: `<pre style="font-family:sans-serif;white-space:pre-wrap">${text.replace(/</g, "&lt;")}</pre>`,
      });
      entry.email = mail;
      if (mail.success) emailed += 1;
    } else if (!emailEnabled) {
      entry.email = { success: false, error: "paused_by_env" };
    } else {
      entry.email = { success: false, error: "no_email" };
    }

    const e164 = toE164(guard.phone);
    if (smsEnabled && e164) {
      const sms = await sendSms(e164, buildSmsBody({ shift, rank, calloutId }));
      entry.sms = sms;
      if (sms.sent) smsed += 1;
    } else if (!smsEnabled) {
      entry.sms = { sent: false, reason: "paused_by_env" };
    } else {
      entry.sms = { sent: false, reason: "no_phone" };
    }

    if (callEnabled) {
      const voice = await placeCalloutVoiceCall(guard, shift, { calloutId, rank, aiReason });
      entry.call = voice;
      if (voice.placed) called += 1;
    } else {
      entry.call = { placed: false, reason: "paused_by_env" };
    }

    results.push(entry);
  }

  console.log(
    `📤 Callout outbound: emailed=${emailed} smsed=${smsed} called=${called} of ${results.length} ranked (shift=${shiftId.slice(0, 8)})`
  );
  return { emailed, smsed, called, results };
}

module.exports = {
  notifyRankedGuardsOutbound,
  placeCalloutVoiceCall,
  toE164,
  buildEmailBody,
  buildSmsBody,
};
