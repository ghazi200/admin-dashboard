#!/usr/bin/env node
/**
 * E2E (local DB): callout → ranked notify #1 → ACCEPT → shift CLOSED + guard_id set.
 *
 *   CALLOUT_MAX_GUARDS_NOTIFY=1 node scripts/e2eCalloutAcceptTest.js [shift-uuid]
 */
require("../src/loadEnv");

process.env.CALLOUT_MAX_GUARDS_NOTIFY = process.env.CALLOUT_MAX_GUARDS_NOTIFY || "1";

const { Op } = require("sequelize");
const { sequelize } = require("../src/config/db");
const { Guard, Shift } = require("../src/models");
const { handleCallout, respondToCallout } = require("../src/controllers/callouts.controller");

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
    console.error("No active Bob guard.");
    process.exit(1);
  }

  const arg = process.argv[2];
  let shiftRow = null;
  if (arg && /^[0-9a-f-]{36}$/i.test(arg)) {
    shiftRow = await Shift.findByPk(arg);
  } else {
    shiftRow = await Shift.findOne({ order: [["shift_date", "DESC"]] });
  }
  if (!shiftRow) {
    console.error("No shift. Pass a shift UUID.");
    process.exit(1);
  }

  console.log("=== 1) Callout (Bob excluded, notify max", process.env.CALLOUT_MAX_GUARDS_NOTIFY, ") ===");
  const result = await handleCallout(null, shiftRow.id, process.env.REASON || "SICK", {
    callerGuardId: bob.id,
    tenantId: shiftRow.tenant_id || bob.tenant_id,
    emitAdmin: null,
  });

  const first = result.rankings?.find((r) => r.calloutId);
  if (!first?.calloutId) {
    console.error("No calloutId on #1 ranking — raise CALLOUT_MAX_GUARDS_NOTIFY or check guards.");
    console.log(JSON.stringify(result, null, 2));
    process.exit(1);
  }

  console.log("Rank #1 guard:", first.guardId);
  console.log("calloutId:", first.calloutId);
  console.log("aiReason:", first.reason);

  console.log("\n=== 2) POST /callouts/:id/respond ACCEPTED (simulates Guard app) ===");
  const req = {
    app: {
      get: (k) => (k === "io" || k === "emitAdmin" ? null : undefined),
    },
    params: { calloutId: first.calloutId },
    body: { response: "ACCEPTED" },
  };
  let statusCode = 200;
  const res = {
    status(c) {
      statusCode = c;
      return this;
    },
    json(d) {
      console.log("HTTP", statusCode, JSON.stringify(d, null, 2));
      return this;
    },
  };

  await respondToCallout(req, res);

  const updated = await Shift.findByPk(shiftRow.id);
  console.log("\n=== 3) Shift row ===");
  console.log({ id: updated.id, status: updated.status, guard_id: updated.guard_id });

  const ok = String(updated.guard_id) === String(first.guardId) && String(updated.status).toUpperCase() === "CLOSED";
  console.log(ok ? "\n✅ PASS" : "\n❌ FAIL");
  await sequelize.close();
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
