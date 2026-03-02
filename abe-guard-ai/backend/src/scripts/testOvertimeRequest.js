/**
 * Test script for overtime request endpoint
 * Tests the POST /api/guard/overtime/request endpoint
 */

require("dotenv").config();
const axios = require("axios");
const { pool } = require("../config/db");

const BASE_URL = "http://localhost:4000";

async function testOvertimeRequest() {
  try {
    console.log("🧪 Testing Overtime Request Endpoint\n");

    // Step 1: Find a guard with a shift
    console.log("1️⃣ Finding a guard with an assigned shift...");
    const guardResult = await pool.query(
      `SELECT g.id, g.email, g.tenant_id, s.id as shift_id, s.shift_date, s.shift_end
       FROM guards g
       JOIN shifts s ON s.guard_id = g.id
       WHERE s.status = 'ASSIGNED' AND s.shift_date >= CURRENT_DATE
       LIMIT 1`
    );
    const guards = guardResult.rows || guardResult;

    if (guards.length === 0) {
      console.error("❌ No guards with assigned shifts found");
      return;
    }

    const guard = guards[0];
    console.log("✅ Found guard:", {
      id: guard.id,
      email: guard.email,
      shiftId: guard.shift_id,
      shiftDate: guard.shift_date,
      shiftEnd: guard.shift_end,
    });

    // Step 2: Get auth token for the guard
    console.log("\n2️⃣ Getting auth token...");
    const loginResponse = await axios.post(`${BASE_URL}/api/guard/auth/login`, {
      email: guard.email,
      password: "password123", // Default password
    });

    if (!loginResponse.data.token) {
      console.error("❌ Login failed:", loginResponse.data);
      return;
    }

    const token = loginResponse.data.token;
    console.log("✅ Token obtained");

    // Step 3: Test the request endpoint
    console.log("\n3️⃣ Testing POST /api/guard/overtime/request...");

    // Calculate proposed end time
    const shiftDate = new Date(guard.shift_date);
    const shiftEnd = guard.shift_end;
    const [hours, minutes] = String(shiftEnd).split(":");
    const currentEndTime = new Date(shiftDate);
    currentEndTime.setHours(parseInt(hours), parseInt(minutes || 0), 0, 0);

    const proposedEndTime = new Date(currentEndTime);
    proposedEndTime.setHours(proposedEndTime.getHours() + 2); // Add 2 hours

    const requestData = {
      shiftId: guard.shift_id,
      proposedEndTime: proposedEndTime.toISOString(),
      extensionHours: 2,
      reason: "Test overtime request",
    };

    console.log("📝 Request data:", requestData);

    try {
      const response = await axios.post(
        `${BASE_URL}/api/guard/overtime/request`,
        requestData,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        }
      );

      console.log("✅ Request successful!");
      console.log("   Response:", JSON.stringify(response.data, null, 2));
    } catch (error) {
      console.error("❌ Request failed:");
      console.error("   Status:", error.response?.status);
      console.error("   Message:", error.response?.data?.message || error.message);
      console.error("   Error:", error.response?.data?.error || error.response?.data);
      if (error.response?.data) {
        console.error("   Full response:", JSON.stringify(error.response.data, null, 2));
      }
    }

    // Step 4: Verify the request was created
    console.log("\n4️⃣ Verifying request was created in database...");
    const verifyResult = await pool.query(
      `SELECT * FROM overtime_offers 
       WHERE guard_id = $1 AND shift_id = $2 AND status = 'requested'
       ORDER BY created_at DESC LIMIT 1`,
      [guard.id, guard.shift_id]
    );
    const offers = verifyResult.rows || verifyResult;

    if (offers.length > 0) {
      console.log("✅ Request found in database:");
      console.log("   ID:", offers[0].id);
      console.log("   Status:", offers[0].status);
      console.log("   Extension Hours:", offers[0].extension_hours);
      console.log("   Created:", offers[0].created_at);
    } else {
      console.log("⚠️ Request not found in database");
    }
  } catch (error) {
    console.error("❌ Test failed:", error.message);
    console.error(error.stack);
  } finally {
    await pool.end();
  }
}

testOvertimeRequest();
