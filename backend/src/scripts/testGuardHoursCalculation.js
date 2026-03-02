/**
 * Test Guard Hours Calculation
 * Tests that guard hours are correctly calculated from schedule template
 */

require("dotenv").config();
const axios = require("axios");

const BASE_URL = process.env.ADMIN_DASHBOARD_URL || "http://localhost:5000";
const API_BASE = `${BASE_URL}/api/admin`;

const TEST_EMAIL = process.env.TEST_ADMIN_EMAIL || "admin@test.com";
const TEST_PASSWORD = process.env.TEST_ADMIN_PASSWORD || "password123";

let authToken = null;

async function login() {
  try {
    const response = await axios.post(`${API_BASE}/login`, {
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
    });
    
    if (response.data.token) {
      authToken = response.data.token;
      return true;
    }
    return false;
  } catch (error) {
    console.error("❌ Login failed:", error.response?.data?.message || error.message);
    return false;
  }
}

async function getSchedule() {
  try {
    const response = await axios.get(`${API_BASE}/schedule`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    return response.data;
  } catch (error) {
    console.error("❌ Failed to fetch schedule:", error.message);
    return null;
  }
}

function calculateGuardHours(scheduleTemplate) {
  const hoursMap = {};
  
  scheduleTemplate.forEach((day) => {
    day.shifts?.forEach((shift) => {
      const guardName = shift.scheduledGuard || "";
      if (guardName) {
        if (!hoursMap[guardName]) {
          hoursMap[guardName] = 0;
        }
        hoursMap[guardName] += shift.hours || 0;
      }
    });
  });

  return hoursMap;
}

async function testGuardHoursCalculation() {
  console.log("🧪 Testing Guard Hours Calculation\n");
  
  // Login
  const loggedIn = await login();
  if (!loggedIn) {
    console.error("❌ Test failed: Could not login");
    process.exit(1);
  }
  
  // Get schedule
  const schedule = await getSchedule();
  if (!schedule) {
    console.error("❌ Test failed: Could not fetch schedule");
    process.exit(1);
  }
  
  console.log("📊 Original Guard Hours from API:");
  const originalHours = schedule.guardHours || {};
  Object.entries(originalHours).forEach(([guard, hours]) => {
    console.log(`   ${guard}: ${hours} hours`);
  });
  
  // Reconstruct schedule template from schedule data
  const scheduleTemplate = schedule.schedule.map((day) => ({
    day: day.day,
    shifts: day.shifts.map((shift) => ({
      id: shift.id,
      time: shift.time,
      start: shift.start,
      end: shift.end,
      scheduledGuard: shift.scheduledGuard || shift.guard || "",
      hours: shift.hours || 8,
    })),
  }));
  
  // Calculate hours from template
  console.log("\n🔢 Calculating hours from schedule template...");
  const calculatedHours = calculateGuardHours(scheduleTemplate);
  
  console.log("\n📊 Calculated Guard Hours:");
  Object.entries(calculatedHours).forEach(([guard, hours]) => {
    console.log(`   ${guard}: ${hours} hours`);
  });
  
  // Compare results
  console.log("\n🔍 Comparing results...");
  let allMatch = true;
  const allGuards = new Set([...Object.keys(originalHours), ...Object.keys(calculatedHours)]);
  
  for (const guard of allGuards) {
    const original = originalHours[guard] || 0;
    const calculated = calculatedHours[guard] || 0;
    
    if (Math.abs(original - calculated) > 0.1) {
      console.log(`   ⚠️  ${guard}: Original=${original}, Calculated=${calculated} (MISMATCH)`);
      allMatch = false;
    } else {
      console.log(`   ✅ ${guard}: ${calculated} hours (matches)`);
    }
  }
  
  // Test with modified schedule
  console.log("\n🧪 Testing with modified schedule...");
  const modifiedTemplate = JSON.parse(JSON.stringify(scheduleTemplate));
  
  // Modify first shift: change guard and hours
  if (modifiedTemplate[0] && modifiedTemplate[0].shifts && modifiedTemplate[0].shifts.length > 0) {
    const firstShift = modifiedTemplate[0].shifts[0];
    const originalGuard = firstShift.scheduledGuard;
    firstShift.scheduledGuard = "Test Guard";
    firstShift.hours = 10;
    
    console.log(`   Modified: ${modifiedTemplate[0].day} - Changed guard from "${originalGuard}" to "Test Guard"`);
    console.log(`   Modified: Changed hours from ${scheduleTemplate[0].shifts[0].hours} to 10`);
    
    const modifiedHours = calculateGuardHours(modifiedTemplate);
    
    console.log("\n📊 Modified Guard Hours:");
    Object.entries(modifiedHours).forEach(([guard, hours]) => {
      const original = calculatedHours[guard] || 0;
      const change = hours - original;
      const changeStr = change > 0 ? `+${change}` : change.toString();
      console.log(`   ${guard}: ${hours} hours (${changeStr !== "0" ? changeStr : "no change"})`);
    });
    
    // Verify Test Guard appears
    if (modifiedHours["Test Guard"] === 10) {
      console.log("   ✅ Test Guard hours calculated correctly");
    } else {
      console.log(`   ❌ Test Guard hours incorrect: expected 10, got ${modifiedHours["Test Guard"] || 0}`);
      allMatch = false;
    }
    
    // Verify original guard hours decreased
    if (originalGuard && modifiedHours[originalGuard] !== undefined) {
      const originalTotal = calculatedHours[originalGuard] || 0;
      const newTotal = modifiedHours[originalGuard] || 0;
      if (newTotal < originalTotal) {
        console.log(`   ✅ ${originalGuard} hours decreased correctly (${originalTotal} → ${newTotal})`);
      }
    }
  }
  
  if (allMatch) {
    console.log("\n✅ All guard hours calculations are correct!");
  } else {
    console.log("\n⚠️  Some calculations don't match. Please review.");
  }
  
  process.exit(allMatch ? 0 : 1);
}

testGuardHoursCalculation().catch((error) => {
  console.error("\n❌ Test error:", error);
  process.exit(1);
});
