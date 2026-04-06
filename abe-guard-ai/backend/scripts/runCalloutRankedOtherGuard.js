#!/usr/bin/env node
/**
 * Full ranked callout: Bob excluded, enhanced ranking (same as production), notify #1 only.
 * Passes AI-style ranking "reason" into notifyGuards (email + app; SMS uses short body).
 *
 * Usage:
 *   CALLOUT_TEST_SMS_TO=18777804236 node scripts/runCalloutRankedOtherGuard.js [shift-uuid]
 *
 * Env:
 *   CALLOUT_MAX_GUARDS_NOTIFY — default 1 (set in script)
 *   CALLOUT_TEST_SMS_TO — optional E.164-ish digits; temporarily sets #1 guard phone for SMS, then restores
 *   REASON=SICK|EMERGENCY|PERSONAL
 */
require("../src/loadEnv");

process.env.CALLOUT_MAX_GUARDS_NOTIFY = process.env.CALLOUT_MAX_GUARDS_NOTIFY || "1";

const { Op } = require("sequelize");
const { sequelize } = require("../src/config/db");
const { Guard, Shift } = require("../src/models");
const rankGuards = require("../src/services/ranking.service");
const { handleCallout } = require("../src/controllers/callouts.controller");

function toE164(input) {
  const digits = String(input || "").replace(/\D/g, "");
  if (!digits) return null;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return `+${digits}`;
}

async function main() {
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
    console.error("No active guard matching Bob.");
    process.exit(1);
  }

  const eligible = await Guard.findAll({ where: { is_active: true, id: { [Op.ne]: bob.id } } });
  if (!eligible.length) {
    console.error("No other active guards to rank.");
    process.exit(1);
  }

  const arg = process.argv[2];
  let shift =
    arg && /^[0-9a-f-]{36}$/i.test(arg)
      ? await Shift.findByPk(arg)
      : await Shift.findOne({ order: [["shift_date", "DESC"]] });
  if (!shift) {
    console.error("No shift. Pass shift UUID as first argument.");
    process.exit(1);
  }

  const models = { Shift, Guard };
  const ranked = await rankGuards(eligible, shift, models);
  const top = ranked[0];
  const trialRaw = process.env.CALLOUT_TEST_SMS_TO || process.argv[3];
  const trialPhone = trialRaw ? toE164(trialRaw) : null;

  let savedPhone = top.phone;
  if (trialPhone) {
    await Guard.update({ phone: trialPhone }, { where: { id: top.id } });
    console.log(`Temp phone for #1 ${top.name} (${top.id}) → ${trialPhone} (SMS test)\n`);
  }

  console.log(
    `[CALL_OUT] ranking preview: source=${process.env.OPENAI_API_KEY ? "openai-key-set (AIDecision model tag)" : "simple"}; #1=${top.name}`
  );
  console.log("Eligible (excl. Bob):", eligible.length, "| notifying max:", process.env.CALLOUT_MAX_GUARDS_NOTIFY);

  try {
    const result = await handleCallout(null, shift.id, process.env.REASON || "SICK", {
      callerGuardId: bob.id,
      tenantId: shift.tenant_id || bob.tenant_id || null,
      emitAdmin: null,
    });
    console.log("\nResult:", JSON.stringify({ message: result.message, shiftId: result.shiftId, rankings: result.rankings?.slice(0, 3) }, null, 2));
  } finally {
    if (trialPhone) {
      await Guard.update({ phone: savedPhone || null }, { where: { id: top.id } });
      console.log(`\nRestored ${top.name} phone in DB.`);
    }
  }

  await sequelize.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
