/**
 * Create sites table + insert test site for Geographic Dashboard.
 * Uses the same database as the admin-dashboard backend: abe_guard.
 * Run from backend folder: node src/scripts/createSitesTable.js
 */
const path = require("path");
const fs = require("fs");

const backendEnv = path.resolve(__dirname, "../../.env");
const rootEnv = path.resolve(__dirname, "../../../.env");
if (fs.existsSync(backendEnv)) {
  require("dotenv").config({ path: backendEnv });
} else if (fs.existsSync(rootEnv)) {
  require("dotenv").config({ path: rootEnv });
} else {
  require("dotenv").config();
}
if (!process.env.DATABASE_URL && !process.env.DB_NAME) {
  console.error("❌ No DATABASE_URL or DB_NAME in .env. Use backend/.env with postgresql://.../abe_guard");
  process.exit(1);
}

const { sequelize } = require("../models");

const REQUIRED_DB_NAMES = ["abe_guard", "abe-guard"];

async function main() {
  try {
    await sequelize.authenticate();
    const [dbInfo] = await sequelize.query("SELECT current_database() AS db_name");
    const dbName = dbInfo[0]?.db_name;
    if (!dbName || !REQUIRED_DB_NAMES.includes(dbName)) {
      console.error("❌ Wrong database. Must use abe_guard.");
      console.error("   Current:", dbName || "(unknown)");
      console.error("   Set DATABASE_URL in backend/.env to postgresql://.../abe_guard");
      process.exit(1);
    }
    console.log("✅ Using database: " + dbName + " (correct)");

    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS sites (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) NOT NULL,
        address_1 TEXT,
        address_2 TEXT,
        latitude DECIMAL(10, 7),
        longitude DECIMAL(10, 7),
        tenant_id UUID,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);
    console.log("✅ Table sites created or already exists.");

    const [countRows] = await sequelize.query("SELECT COUNT(*) AS n FROM sites");
    const count = parseInt(countRows[0]?.n || "0", 10);
    if (count === 0) {
      await sequelize.query(`
        INSERT INTO sites (id, name, address_1, address_2, latitude, longitude, tenant_id, created_at, updated_at)
        VALUES (gen_random_uuid(), 'Main Office', '123 Main St', NULL, 40.7128, -74.0060, NULL, NOW(), NOW());
      `);
      console.log("✅ Test site 'Main Office' inserted (40.7128, -74.0060).");
    } else {
      console.log("✅ Sites table already has", count, "row(s).");
    }

    await sequelize.close();
    process.exit(0);
  } catch (e) {
    console.error("Error:", e.message);
    process.exit(1);
  }
}

main();
