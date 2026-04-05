#!/usr/bin/env node
/**
 * Single-recipient callout test: Bob only (one DB row, one SMS/email/call attempt).
 *
 * Usage:
 *   node scripts/runCalloutSingleBob.js [phone]
 *   node scripts/runCalloutSingleBob.js 347-530-7327
 *
 * Env:
 *   SHIFT_ID=<uuid>     — shift to attach (default: latest shift)
 *   TOUCH_SHIFT=false   — do not set shift OPEN / clear assignee (safer repeat tests)
 *   SMS_ONLY=true       — only SMS channel (default true): skips email + voice for this run
 *
 * Requires on Railway / .env for real SMS:
 *   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER (or TWILIO_FROM_NUMBER)
 * Trial Twilio: destination number must be verified in Twilio console.
 */
require("../src/loadEnv");

const { Op } = require("sequelize");
const { sequelize } = require("../src/config/db");
const { Guard, Shift, Callout } = require("../src/models");
const notifyGuards = require("../src/services/notification.service");
const { normalizeMessagingServiceSid } = require("../src/utils/twilioEnvNormalize");

function toE164(input) {
  const digits = String(input || "").replace(/\D/g, "");
  if (!digits) return null;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return `+${digits}`;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set.");
    process.exit(1);
  }

  const phoneArg = process.argv[2];
  const smsOnly = String(process.env.SMS_ONLY || "true").toLowerCase() !== "false";
  const touchShift = String(process.env.TOUCH_SHIFT || "true").toLowerCase() !== "false";

  await sequelize.authenticate();

  const bob = await Guard.findOne({
    where: {
      [Op.or]: [
        { name: { [Op.iLike]: "%bob%" } },
        { email: { [Op.iLike]: "%bob%" } },
      ],
      is_active: true,
    },
  });

  if (!bob) {
    console.error("No active guard matching 'bob' (name or email).");
    process.exit(1);
  }

  if (phoneArg) {
    bob.phone = toE164(phoneArg);
    await bob.save();
  }

  await bob.reload();

  if (!bob.phone) {
    console.error("Bob has no phone. Pass one: node scripts/runCalloutSingleBob.js 3475307327");
    process.exit(1);
  }

  let shift = null;
  if (process.env.SHIFT_ID) {
    shift = await Shift.findByPk(String(process.env.SHIFT_ID).trim());
  }
  if (!shift) {
    shift = await Shift.findOne({ order: [["shift_date", "DESC"]] });
  }
  if (!shift) {
    console.error("No shift found. Set SHIFT_ID.");
    process.exit(1);
  }

  if (touchShift) {
    shift.status = "OPEN";
    shift.guard_id = null;
    await shift.save();
    console.log(`Shift ${shift.id} set OPEN (unassigned) for test.`);
  } else {
    console.log(`Shift ${shift.id} left unchanged (TOUCH_SHIFT=false).`);
  }

  const calloutRow = await Callout.create({
    tenant_id: shift.tenant_id || bob.tenant_id || null,
    shift_id: shift.id,
    guard_id: bob.id,
    reason: "SICK",
  });

  const bobPlain = bob.get({ plain: true });
  const guardPayload = smsOnly ? { ...bobPlain, notifyBy: ["SMS", "APP"] } : bobPlain;
  // SMS_ONLY: drop CALL and EMAIL so we only hit Twilio SMS + optional socket
  if (smsOnly) {
    guardPayload.notifyBy = ["SMS", "APP"];
  }

  console.log("--- Config check ---");
  console.log("TWILIO_ACCOUNT_SID set:", Boolean(process.env.TWILIO_ACCOUNT_SID));
  console.log("TWILIO_AUTH_TOKEN set:", Boolean(process.env.TWILIO_AUTH_TOKEN));
  const msNorm = normalizeMessagingServiceSid(
    process.env.TWILIO_MESSAGING_SERVICE_SID || process.env.TWILIO_MESSAGE_SERVICE_SID || ""
  );
  console.log("TWILIO_MESSAGING_SERVICE_SID (normalized):", msNorm || "(not set — use TWILIO_PHONE_NUMBER)");
  console.log(
    "TWILIO_PHONE_NUMBER / TWILIO_FROM_NUMBER:",
    process.env.TWILIO_PHONE_NUMBER || process.env.TWILIO_FROM_NUMBER || "(not set)"
  );
  console.log("Bob phone (E.164 target):", toE164(bob.phone));
  console.log("Callout id:", calloutRow.id);
  console.log("----------------------");

  await notifyGuards(null, guardPayload, shift, {
    calloutId: calloutRow.id,
    rank: 1,
    aiReason: "Single-recipient test (Bob only)",
  });

  console.log("Done. If no SMS: verify Twilio trial verified this number, and Railway has the same TWILIO_* as local.");
  await sequelize.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
