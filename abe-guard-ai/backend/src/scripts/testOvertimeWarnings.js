/**
 * Test Overtime Warnings Feature
 * Tests overtime status calculation and overtime offers
 */
require("dotenv").config();
const { pool } = require("../config/db");
const overtimeStatusService = require("../services/overtimeStatus.service");
const models = require("../models");

async function testOvertimeWarnings() {
  console.log("🧪 Testing Overtime Warnings Feature\n");

  try {
    // 1. Check if overtime_offers table exists
    console.log("1️⃣ Checking database table...");
    const tableResult = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'overtime_offers'
      );
    `);

    const tableCheck = tableResult.rows || tableResult;
    if (tableCheck[0]?.exists) {
      console.log("✅ overtime_offers table exists\n");
    } else {
      console.log("❌ overtime_offers table does not exist");
      console.log("💡 Run: node src/scripts/createOvertimeOffersTable.js\n");
      return;
    }

    // 2. Find a guard with an active shift
    console.log("2️⃣ Finding guard with active shift...");
    const activeShiftsResult = await pool.query(`
      SELECT 
        te.guard_id,
        te.shift_id,
        te.clock_in_at,
        te.clock_out_at,
        s.shift_date,
        s.shift_start,
        s.shift_end,
        g.name as guard_name,
        g.email as guard_email
      FROM time_entries te
      LEFT JOIN shifts s ON te.shift_id = s.id
      LEFT JOIN guards g ON te.guard_id = g.id
      WHERE te.clock_in_at IS NOT NULL
        AND te.clock_out_at IS NULL
      LIMIT 1
    `);

    const activeShifts = activeShiftsResult.rows || activeShiftsResult;
    if (activeShifts.length === 0) {
      console.log("⚠️  No active shifts found");
      console.log("💡 Clock in a guard first to test overtime status\n");
    } else {
      const shift = activeShifts[0];
      console.log(`✅ Found active shift:`);
      console.log(`   Guard: ${shift.guard_name} (${shift.guard_email})`);
      console.log(`   Shift ID: ${shift.shift_id}`);
      console.log(`   Clocked in: ${shift.clock_in_at}\n`);

      // 3. Test overtime status calculation
      console.log("3️⃣ Testing overtime status calculation...");
      try {
        const status = await overtimeStatusService.getOvertimeStatus(
          models,
          shift.guard_id,
          shift.shift_id
        );

        console.log("✅ Overtime status calculated:");
        console.log(`   Current Hours Today: ${status.currentHours}h`);
        console.log(`   Weekly Hours: ${status.weeklyHours}h`);
        console.log(`   Projected Daily: ${status.projectedDaily}h`);
        console.log(`   Status: ${status.status}`);
        console.log(`   Alerts: ${status.alerts.length}`);
        if (status.alerts.length > 0) {
          status.alerts.forEach((alert, idx) => {
            console.log(`     ${idx + 1}. [${alert.type}] ${alert.message}`);
          });
        }
        console.log("");
      } catch (err) {
        console.error("❌ Error calculating overtime status:", err.message);
        console.log("");
      }
    }

    // 4. Test overtime offers table structure
    console.log("4️⃣ Testing overtime offers table structure...");
    const columnsResult = await pool.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'overtime_offers'
      ORDER BY ordinal_position
    `);

    const columns = columnsResult.rows || columnsResult;
    console.log("✅ Table columns:");
    columns.forEach((col) => {
      console.log(`   - ${col.column_name} (${col.data_type}, nullable: ${col.is_nullable})`);
    });
    console.log("");

    // 5. Check for existing offers
    console.log("5️⃣ Checking for existing overtime offers...");
    const offersResult = await pool.query(`
      SELECT 
        oo.id,
        oo.status,
        oo.extension_hours,
        oo.created_at,
        g.name as guard_name,
        s.shift_date
      FROM overtime_offers oo
      LEFT JOIN guards g ON oo.guard_id = g.id
      LEFT JOIN shifts s ON oo.shift_id = s.id
      ORDER BY oo.created_at DESC
      LIMIT 5
    `);

    const offers = offersResult.rows || offersResult;
    if (offers.length === 0) {
      console.log("ℹ️  No overtime offers found (this is normal)");
      console.log("💡 Create an offer via admin API to test offer functionality\n");
    } else {
      console.log(`✅ Found ${offers.length} overtime offer(s):`);
      offers.forEach((offer, idx) => {
        console.log(`   ${idx + 1}. ${offer.guard_name} - ${offer.extension_hours}h - Status: ${offer.status}`);
      });
      console.log("");
    }

    // 6. Test API endpoints (if server is running)
    console.log("6️⃣ API Endpoint Summary:");
    console.log("   Guard Endpoints:");
    console.log("   - GET  /api/guard/overtime/status/:shiftId");
    console.log("   - GET  /api/guard/overtime/offers");
    console.log("   - POST /api/guard/overtime/offers/:offerId/accept");
    console.log("   - POST /api/guard/overtime/offers/:offerId/decline");
    console.log("");
    console.log("   Admin Endpoints:");
    console.log("   - POST /api/admin/overtime/offer");
    console.log("   - GET  /api/admin/overtime/offers");
    console.log("   - POST /api/admin/overtime/offers/:offerId/cancel");
    console.log("");

    console.log("✅ Overtime Warnings Feature Test Complete!");
    console.log("\n💡 Next Steps:");
    console.log("   1. Start the backend servers");
    console.log("   2. Clock in a guard to see overtime status");
    console.log("   3. Create an overtime offer via admin API");
    console.log("   4. Test accept/decline functionality");

  } catch (error) {
    console.error("❌ Test failed:", error);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run test
testOvertimeWarnings();
