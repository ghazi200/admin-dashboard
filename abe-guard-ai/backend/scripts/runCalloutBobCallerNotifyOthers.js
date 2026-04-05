#!/usr/bin/env node
/**
 * Full callout: Bob = caller (excluded), all other active guards ranked + SMS/app notify.
 * Uses DATABASE_URL + TWILIO_* from abe-guard-ai/backend/.env
 *
 *   node scripts/runCalloutBobCallerNotifyOthers.js [shiftId]
 */
require("../src/loadEnv");

const { Op } = require("sequelize");
const { sequelize } = require("../src/config/db");
const { Guard, Shift } = require("../src/models");
const { handleCallout } = require("../src/controllers/callouts.controller");

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
    console.error("No active Bob guard");
    process.exit(1);
  }

  let shift = null;
  const arg = process.argv[2];
  if (arg && /^[0-9a-f-]{36}$/i.test(arg)) {
    shift = await Shift.findByPk(arg);
  }
  if (!shift) {
    shift = await Shift.findOne({ order: [["shift_date", "DESC"]] });
  }
  if (!shift) {
    console.error("No shift. Pass shift UUID: node scripts/runCalloutBobCallerNotifyOthers.js <uuid>");
    process.exit(1);
  }

  console.log("Caller (excluded):", bob.name, bob.id);
  console.log("Shift:", shift.id);
  console.log("→ Opens shift, ranks eligible guards, Twilio SMS + app for each (trial may skip unverified numbers).\n");

  const result = await handleCallout(null, shift.id, process.env.REASON || "SICK", {
    callerGuardId: bob.id,
    tenantId: shift.tenant_id || bob.tenant_id || null,
    emitAdmin: null,
  });

  console.log(JSON.stringify({ message: result.message, shiftId: result.shiftId, rankingsCount: result.rankings?.length, calloutsCreated: result.callouts?.length }, null, 2));
  await sequelize.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
