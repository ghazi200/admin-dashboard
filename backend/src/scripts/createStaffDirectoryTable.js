/**
 * Create staff_directory table for owner dashboard staff list.
 * Run from backend: node src/scripts/createStaffDirectoryTable.js
 */
const path = require("path");
const backendEnv = path.resolve(__dirname, "../../.env");
if (require("fs").existsSync(backendEnv)) require("dotenv").config({ path: backendEnv });
else require("dotenv").config();

const { sequelize } = require("../models");

async function main() {
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS staff_directory (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID,
      name VARCHAR(255) NOT NULL,
      title VARCHAR(255),
      contact TEXT,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );
  `);
  console.log("✅ Table staff_directory created or already exists.");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
