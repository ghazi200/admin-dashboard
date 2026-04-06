// backend/src/services/notification.service.js

const { sendCalloutSms } = require("./sms.services");
const { sendCalloutEmail } = require("./email.services");
const { callGuardForCallout } = require("./call.service");

function getChannelsForGuard(guard) {
  if (Array.isArray(guard.notifyBy) && guard.notifyBy.length > 0) {
    return guard.notifyBy;
  }
  return ["SMS", "EMAIL", "CALL", "APP"];
}

function buildCalloutCopy(shift, meta = {}) {
  const lines = [
    "🚨 ABE Security — shift callout",
    `Date: ${shift.shift_date}`,
    `Time: ${shift.shift_start} - ${shift.shift_end}`,
  ];
  if (meta.aiReason) lines.push(`Note: ${meta.aiReason}`);
  if (meta.rank != null) lines.push(`Your rank: #${meta.rank}`);
  if (meta.calloutId) lines.push(`Use the Guard app to respond. Ref: ${meta.calloutId}`);
  else lines.push("Use the Guard app to respond.");
  return lines.join("\n");
}

/**
 * Single-segment SMS (ASCII, no emoji). Twilio trial accounts reject multi-segment / long bodies.
 * GSM-7 single segment max 160 chars — stay under that.
 */
function buildCalloutSmsBody(shift, meta = {}) {
  const date = String(shift.shift_date || "")
    .slice(0, 10)
    .replace(/T.*/, "");
  const start = String(shift.shift_start || "").slice(0, 8);
  const end = String(shift.shift_end || "").slice(0, 8);
  const ref = meta.calloutId ? String(meta.calloutId).replace(/-/g, "").slice(0, 8) : "";
  let s = `ABE callout ${date} ${start}-${end}. Open Guard app.`;
  if (ref) s += ` Ref:${ref}`;
  if (meta.rank != null) s += ` #${meta.rank}`;
  if (s.length > 160) s = `${s.slice(0, 157)}...`;
  return s;
}

/**
 * notifyGuards(io, guard, shift, meta)
 * meta: { aiReason, calloutId, rank }
 */
async function notifyGuards(io, guard, shift, meta = {}) {
  const bodyText = buildCalloutCopy(shift, meta);
  const smsText = buildCalloutSmsBody(shift, meta);
  const channels = getChannelsForGuard(guard);

  if (channels.includes("SMS")) {
    if (guard.phone) {
      const r = await sendCalloutSms(guard, shift, { ...meta, smsBody: smsText });
      if (!r.sent) console.log(`📱 SMS skipped (${r.reason || r.error || "unknown"}) → ${guard.phone}`);
    } else {
      console.log("📱 SMS skipped (no phone on guard record)");
    }
  }

  if (channels.includes("EMAIL")) {
    if (guard.email) {
      const r = await sendCalloutEmail(guard, shift, { ...meta, emailBody: bodyText });
      if (!r.sent) console.log(`📧 Email skipped (${r.reason || r.error || "unknown"})`);
    } else {
      console.log("📧 Email skipped (no email on guard record)");
    }
  }

  if (channels.includes("CALL")) {
    if (guard.phone) {
      const r = await callGuardForCallout(guard, shift, meta);
      if (!r.placed) console.log(`📞 Call skipped (${r.reason || r.error || "unknown"})`);
    } else {
      console.log("📞 Call skipped (no phone)");
    }
  }

  if (channels.includes("APP")) {
    if (io) {
      io.to("guards").emit("shift_opened", {
        shiftId: shift.id,
        shift,
        guardId: guard.id,
        calloutId: meta.calloutId ?? null,
        rank: meta.rank ?? null,
        aiReason: meta.aiReason || null,
      });
    }
    console.log(
      `🔔 APP → ${guard.name} (${guard.id}) | calloutId=${meta.calloutId || "n/a"} | aiReason=${meta.aiReason || "n/a"}`
    );
  }
}

module.exports = notifyGuards;
