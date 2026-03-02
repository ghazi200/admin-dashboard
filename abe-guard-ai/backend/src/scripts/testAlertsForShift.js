/**
 * Test alerts API for a specific shift
 */

require("dotenv").config();
const { pool } = require("../config/db");
const axios = require("axios");

async function testAlertsForShift() {
  try {
    // Get a shift ID
    const shiftResult = await pool.query(
      `SELECT id, shift_date, shift_start, shift_end, location, status
       FROM shifts 
       WHERE status = 'OPEN' 
         AND tenant_id = (SELECT tenant_id FROM guards WHERE email = 'john@abesecurity.com' LIMIT 1)
       ORDER BY shift_date 
       LIMIT 1`
    );

    if (shiftResult.rows.length === 0) {
      console.log("❌ No OPEN shifts found");
      return;
    }

    const shift = shiftResult.rows[0];
    console.log("📋 Testing alerts for shift:");
    console.log(`   ID: ${shift.id}`);
    console.log(`   Date: ${shift.shift_date}`);
    console.log(`   Time: ${shift.shift_start} - ${shift.shift_end}`);
    console.log(`   Location: ${shift.location || 'NOT SET'}`);
    console.log("");

    if (!shift.location) {
      console.log("⚠️  WARNING: Shift has no location - alerts won't work!");
      return;
    }

    // Get guard token (we'll need to create one or use existing)
    const guardResult = await pool.query(
      `SELECT id FROM guards WHERE email = 'john@abesecurity.com' LIMIT 1`
    );

    if (guardResult.rows.length === 0) {
      console.log("❌ Guard not found");
      return;
    }

    const guardId = guardResult.rows[0].id;
    console.log(`👤 Guard ID: ${guardId}`);

    // Test the API endpoint
    const apiUrl = `http://localhost:4000/api/guard/alerts/combined/${shift.id}`;
    console.log(`\n🌐 Testing API: ${apiUrl}`);
    console.log("   (Note: This requires a valid JWT token)");
    console.log("   Check browser console for actual API calls");

    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error("❌ Error:", error.message);
    process.exit(1);
  }
}

testAlertsForShift();
