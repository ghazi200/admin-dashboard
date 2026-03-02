/**
 * Run MFA migration using app's Sequelize (same DB config as server).
 * Ensures connection is to abe_guard before running.
 * Usage: node scripts/run-mfa-migration.js
 * From: backend directory: cd backend && node scripts/run-mfa-migration.js
 */
const path = require("path");

// Load backend .env so DATABASE_URL points to abe_guard
const envPath = path.resolve(__dirname, "../.env");
require("dotenv").config({ path: envPath });

const REQUIRED_DB_NAMES = ["abe_guard", "abe-guard"];

const { sequelize } = require("../src/models");
const migration = require("../src/migrations/add_mfa_to_admins");
const { Sequelize } = require("sequelize");

async function run() {
  try {
    await sequelize.authenticate();
  } catch (err) {
    console.error("❌ Database connection failed:", err.message);
    console.error("   Check backend/.env: DATABASE_URL or DB_HOST/DB_NAME/DB_USER/DB_PASS");
    process.exit(1);
  }

  if (sequelize.getDialect() === "postgres") {
    const [rows] = await sequelize.query("SELECT current_database() AS db_name");
    const dbName = rows?.[0]?.db_name;
    if (!dbName || !REQUIRED_DB_NAMES.includes(dbName)) {
      console.error("❌ Wrong database. Must use abe_guard.");
      console.error(`   Current: ${dbName || "(unknown)"}`);
      console.error("   Set DATABASE_URL in backend/.env to postgresql://.../abe_guard");
      await sequelize.close();
      process.exit(1);
    }
    console.log("✅ Connected to database:", dbName);
  }

  const queryInterface = sequelize.getQueryInterface();
  try {
    await migration.up(queryInterface, Sequelize);
    console.log("✅ MFA migration completed (Admins columns + mfa_codes table).");
  } catch (err) {
    if (err.message && (err.message.includes("already exists") || err.message.includes("duplicate"))) {
      console.log("⚠️  MFA tables/columns already exist – skipping.");
    } else {
      console.error("❌ Migration failed:", err.message);
      process.exit(1);
    }
  } finally {
    await sequelize.close();
  }
}

run();
