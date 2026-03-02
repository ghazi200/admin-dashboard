/**
 * Fix overtime_offers table: Make admin_id nullable
 * This allows guard-initiated overtime requests (where admin_id is null)
 */
require("dotenv").config();
const { pool } = require("../config/db");

async function fixOvertimeOffersAdminId() {
  try {
    console.log("🔧 Fixing overtime_offers table: Making admin_id nullable...\n");

    // Check current constraint
    const checkResult = await pool.query(`
      SELECT 
        column_name,
        is_nullable,
        data_type
      FROM information_schema.columns
      WHERE table_name = 'overtime_offers' 
        AND column_name = 'admin_id'
    `);
    const column = (checkResult.rows || checkResult)[0];

    if (!column) {
      console.error("❌ Column admin_id not found in overtime_offers table");
      return;
    }

    console.log("📋 Current admin_id column definition:");
    console.log(`   Nullable: ${column.is_nullable}`);
    console.log(`   Type: ${column.data_type}`);

    if (column.is_nullable === "YES") {
      console.log("✅ admin_id is already nullable. No changes needed.");
      return;
    }

    // Make admin_id nullable
    console.log("\n🔧 Altering table to make admin_id nullable...");
    await pool.query(`
      ALTER TABLE overtime_offers 
      ALTER COLUMN admin_id DROP NOT NULL
    `);

    console.log("✅ admin_id is now nullable");

    // Verify the change
    const verifyResult = await pool.query(`
      SELECT is_nullable
      FROM information_schema.columns
      WHERE table_name = 'overtime_offers' 
        AND column_name = 'admin_id'
    `);
    const verified = (verifyResult.rows || verifyResult)[0];

    if (verified.is_nullable === "YES") {
      console.log("✅ Verification successful: admin_id is now nullable");
      console.log("\n💡 Guard-initiated overtime requests can now be created with admin_id = null");
    } else {
      console.error("❌ Verification failed: admin_id is still NOT NULL");
    }

  } catch (error) {
    console.error("❌ Error fixing overtime_offers table:", error.message);
    console.error(error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

fixOvertimeOffersAdminId();
