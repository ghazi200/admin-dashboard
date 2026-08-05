/**
 * Run guard_reputation migration.
 * Usage: node scripts/run-guard-reputation-migration.js
 */
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const { sequelize } = require("../src/models");
const migration = require("../src/migrations/add_guard_reputation");
const { Sequelize } = require("sequelize");

async function run() {
  try {
    await sequelize.authenticate();
  } catch (err) {
    console.error("❌ Database connection failed:", err.message);
    process.exit(1);
  }
  try {
    await migration.up(sequelize.getQueryInterface(), Sequelize);
    console.log("✅ Guard reputation migration completed.");
  } catch (err) {
    console.error("❌ Migration failed:", err.message);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

run();
