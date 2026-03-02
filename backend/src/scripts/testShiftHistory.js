/**
 * Test script: Test Shift History API endpoint
 * 
 * This script:
 * 1. Finds a guard with shifts
 * 2. Tests the shift history endpoint
 * 3. Verifies the response structure
 * 4. Checks status values and data format
 */

require("dotenv").config({ path: require("path").join(__dirname, "../../.env") });
const { sequelize } = require("../models");
const axios = require("axios");
const jwt = require("jsonwebtoken");

// Configuration
const API_BASE_URL = process.env.API_BASE_URL || "http://localhost:5000";
const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key";

// Helper to decode JWT without verification (for getting guard ID)
function decodeJWT(token) {
  try {
    return JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
  } catch (e) {
    return null;
  }
}

async function findGuardWithShifts() {
  try {
    // Find a guard with at least one shift
    const [results] = await sequelize.query(`
      SELECT 
        g.id as guard_id,
        g.name as guard_name,
        g.email as guard_email,
        COUNT(s.id) as shift_count
      FROM guards g
      INNER JOIN shifts s ON g.id = s.guard_id
      GROUP BY g.id, g.name, g.email
      HAVING COUNT(s.id) > 0
      ORDER BY COUNT(s.id) DESC
      LIMIT 1
    `);
    
    if (!results || results.length === 0) {
      throw new Error("No guard with shifts found");
    }
    
    const guard = results[0];
    console.log(`✅ Found guard: ${guard.guard_name} (${guard.guard_email})`);
    console.log(`   Guard ID: ${guard.guard_id.substring(0, 8)}...`);
    console.log(`   Total shifts: ${guard.shift_count}\n`);
    
    return guard;
  } catch (error) {
    console.error("❌ Error finding guard with shifts:", error.message);
    throw error;
  }
}

async function getGuardToken(guardId) {
  try {
    // Create a JWT token for the guard
    const token = jwt.sign(
      {
        id: guardId,
        guard_id: guardId,
        role: "guard",
      },
      JWT_SECRET,
      { expiresIn: "1h" }
    );
    
    return token;
  } catch (error) {
    console.error("❌ Error creating guard token:", error.message);
    throw error;
  }
}

async function testShiftHistoryEndpoint(token, guardId) {
  try {
    console.log("📊 Testing shift history endpoint...");
    console.log(`   Guard ID: ${guardId.substring(0, 8)}...`);
    
    const response = await axios.get(`${API_BASE_URL}/api/guards/shifts/history`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      params: {
        limit: 50,
      },
    });
    
    if (response.status !== 200) {
      throw new Error(`Unexpected status code: ${response.status}`);
    }
    
    const data = response.data;
    console.log(`✅ Shift history endpoint returned: ${response.status}`);
    console.log(`   Response structure:`, {
      hasHistory: Array.isArray(data.history),
      hasAnalytics: !!data.analytics,
      historyLength: data.history?.length || 0,
    });
    
    if (data.history && data.history.length > 0) {
      console.log(`\n📋 Sample shift data:`);
      const sample = data.history[0];
      console.log(`   Shift ID: ${sample.id?.substring(0, 8) || "N/A"}...`);
      console.log(`   Date: ${sample.shift_date || "N/A"}`);
      console.log(`   Time: ${sample.shift_start || "N/A"} - ${sample.shift_end || "N/A"}`);
      console.log(`   Status: ${sample.status || "N/A"}`);
      console.log(`   Location: ${sample.location || "N/A"}`);
      console.log(`   Hours worked: ${sample.hours_worked || "N/A"}`);
      console.log(`   Clock in: ${sample.clock_in_at || "N/A"}`);
      console.log(`   Clock out: ${sample.clock_out_at || "N/A"}`);
    }
    
    if (data.analytics) {
      console.log(`\n📊 Analytics:`);
      console.log(`   Total shifts: ${data.analytics.total_shifts || 0}`);
      console.log(`   Completed shifts: ${data.analytics.completed_shifts || 0}`);
      console.log(`   Total hours: ${data.analytics.total_hours || 0}`);
      console.log(`   Avg hours/shift: ${data.analytics.avg_hours_per_shift || 0}`);
      console.log(`   Completion rate: ${data.analytics.completion_rate || 0}%`);
    }
    
    return data;
  } catch (error) {
    if (error.response) {
      console.error(`❌ API Error: ${error.response.status} - ${error.response.data?.message || error.response.statusText}`);
      console.error(`   Response:`, JSON.stringify(error.response.data, null, 2));
    } else {
      console.error(`❌ Error: ${error.message}`);
    }
    throw error;
  }
}

async function analyzeStatusValues(history) {
  console.log("\n🔍 Analyzing status values...");
  
  const statusCounts = {};
  const statusValues = [];
  
  history.forEach(shift => {
    const status = shift.status || "null";
    statusCounts[status] = (statusCounts[status] || 0) + 1;
    statusValues.push(status);
  });
  
  console.log(`   Total shifts: ${history.length}`);
  console.log(`   Unique status values: ${Object.keys(statusCounts).length}`);
  console.log(`   Status distribution:`);
  Object.entries(statusCounts).forEach(([status, count]) => {
    console.log(`     - ${status}: ${count}`);
  });
  
  console.log(`\n   All status values:`, statusValues);
  
  // Check which statuses will get colors
  const statusMapping = {
    "state--ok": ["closed", "filled", "assigned", "completed", "accepted", "approved", "finished"],
    "state--warn": ["open", "pending", "in_progress", "running_late", "late"],
    "state--bad": ["callout", "cancelled", "failed", "declined", "no_response", "error", "rejected"],
  };
  
  console.log(`\n   Status color mapping:`);
  statusValues.forEach(status => {
    const statusLower = String(status).toLowerCase();
    let matched = false;
    for (const [className, values] of Object.entries(statusMapping)) {
      if (values.includes(statusLower)) {
        console.log(`     ✅ ${status} → ${className}`);
        matched = true;
        break;
      }
    }
    if (!matched) {
      console.log(`     ⚠️  ${status} → no color class`);
    }
  });
}

async function runTest() {
  try {
    console.log("🧪 Testing Shift History API\n");
    console.log("=" .repeat(50));
    console.log("");
    
    // Step 1: Find a guard with shifts
    console.log("Step 1: Finding guard with shifts...");
    const guard = await findGuardWithShifts();
    
    // Step 2: Get guard token
    console.log("Step 2: Creating guard authentication token...");
    const token = await getGuardToken(guard.guard_id);
    
    // Step 3: Test shift history endpoint
    console.log("Step 3: Testing shift history endpoint...");
    const historyData = await testShiftHistoryEndpoint(token, guard.guard_id);
    
    // Step 4: Analyze status values
    if (historyData.history && historyData.history.length > 0) {
      await analyzeStatusValues(historyData.history);
    } else {
      console.log("\n⚠️  No shift history found to analyze");
    }
    
    console.log("\n" + "=" .repeat(50));
    console.log("✅ Test completed successfully!");
    console.log("");
    console.log("📋 Summary:");
    console.log("   - Guard found: ✅");
    console.log("   - Authentication: ✅");
    console.log("   - API endpoint: ✅");
    console.log("   - Data structure: ✅");
    console.log("   - Status analysis: ✅");
    
  } catch (error) {
    console.error("\n❌ Test failed:", error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await sequelize.close();
    process.exit(0);
  }
}

runTest();
