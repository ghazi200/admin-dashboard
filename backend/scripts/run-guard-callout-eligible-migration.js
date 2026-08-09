/**
 * Run callout_eligible migration on guards.
 * Usage: node scripts/run-guard-callout-eligible-migration.js
 */
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const { sequelize } = require("../src/models");
const migration = require("../src/migrations/add_guard_callout_eligible");
const { Sequelize } = require("sequelize");

async function run() {
  try {
    await sequelize.authenticate();
  } catch (err) {
    console.error("❌ Database connection failed:", err.message);
    process.exit(1);
  }
  const queryInterface = sequelize.getQueryInterface();
  try {
    await migration.up(queryInterface, Sequelize);
    console.log("✅ Guard callout_eligible migration completed.");
  } catch (err) {
    if (err.message && (err.message.includes("already exists") || err.message.includes("duplicate"))) {
      console.log("⚠️  Column already exists – skipping.");
    } else {
      console.error("❌ Migration failed:", err.message);
      process.exit(1);
    }
  } finally {
    await sequelize.close();
  }
}

run();
