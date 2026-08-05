/**
 * Run SMS/voice communications consent migration on guards.
 * Usage: node scripts/run-guard-communications-consent-migration.js
 *
 * Uses DATABASE_URL / DB_* from backend/.env as-is (same DB the app uses).
 */
const path = require("path");
const envPath = path.resolve(__dirname, "../.env");
require("dotenv").config({ path: envPath });

const { sequelize } = require("../src/models");
const migration = require("../src/migrations/add_guard_communications_consent");
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
    console.log("✅ Guard communications consent migration completed.");
  } catch (err) {
    if (err.message && (err.message.includes("already exists") || err.message.includes("duplicate"))) {
      console.log("⚠️  Column(s) already exist – skipping.");
    } else {
      console.error("❌ Migration failed:", err.message);
      process.exit(1);
    }
  } finally {
    await sequelize.close();
  }
}

run();
