const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
const { sequelize } = require("../src/models");
const migration = require("../src/migrations/add_audit_events");
const { Sequelize } = require("sequelize");

async function run() {
  try {
    await sequelize.authenticate();
    await migration.up(sequelize.getQueryInterface(), Sequelize);
    console.log("✅ audit_events migration completed.");
  } catch (err) {
    console.error("❌ Migration failed:", err.message);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

run();
