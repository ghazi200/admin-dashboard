#!/usr/bin/env node
/**
 * Usage: node scripts/run-shift-accept-pending-migration.js
 */
require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const { Sequelize } = require("sequelize");
const migration = require("../src/migrations/add_shift_accept_pending");

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL required");
    process.exit(1);
  }
  const sequelize = new Sequelize(url, {
    logging: console.log,
    dialectOptions: { ssl: { require: true, rejectUnauthorized: false } },
  });
  const qi = sequelize.getQueryInterface();
  await migration.up(qi, Sequelize);
  await sequelize.close();
  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
