/**
 * Find a shift ID for a specific guard to test swap posting
 */

require("dotenv").config({ path: require("path").resolve(__dirname, "../../../.env") });
const { sequelize } = require("../models");

const GUARD_ID = "0e897cf5-9d3b-4cf7-8b11-f8623c248aae"; // Your guard ID from the logs

async function findGuardShift() {
  try {
    console.log("\n🔍 Finding shifts for guard:", GUARD_ID);
    console.log("=" .repeat(50));
    
    // Find shifts assigned to this guard - prefer OPEN status
    const [shifts] = await sequelize.query(`
      SELECT 
        s.id,
        s.shift_date,
        s.shift_start,
        s.shift_end,
        s.location,
        s.status,
        s.guard_id,
        s.created_at,
        CASE WHEN ss.id IS NOT NULL THEN 'Has pending swap' ELSE 'No swap' END as swap_status
      FROM shifts s
      LEFT JOIN shift_swaps ss ON s.id = ss.shift_id AND ss.status = 'pending'
      WHERE s.guard_id = $1
      ORDER BY 
        CASE WHEN s.status = 'OPEN' THEN 1 ELSE 2 END,
        s.shift_date DESC, 
        s.shift_start DESC
      LIMIT 10
    `, { bind: [GUARD_ID] });
    
    if (shifts.length === 0) {
      console.log("❌ No shifts found for this guard");
      console.log("\n💡 Options:");
      console.log("1. Create a test shift in the admin dashboard");
      console.log("2. Use a shift ID from another guard (but swap will fail - you can only swap your own shifts)");
      console.log("3. Check if guard_id is correct");
      return;
    }
    
    console.log(`✅ Found ${shifts.length} shift(s) for this guard:\n`);
    
    shifts.forEach((shift, index) => {
      console.log(`${index + 1}. Shift ID: ${shift.id}`);
      console.log(`   Date: ${shift.shift_date}`);
      console.log(`   Time: ${shift.shift_start} - ${shift.shift_end}`);
      console.log(`   Location: ${shift.location || "N/A"}`);
      console.log(`   Status: ${shift.status || "N/A"}`);
      console.log(`   Swap Status: ${shift.swap_status}`);
      console.log("");
    });
    
    // Recommend the first one
    if (shifts.length > 0) {
      console.log("📋 RECOMMENDED FOR TESTING:");
      console.log(`   Use Shift ID: ${shifts[0].id}`);
      console.log(`   This shift is on ${shifts[0].shift_date} from ${shifts[0].shift_start} to ${shifts[0].shift_end}`);
      console.log("");
    }
    
    await sequelize.close();
  } catch (error) {
    console.error("❌ Error:", error.message);
    process.exit(1);
  }
}

findGuardShift();
