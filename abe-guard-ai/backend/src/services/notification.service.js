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
 * notifyGuards(io, guard, shift, meta)
 * meta: { aiReason, calloutId, rank }
 */
async function notifyGuards(io, guard, shift, meta = {}) {
  const bodyText = buildCalloutCopy(shift, meta);
  const channels = getChannelsForGuard(guard);

  if (channels.includes("SMS")) {
    if (guard.phone) {
      const r = await sendCalloutSms(guard, shift, { ...meta, smsBody: bodyText });
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
