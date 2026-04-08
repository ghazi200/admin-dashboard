/**
 * Inspect tenants + Bob guard (+ optional admin by email) against the DB in DATABASE_URL.
 *
 * Usage (paste your public Railway URL — not *.railway.internal from your Mac):
 *
 *   DATABASE_URL='postgresql://postgres:PASSWORD@HOST:PORT/railway' node scripts/queryTenantsAndBob.js
 *
 * Optional admin row:
 *
 *   DATABASE_URL='...' ADMIN_EMAIL=you@company.com node scripts/queryTenantsAndBob.js
 */

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

const { Op } = require("sequelize");
const { sequelize, Tenant, Guard, Admin } = require("../src/models");

async function main() {
  if (!process.env.DATABASE_URL || !String(process.env.DATABASE_URL).trim()) {
    console.error(
      "Set DATABASE_URL first, e.g.\n  DATABASE_URL='postgresql://...' node scripts/queryTenantsAndBob.js"
    );
    process.exit(1);
  }

  await sequelize.authenticate();
  const [db] = await sequelize.query("SELECT current_database() AS db");
  console.log("database:", db[0].db);

  console.log("\nTenants:");
  console.table(
    await Tenant.findAll({
      attributes: ["id", "name"],
      order: [["name", "ASC"]],
      raw: true,
    })
  );

  console.log("\nGuards (name or email ILIKE %bob%):");
  console.table(
    await Guard.findAll({
      where: {
        [Op.or]: [
          { name: { [Op.iLike]: "%bob%" } },
          { email: { [Op.iLike]: "%bob%" } },
        ],
      },
      attributes: ["id", "name", "email", "tenant_id"],
      raw: true,
    })
  );

  const email = process.env.ADMIN_EMAIL;
  if (email) {
    console.log("\nAdmin:", email);
    console.table(
      await Admin.findAll({
        where: { email },
        attributes: ["id", "email", "name", "tenant_id", "role"],
        raw: true,
      })
    );
  }

  await sequelize.close();
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
