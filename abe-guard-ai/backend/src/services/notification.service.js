// backend/src/services/notification.service.js

function getChannelsForGuard(guard) {
  // If/when you add guard.notifyBy or guard.notify_channels, prefer it.
  // For now default to all channels so notifications always work.
  if (Array.isArray(guard.notifyBy) && guard.notifyBy.length > 0) {
    return guard.notifyBy;
  }
  return ["SMS", "EMAIL", "CALL", "APP"];
}

/**
 * notifyGuards(io, guard, shift, meta)
 * Pass io in to avoid circular dependency with server.js.
 */
async function notifyGuards(io, guard, shift, meta = {}) {
  const message = `🚨 ABE Security Shift Available
Date: ${shift.shift_date}
Time: ${shift.shift_start} - ${shift.shift_end}
Reply YES to accept.`;

  const channels = getChannelsForGuard(guard);

  if (channels.includes("SMS")) {
    console.log(`📱 SMS → ${guard.phone || "(no phone)"}: ${message}`);
    // TODO: Twilio
  }
  if (channels.includes("EMAIL")) {
    console.log(`📧 EMAIL → ${guard.email || "(no email)"}: ${message}`);
    // TODO: SendGrid
  }
  if (channels.includes("CALL")) {
    console.log(`📞 CALL → ${guard.phone || "(no phone)"}: Voice call stub`);
    // TODO: Twilio Voice
  }
  if (channels.includes("APP")) {
    if (io) {
      io.to("guards").emit("shift_opened", {
        shiftId: shift.id,
        shift,
        guardId: guard.id,
        aiReason: meta.aiReason || null,
      });
    }
    console.log(`🔔 APP → ${guard.name} (${guard.id}) | aiReason=${meta.aiReason || "n/a"}`);
  }
}

module.exports = notifyGuards;
