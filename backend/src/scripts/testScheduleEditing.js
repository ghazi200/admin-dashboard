/**
 * Test Schedule Editing Functionality
 * Tests GET and PUT endpoints for schedule editing
 */

require("dotenv").config();
const axios = require("axios");

const BASE_URL = process.env.ADMIN_DASHBOARD_URL || "http://localhost:5000";
const API_BASE = `${BASE_URL}/api/admin`;

// Test admin credentials (adjust if needed)
const TEST_EMAIL = process.env.TEST_ADMIN_EMAIL || "admin@test.com";
const TEST_PASSWORD = process.env.TEST_ADMIN_PASSWORD || "password123";

let authToken = null;

async function login() {
  try {
    console.log("🔐 Logging in as admin...");
    const response = await axios.post(`${API_BASE}/login`, {
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
    });
    
    if (response.data.token) {
      authToken = response.data.token;
      console.log("✅ Login successful");
      return true;
    } else {
      console.error("❌ No token received");
      return false;
    }
  } catch (error) {
    console.error("❌ Login failed:", error.response?.data?.message || error.message);
    return false;
  }
}

async function getSchedule() {
  try {
    console.log("\n📅 Fetching schedule...");
    const response = await axios.get(`${API_BASE}/schedule`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    
    console.log("✅ Schedule fetched successfully");
    console.log(`   Building: ${response.data.building?.name || "N/A"}`);
    console.log(`   Location: ${response.data.building?.location || "N/A"}`);
    console.log(`   Days in schedule: ${response.data.schedule?.length || 0}`);
    
    if (response.data.schedule && response.data.schedule.length > 0) {
      const firstDay = response.data.schedule[0];
      console.log(`   First day: ${firstDay.day} with ${firstDay.shifts?.length || 0} shifts`);
      if (firstDay.shifts && firstDay.shifts.length > 0) {
        const firstShift = firstDay.shifts[0];
        console.log(`   First shift: ${firstShift.time} - ${firstShift.guard || firstShift.scheduledGuard || "Unassigned"}`);
      }
    }
    
    return response.data;
  } catch (error) {
    console.error("❌ Failed to fetch schedule:", error.response?.data?.message || error.message);
    if (error.response?.status === 401) {
      console.error("   Authentication failed. Please check your credentials.");
    }
    return null;
  }
}

async function updateSchedule(originalSchedule) {
  try {
    console.log("\n✏️  Testing schedule update...");
    
    // Create modified schedule template
    const modifiedTemplate = originalSchedule.schedule.map((day, dayIdx) => {
      const modifiedShifts = day.shifts.map((shift, shiftIdx) => {
        // Modify first shift of first day as a test
        if (dayIdx === 0 && shiftIdx === 0) {
          return {
            ...shift,
            start: "08:00", // Changed from original
            end: "16:00",   // Changed from original
            scheduledGuard: shift.scheduledGuard || shift.guard || "Test Guard",
            hours: 8,
          };
        }
        return {
          id: shift.id,
          time: shift.time,
          start: shift.start,
          end: shift.end,
          scheduledGuard: shift.scheduledGuard || shift.guard || "",
          hours: shift.hours || 8,
        };
      });
      
      return {
        day: day.day,
        shifts: modifiedShifts,
      };
    });
    
    const updateData = {
      buildingName: "Test Building - Updated",
      buildingLocation: "123 Test Street, Test City, State 12345",
      scheduleTemplate: modifiedTemplate,
    };
    
    console.log("   Updating building name and first shift times...");
    const response = await axios.put(`${API_BASE}/schedule`, updateData, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    
    console.log("✅ Schedule updated successfully");
    console.log(`   Message: ${response.data.message || "Success"}`);
    
    return true;
  } catch (error) {
    console.error("❌ Failed to update schedule:", error.response?.data?.message || error.message);
    if (error.response?.data) {
      console.error("   Response:", JSON.stringify(error.response.data, null, 2));
    }
    return false;
  }
}

async function verifyUpdate() {
  try {
    console.log("\n🔍 Verifying update...");
    const updatedSchedule = await getSchedule();
    
    if (!updatedSchedule) {
      console.error("❌ Could not fetch updated schedule");
      return false;
    }
    
    // Check building info
    if (updatedSchedule.building?.name === "Test Building - Updated") {
      console.log("✅ Building name updated correctly");
    } else {
      console.log(`⚠️  Building name: ${updatedSchedule.building?.name} (expected: Test Building - Updated)`);
    }
    
    if (updatedSchedule.building?.location?.includes("Test Street")) {
      console.log("✅ Building location updated correctly");
    } else {
      console.log(`⚠️  Building location: ${updatedSchedule.building?.location}`);
    }
    
    // Check first shift
    if (updatedSchedule.schedule && updatedSchedule.schedule.length > 0) {
      const firstDay = updatedSchedule.schedule[0];
      if (firstDay.shifts && firstDay.shifts.length > 0) {
        const firstShift = firstDay.shifts[0];
        console.log(`   First shift times: ${firstShift.start} - ${firstShift.end}`);
        if (firstShift.start === "08:00" && firstShift.end === "16:00") {
          console.log("✅ First shift times updated correctly");
        } else {
          console.log(`⚠️  Expected 08:00-16:00, got ${firstShift.start}-${firstShift.end}`);
        }
      }
    }
    
    return true;
  } catch (error) {
    console.error("❌ Verification failed:", error.message);
    return false;
  }
}

async function runTest() {
  console.log("🧪 Starting Schedule Editing Test\n");
  console.log(`   API Base: ${API_BASE}`);
  console.log(`   Test Email: ${TEST_EMAIL}\n`);
  
  // Step 1: Login
  const loggedIn = await login();
  if (!loggedIn) {
    console.error("\n❌ Test failed: Could not login");
    process.exit(1);
  }
  
  // Step 2: Get original schedule
  const originalSchedule = await getSchedule();
  if (!originalSchedule) {
    console.error("\n❌ Test failed: Could not fetch schedule");
    process.exit(1);
  }
  
  // Step 3: Update schedule
  const updated = await updateSchedule(originalSchedule);
  if (!updated) {
    console.error("\n❌ Test failed: Could not update schedule");
    process.exit(1);
  }
  
  // Step 4: Verify update
  await verifyUpdate();
  
  console.log("\n✅ All tests completed!");
  process.exit(0);
}

// Run the test
runTest().catch((error) => {
  console.error("\n❌ Test error:", error);
  process.exit(1);
});
