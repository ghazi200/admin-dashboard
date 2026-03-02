/**
 * Find a guard with an assigned shift
 * Useful for testing alerts and other guard features
 */

require("dotenv").config();
const { pool } = require("../config/db");

async function findGuardWithShift() {
  try {
    console.log("🔍 Finding guards with assigned shifts...\n");

    // Find guards with shifts assigned
    const result = await pool.query(
      `SELECT 
        g.id as guard_id,
        g.email,
        g.name,
        g.tenant_id,
        s.id as shift_id,
        s.shift_date,
        s.shift_start,
        s.shift_end,
        s.location,
        s.status
      FROM guards g
      INNER JOIN shifts s ON s.guard_id = g.id
      WHERE s.status = 'CLOSED'
        AND s.shift_date >= CURRENT_DATE
      ORDER BY s.shift_date ASC, s.shift_start ASC
      LIMIT 10`
    );

    const guards = result.rows || [];

    if (guards.length === 0) {
      console.log("❌ No guards found with assigned shifts");
      console.log("\n💡 To create a test guard with shift:");
      console.log("   1. Create a guard in admin dashboard");
      console.log("   2. Create a shift");
      console.log("   3. Assign the shift to the guard");
      return;
    }

    console.log(`✅ Found ${guards.length} guard(s) with assigned shifts:\n`);

    guards.forEach((guard, index) => {
      console.log(`${index + 1}. Guard: ${guard.name || guard.email || 'Unknown'}`);
      console.log(`   Guard ID: ${guard.guard_id}`);
      console.log(`   Email: ${guard.email}`);
      console.log(`   Tenant ID: ${guard.tenant_id || 'None'}`);
      console.log(`   Shift ID: ${guard.shift_id}`);
      console.log(`   Shift Date: ${guard.shift_date}`);
      console.log(`   Shift Time: ${guard.shift_start} - ${guard.shift_end}`);
      console.log(`   Location: ${guard.location || 'Not specified'}`);
      console.log(`   Status: ${guard.status}`);
      console.log("");
    });

    // Show first guard's login info
    const firstGuard = guards[0];
    console.log("📋 To test alerts with this guard:");
    console.log(`   1. Login to guard-ui with email: ${firstGuard.email}`);
    console.log(`   2. Go to Home page - alerts will show for current shift`);
    console.log(`   3. Go to Dashboard page - alerts will show for upcoming shifts`);
    console.log(`\n   Shift Location: ${firstGuard.location || 'Not specified'}`);
    console.log(`   Shift Date: ${firstGuard.shift_date}`);
    console.log(`   Shift Time: ${firstGuard.shift_start} - ${firstGuard.shift_end}`);

    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error("❌ Error:", error.message);
    console.error("Stack:", error.stack);
    process.exit(1);
  }
}

findGuardWithShift();
