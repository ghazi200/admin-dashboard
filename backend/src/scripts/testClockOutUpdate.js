// Test script to verify clock out updates are working
const { sequelize } = require("../config/db");
const axios = require("axios");

const ADMIN_DASHBOARD_URL = process.env.ADMIN_DASHBOARD_URL || "http://localhost:5000";
const BOB_EMAIL = "bob@abe.com";

async function testClockOutUpdate() {
  console.log("🧪 Testing Clock Out Update Flow\n");
  console.log("=" .repeat(60));

  try {
    // Step 1: Check Bob's current clock status in database
    console.log("\n📊 Step 1: Checking Bob's current status in database...");
    const [dbRows] = await sequelize.query(`
      SELECT 
        te.id,
        te.shift_id,
        te.guard_id,
        te.clock_in_at,
        te.clock_out_at,
        g.name as guard_name,
        g.email as guard_email
      FROM time_entries te
      LEFT JOIN guards g ON te.guard_id = g.id
      WHERE g.email = $1
      ORDER BY te.clock_in_at DESC
      LIMIT 1
    `, { bind: [BOB_EMAIL] });

    if (dbRows.length === 0) {
      console.error("❌ No time entry found for Bob");
      process.exit(1);
    }

    const dbEntry = dbRows[0];
    const clockIn = new Date(dbEntry.clock_in_at);
    const clockOut = dbEntry.clock_out_at ? new Date(dbEntry.clock_out_at) : null;
    const isClockedOut = clockOut && clockIn && clockOut.getTime() >= clockIn.getTime();

    console.log(`   Guard: ${dbEntry.guard_name} (${dbEntry.guard_email})`);
    console.log(`   Clock in: ${clockIn.toISOString()}`);
    console.log(`   Clock out: ${clockOut ? clockOut.toISOString() : "NOT CLOCKED OUT"}`);
    console.log(`   Status: ${isClockedOut ? "CLOCKED_OUT ✅" : "CLOCKED_IN"}`);
    console.log(`   Time Entry ID: ${dbEntry.id}`);

    // Step 2: Test the API endpoint query (simulating what the dashboard does)
    console.log("\n📊 Step 2: Testing API endpoint query...");
    const [apiRows] = await sequelize.query(`
      SELECT 
        te.id,
        te.shift_id,
        te.guard_id,
        te.clock_in_at,
        te.clock_out_at,
        te.lunch_start_at,
        te.lunch_end_at,
        s.shift_date,
        s.shift_start,
        s.shift_end,
        s.location,
        g.name as guard_name,
        g.email as guard_email
      FROM time_entries te
      LEFT JOIN shifts s ON te.shift_id = s.id
      LEFT JOIN guards g ON te.guard_id = g.id
      WHERE te.clock_in_at IS NOT NULL
      ORDER BY 
        CASE 
          WHEN te.clock_out_at IS NULL OR te.clock_in_at > te.clock_out_at THEN 0
          ELSE 1
        END,
        te.clock_in_at DESC
      LIMIT 100
    `);

    // Transform like the API does
    const clockStatus = apiRows.map((row) => {
      const clockIn = new Date(row.clock_in_at);
      const clockOut = row.clock_out_at ? new Date(row.clock_out_at) : null;
      const isCurrentlyClockedOut = clockOut && clockIn && clockOut.getTime() >= clockIn.getTime();
      const isOnBreak = Boolean(row.lunch_start_at && !row.lunch_end_at);
      const isCurrentlyClockedIn = !isCurrentlyClockedOut;

      return {
        id: row.id,
        shiftId: row.shift_id,
        guardId: row.guard_id,
        guardName: row.guard_name || `Guard ${String(row.guard_id).substring(0, 8)}`,
        guardEmail: row.guard_email,
        status: isCurrentlyClockedOut
          ? "CLOCKED_OUT"
          : isOnBreak
          ? "ON_BREAK"
          : isCurrentlyClockedIn
          ? "CLOCKED_IN"
          : "UNKNOWN",
        clockInAt: row.clock_in_at,
        clockOutAt: row.clock_out_at,
      };
    });

    const clockedIn = clockStatus.filter((s) => s.status === "CLOCKED_IN");
    const onBreak = clockStatus.filter((s) => s.status === "ON_BREAK");
    const clockedOut = clockStatus.filter((s) => s.status === "CLOCKED_OUT");

    console.log(`   Total entries: ${clockStatus.length}`);
    console.log(`   Clocked In: ${clockedIn.length}`);
    console.log(`   On Break: ${onBreak.length}`);
    console.log(`   Clocked Out: ${clockedOut.length}`);

    // Check if Bob is in the clocked out list
    const bobInClockedOut = clockedOut.find(g => g.guardEmail === BOB_EMAIL);
    const bobInClockedIn = clockedIn.find(g => g.guardEmail === BOB_EMAIL);

    console.log(`\n   Bob's status in API response:`);
    if (bobInClockedOut) {
      console.log(`   ✅ Bob is in CLOCKED_OUT list`);
      console.log(`      Entry ID: ${bobInClockedOut.id}`);
      console.log(`      Clock in: ${bobInClockedOut.clockInAt}`);
      console.log(`      Clock out: ${bobInClockedOut.clockOutAt}`);
    } else if (bobInClockedIn) {
      console.log(`   ❌ Bob is in CLOCKED_IN list (should be CLOCKED_OUT)`);
      console.log(`      Entry ID: ${bobInClockedIn.id}`);
      console.log(`      Clock in: ${bobInClockedIn.clockInAt}`);
      console.log(`      Clock out: ${bobInClockedIn.clockOutAt || "null"}`);
    } else {
      console.log(`   ⚠️  Bob not found in any status list`);
    }

    // Step 3: Test the actual API endpoint (if we can get a token)
    console.log("\n📊 Step 3: Testing actual API endpoint...");
    try {
      // Try to call the API endpoint (might fail without auth, but we'll see the structure)
      const response = await axios.get(`${ADMIN_DASHBOARD_URL}/api/admin/dashboard/clock-status`, {
        timeout: 5000,
        validateStatus: () => true, // Don't throw on any status
      });

      if (response.status === 200) {
        const data = response.data;
        console.log(`   ✅ API returned 200 OK`);
        console.log(`   Clocked In: ${data.clockedIn?.length || 0}`);
        console.log(`   On Break: ${data.onBreak?.length || 0}`);
        console.log(`   Clocked Out: ${data.clockedOut?.length || 0}`);
        
        const apiBobClockedOut = data.clockedOut?.find(g => g.guardEmail === BOB_EMAIL);
        const apiBobClockedIn = data.clockedIn?.find(g => g.guardEmail === BOB_EMAIL);
        
        if (apiBobClockedOut) {
          console.log(`   ✅ Bob found in API clockedOut array`);
        } else if (apiBobClockedIn) {
          console.log(`   ❌ Bob found in API clockedIn array (should be clockedOut)`);
        } else {
          console.log(`   ⚠️  Bob not found in API response`);
        }
      } else if (response.status === 401) {
        console.log(`   ⚠️  API requires authentication (401)`);
        console.log(`   This is expected - the endpoint exists but needs a token`);
      } else {
        console.log(`   ⚠️  API returned status: ${response.status}`);
        console.log(`   Response: ${JSON.stringify(response.data).substring(0, 200)}`);
      }
    } catch (apiError) {
      console.log(`   ⚠️  Could not test API endpoint: ${apiError.message}`);
      console.log(`   This is OK - we verified the query logic works`);
    }

    // Step 4: Summary and recommendations
    console.log("\n" + "=".repeat(60));
    console.log("📋 TEST SUMMARY:");
    console.log("=".repeat(60));
    
    if (bobInClockedOut) {
      console.log("✅ Database query correctly identifies Bob as CLOCKED_OUT");
      console.log("✅ API query logic correctly categorizes Bob as CLOCKED_OUT");
      console.log("\n💡 If dashboard is not updating:");
      console.log("   1. Check browser console for socket events");
      console.log("   2. Verify socket connection is active");
      console.log("   3. Check if 'guard_clocked_out' event is being emitted from abe-guard-ai");
      console.log("   4. The 10-second polling should catch the update even without socket events");
    } else if (bobInClockedIn) {
      console.log("❌ PROBLEM FOUND: Bob is being categorized as CLOCKED_IN");
      console.log("   This means the status calculation logic has an issue");
      console.log("\n🔍 Debugging info:");
      console.log(`   Clock in timestamp: ${clockIn.getTime()}`);
      console.log(`   Clock out timestamp: ${clockOut ? clockOut.getTime() : "null"}`);
      console.log(`   Comparison: clockOut >= clockIn = ${clockOut && clockIn ? clockOut.getTime() >= clockIn.getTime() : "N/A"}`);
    } else {
      console.log("⚠️  Bob not found in query results");
      console.log("   This might mean the query is filtering him out incorrectly");
    }

    await sequelize.close();
    process.exit(0);
  } catch (error) {
    console.error("\n❌ Test failed:", error.message);
    console.error("Stack:", error.stack);
    await sequelize.close();
    process.exit(1);
  }
}

testClockOutUpdate();
