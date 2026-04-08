#!/usr/bin/env node
/**
 * One-time backfill: tenant-scoped admins (role admin + tenant_id) with empty permissions
 * get TENANT_ADMIN_DEFAULT_PERMISSIONS so requireAccess works after the tenant-admin change.
 *
 * From repo root:
 *   node backend/scripts/backfillTenantAdminPermissions.js
 *
 * Requires DATABASE_URL or DB_* in backend/.env (same as server).
 */
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const { TENANT_ADMIN_DEFAULT_PERMISSIONS } = require("../src/constants/tenantAdminDefaults");

async function main() {
  const { Sequelize } = require("sequelize");
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL not set");
    process.exit(1);
  }
  const sequelize = new Sequelize(url, { dialect: "postgres", logging: false });
  const permsJson = JSON.stringify(TENANT_ADMIN_DEFAULT_PERMISSIONS);
  const [rows] = await sequelize.query(
    `
    UPDATE "Admins"
    SET permissions = $1::json
    WHERE tenant_id IS NOT NULL
      AND LOWER(TRIM(role::text)) = 'admin'
      AND (
        permissions IS NULL
        OR permissions::text = '[]'
        OR permissions::text = 'null'
      )
    RETURNING id, email
    `,
    { bind: [permsJson] }
  );
  console.log(`Updated ${rows.length} admin(s).`);
  rows.slice(0, 20).forEach((r) => console.log("  ", r.id, r.email));
  if (rows.length > 20) console.log(`  ... and ${rows.length - 20} more`);
  await sequelize.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
