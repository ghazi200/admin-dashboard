/**
 * Insert missing rows into `tenants` for any tenant_id referenced elsewhere.
 * Fixes production FK errors when guards/admins exist but tenants was never seeded.
 *
 * Usage (production — use public DATABASE_URL from Railway):
 *
 *   cd backend
 *   DATABASE_URL='postgresql://...' node scripts/ensureMissingTenants.js
 *
 * Preview only:
 *
 *   DATABASE_URL='...' node scripts/ensureMissingTenants.js --dry-run
 */

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

const { Op } = require("sequelize");
const {
  sequelize,
  Tenant,
  Guard,
  Admin,
  Conversation,
  Shift,
} = require("../src/models");

/** Friendly names for known tenant UUIDs (match local seed / business names). */
const KNOWN_TENANT_NAMES = {
  "4941a27e-ea61-4847-b983-f56fb120f2aa": "ABE Security Company",
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function looksLikeUuid(v) {
  return typeof v === "string" && UUID_RE.test(v.trim());
}

async function distinctTenantIdsFromModel(Model, attr = "tenant_id") {
  const rows = await Model.findAll({
    attributes: [attr],
    where: { [attr]: { [Op.ne]: null } },
    raw: true,
  });
  const out = new Set();
  for (const row of rows) {
    const v = row[attr];
    if (looksLikeUuid(v)) out.add(v.trim());
  }
  return out;
}

async function collectReferencedTenantIds() {
  const sets = await Promise.all([
    distinctTenantIdsFromModel(Guard),
    distinctTenantIdsFromModel(Admin),
    distinctTenantIdsFromModel(Conversation),
    distinctTenantIdsFromModel(Shift),
  ]);
  const merged = new Set();
  for (const s of sets) for (const id of s) merged.add(id);
  return [...merged].sort();
}

function defaultNameForId(id) {
  return KNOWN_TENANT_NAMES[id] || `Organization (${id.slice(0, 8)}…)`;
}

async function main() {
  const dryRun =
    process.argv.includes("--dry-run") || process.env.DRY_RUN === "1";

  if (!process.env.DATABASE_URL || !String(process.env.DATABASE_URL).trim()) {
    console.error(
      "Set DATABASE_URL, e.g.\n  DATABASE_URL='postgresql://...' node scripts/ensureMissingTenants.js"
    );
    process.exit(1);
  }

  await sequelize.authenticate();
  const [dbRow] = await sequelize.query("SELECT current_database() AS db");
  console.log("database:", dbRow[0]?.db);
  console.log(dryRun ? "DRY RUN (no writes)\n" : "");

  const referenced = await collectReferencedTenantIds();
  if (referenced.length === 0) {
    console.log("No non-null tenant_id values found on guards/admins/conversations/shifts.");
    await sequelize.close();
    return;
  }

  console.log("Referenced tenant UUIDs:", referenced.length);
  const toCreate = [];
  for (const id of referenced) {
    const row = await Tenant.findByPk(id);
    if (!row) toCreate.push(id);
  }

  if (toCreate.length === 0) {
    console.log("All referenced tenant_ids already exist in tenants. Nothing to do.");
    await sequelize.close();
    return;
  }

  console.log("Missing from tenants (will create):", toCreate.length);
  for (const id of toCreate) {
    const name = defaultNameForId(id);
    console.log(`  - ${id} → "${name}"`);
    if (dryRun) continue;
    await Tenant.create({
      id,
      name,
    });
    console.log("    created.");
  }

  if (dryRun) {
    console.log("\nRun without --dry-run to apply.");
  } else {
    console.log("\nDone. Have admins log out and log in again so JWT tenant_id matches.");
  }

  await sequelize.close();
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
