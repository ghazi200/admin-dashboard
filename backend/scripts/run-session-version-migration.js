/**
 * Run session_token_version migration (single session / log out other devices).
 * Connects to database abe_guard.
 * Usage: node scripts/run-session-version-migration.js
 * From: backend directory: cd backend && node scripts/run-session-version-migration.js
 */
const path = require("path");

const envPath = path.resolve(__dirname, "../.env");
require("dotenv").config({ path: envPath });

const TARGET_DB = "abe_guard";
const REQUIRED_DB_NAMES = ["abe_guard", "abe-guard"];

// Force connection to abe_guard: if DATABASE_URL is set, rewrite path to /abe_guard
if (process.env.DATABASE_URL) {
  try {
    const url = new URL(process.env.DATABASE_URL);
    url.pathname = "/" + TARGET_DB;
    process.env.DATABASE_URL = url.toString();
  } catch (_) {}
} else if (!process.env.DB_NAME || !REQUIRED_DB_NAMES.includes(process.env.DB_NAME)) {
  process.env.DB_NAME = TARGET_DB;
}

const { sequelize } = require("../src/models");
const migration = require("../src/migrations/add_session_token_version_to_admins");
const { Sequelize } = require("sequelize");

async function run() {
  try {
    await sequelize.authenticate();
  } catch (err) {
    console.error("❌ Database connection failed:", err.message);
    process.exit(1);
  }

  if (sequelize.getDialect() === "postgres") {
    const [rows] = await sequelize.query("SELECT current_database() AS db_name");
    const dbName = rows?.[0]?.db_name;
    if (!dbName || !REQUIRED_DB_NAMES.includes(dbName)) {
      console.error("❌ Wrong database. Must use abe_guard.");
      console.error("   Set DATABASE_URL in backend/.env to postgresql://.../abe_guard");
      await sequelize.close();
      process.exit(1);
    }
    console.log("✅ Connected to database:", dbName);
  }

  const queryInterface = sequelize.getQueryInterface();
  try {
    await migration.up(queryInterface, Sequelize);
    console.log("✅ session_token_version migration completed.");
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
