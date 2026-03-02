/**
 * Run guard login lock migration (failed_login_attempts, locked_until).
 * Usage: node scripts/run-guard-login-lock-migration.js
 */
const path = require("path");
const envPath = path.resolve(__dirname, "../.env");
require("dotenv").config({ path: envPath });

const TARGET_DB = "abe_guard";
if (process.env.DATABASE_URL) {
  try {
    const url = new URL(process.env.DATABASE_URL);
    url.pathname = "/" + TARGET_DB;
    process.env.DATABASE_URL = url.toString();
  } catch (_) {}
} else if (!process.env.DB_NAME) {
  process.env.DB_NAME = TARGET_DB;
}

const { sequelize } = require("../src/models");
const migration = require("../src/migrations/add_guard_login_lock");
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
    console.log("✅ Guard login lock migration completed.");
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
