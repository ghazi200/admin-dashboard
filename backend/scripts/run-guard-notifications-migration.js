#!/usr/bin/env node
require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const { Sequelize } = require("sequelize");
const migration = require("../src/migrations/add_guard_notifications");

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
  // Ensure pgcrypto/uuid extension for gen_random_uuid
  try {
    await sequelize.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);
  } catch (_) {
    /* ignore */
  }
  await migration.up(sequelize.getQueryInterface(), Sequelize);
  await sequelize.close();
  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
