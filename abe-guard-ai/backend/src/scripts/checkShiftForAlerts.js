/**
 * Check shift data for alerts
 */

require("dotenv").config();
const { pool } = require("../config/db");

async function checkShiftForAlerts() {
  try {
    // Find guard's shift
    const result = await pool.query(
      `SELECT s.id, s.shift_date, s.shift_start, s.shift_end, s.location, s.guard_id, s.status
       FROM shifts s
       JOIN guards g ON s.guard_id = g.id
       WHERE g.email = $1
         AND s.shift_date >= CURRENT_DATE
       ORDER BY s.shift_date ASC, s.shift_start ASC
       LIMIT 1`,
      ["john@abesecurity.com"]
    );

    if (result.rows.length === 0) {
      console.log("❌ No shifts found for john@abesecurity.com");
      return;
    }

    const shift = result.rows[0];
    console.log("✅ Found shift:");
    console.log(`   Shift ID: ${shift.id}`);
    console.log(`   Date: ${shift.shift_date}`);
    console.log(`   Time: ${shift.shift_start} - ${shift.shift_end}`);
    console.log(`   Location: ${shift.location || 'NOT SET'}`);
    console.log(`   Status: ${shift.status}`);
    console.log(`   Guard ID: ${shift.guard_id}`);

    if (!shift.location) {
      console.log("\n⚠️  WARNING: Shift location is not set!");
      console.log("   Weather and traffic alerts need a location to work.");
      console.log("   Please set the location in the admin dashboard.");
    } else {
      console.log("\n✅ Shift has location - alerts should work!");
      console.log(`   Location: "${shift.location}"`);
    }

    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error("❌ Error:", error.message);
    process.exit(1);
  }
}

checkShiftForAlerts();
