#!/usr/bin/env node
/**
 * One-off: set Bob's phone, then run handleCallout so Bob receives SMS/call (if Twilio configured).
 *
 * Uses DATABASE_URL from abe-guard-ai/backend/.env or monorepo root .env.
 *
 * Usage:
 *   node scripts/runCalloutNotifyBob.js [+13475307327]
 *
 * Optional env:
 *   SHIFT_ID=uuid  — use this shift (otherwise first CLOSED shift with a guard)
 *   CALLOUT_ENABLE_VOICE_CALL=true  — place Twilio voice call (needs PUBLIC_BASE_URL)
 */
require("../src/loadEnv");

const { Op } = require("sequelize");
const { sequelize } = require("../src/config/db");
const { Guard, Shift } = require("../src/models");
const { handleCallout } = require("../src/controllers/callouts.controller");

const TARGET_PHONE = process.argv[2] || "3475307327";

function toE164(input) {
  const digits = String(input || "").replace(/\D/g, "");
  if (!digits) return "+13475307327";
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return `+${digits}`;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set. Add it to abe-guard-ai/backend/.env or repo root .env.");
    process.exit(1);
  }

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
    console.error("No active guard matching name/email containing 'bob'.");
    process.exit(1);
  }

  bob.phone = toE164(TARGET_PHONE);
  await bob.save();
  console.log(`✅ Bob guard: ${bob.id} ${bob.name} <${bob.email}> phone=${bob.phone}`);

  const other = await Guard.findOne({
    where: {
      id: { [Op.ne]: bob.id },
      is_active: true,
    },
  });

  const callerGuardId = other ? other.id : null;
  if (callerGuardId) {
    console.log(`ℹ️ Excluding caller guard ${other.name} (${callerGuardId}) so Bob stays in notify list.`);
  } else {
    console.log("ℹ️ No other active guard — callerGuardId null (all active guards including Bob get ranked).");
  }

  let shift = null;
  if (process.env.SHIFT_ID) {
    shift = await Shift.findByPk(process.env.SHIFT_ID.trim());
  }
  if (!shift) {
    shift = await Shift.findOne({
      where: { guard_id: { [Op.ne]: null }, status: "CLOSED" },
      order: [["shift_date", "DESC"]],
    });
  }
  if (!shift) {
    shift = await Shift.findOne({ order: [["shift_date", "DESC"]] });
  }
  if (!shift) {
    console.error("No shift found. Set SHIFT_ID=uuid");
    process.exit(1);
  }

  console.log(`🚨 Running callout on shift ${shift.id} (will set OPEN + clear assignee)`);

  const result = await handleCallout(null, shift.id, process.env.REASON || "SICK", {
    callerGuardId,
    tenantId: shift.tenant_id || null,
    emitAdmin: null,
  });

  console.log(JSON.stringify(result, null, 2));
  console.log("Done. Check Bob's phone for SMS; voice only if CALLOUT_ENABLE_VOICE_CALL=true and PUBLIC_BASE_URL set.");

  await sequelize.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
