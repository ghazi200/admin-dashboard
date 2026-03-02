/**
 * Migration Script: Add location and monthly_amount columns to tenants table
 * 
 * Run this to add the new columns if they don't exist
 */

require("dotenv").config();
const { Sequelize } = require("sequelize");

const isTest = process.env.NODE_ENV === "test";

const sequelize = isTest
  ? new Sequelize({
      dialect: "sqlite",
      storage: "file::memory:",
      logging: false,
    })
  : new Sequelize(
      process.env.DB_NAME,
      process.env.DB_USER,
      process.env.DB_PASS,
      {
        host: process.env.DB_HOST,
        dialect: "postgres",
        logging: console.log,
      }
    );

async function addLocationAndPricingColumns() {
  try {
    await sequelize.authenticate();
    console.log("✅ Connected to database");

    console.log("🔧 Adding location and monthly_amount columns to tenants table...");

    // Add location column if it doesn't exist
    await sequelize.query(`
      ALTER TABLE tenants 
      ADD COLUMN IF NOT EXISTS location VARCHAR(255);
    `);
    console.log("✅ Added location column");

    // Add monthly_amount column if it doesn't exist
    await sequelize.query(`
      ALTER TABLE tenants 
      ADD COLUMN IF NOT EXISTS monthly_amount DECIMAL(10, 2) DEFAULT 0;
    `);
    console.log("✅ Added monthly_amount column");

    console.log("✅ Migration complete!");

  } catch (error) {
    console.error("❌ Error adding columns:", error);
  } finally {
    await sequelize.close();
  }
}

addLocationAndPricingColumns();
