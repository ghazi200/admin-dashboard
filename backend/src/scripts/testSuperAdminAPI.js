/**
 * Test Super-Admin API Endpoints
 * 
 * This script tests if the super-admin API endpoints are working correctly
 */

require("dotenv").config();
const jwt = require("jsonwebtoken");
const axios = require("axios");

async function testSuperAdminAPI() {
  try {
    // Create a test super-admin token
    const token = jwt.sign(
      { adminId: 1, role: "super_admin" },
      process.env.JWT_SECRET || "your-secret-key",
      { expiresIn: "7d" }
    );

    const baseURL = "http://localhost:5000/api/super-admin";
    const headers = {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    };

    console.log("🧪 Testing Super-Admin API Endpoints...\n");

    // Test 1: List Tenants
    console.log("1️⃣ Testing GET /tenants...");
    try {
      const tenantsRes = await axios.get(`${baseURL}/tenants`, { headers });
      console.log(`   ✅ Success: Found ${tenantsRes.data?.length || 0} tenants`);
      if (tenantsRes.data?.length > 0) {
        console.log(`   📋 Sample tenant:`, {
          name: tenantsRes.data[0].name,
          location: tenantsRes.data[0].location,
          guards: tenantsRes.data[0].guard_count,
          monthly_amount: tenantsRes.data[0].monthly_amount,
        });
      }
    } catch (e) {
      console.log(`   ❌ Error: ${e.message}`);
      if (e.response) {
        console.log(`   Status: ${e.response.status}`);
        console.log(`   Data:`, e.response.data);
      }
    }

    // Test 2: Get Analytics
    console.log("\n2️⃣ Testing GET /analytics...");
    try {
      const analyticsRes = await axios.get(`${baseURL}/analytics`, { headers });
      console.log(`   ✅ Success:`, analyticsRes.data);
    } catch (e) {
      console.log(`   ❌ Error: ${e.message}`);
      if (e.response) {
        console.log(`   Status: ${e.response.status}`);
        console.log(`   Data:`, e.response.data);
      }
    }

    // Test 3: Get Incidents
    console.log("\n3️⃣ Testing GET /incidents...");
    try {
      const incidentsRes = await axios.get(`${baseURL}/incidents`, { headers });
      console.log(`   ✅ Success:`, {
        total: incidentsRes.data?.total || 0,
        statusBreakdown: incidentsRes.data?.statusBreakdown || [],
      });
    } catch (e) {
      console.log(`   ❌ Error: ${e.message}`);
      if (e.response) {
        console.log(`   Status: ${e.response.status}`);
        console.log(`   Data:`, e.response.data);
      }
    }

    // Test 4: Get Company Rankings
    console.log("\n4️⃣ Testing GET /company-rankings...");
    try {
      const rankingsRes = await axios.get(`${baseURL}/company-rankings?days=30`, { headers });
      console.log(`   ✅ Success: Found ${rankingsRes.data?.length || 0} companies`);
    } catch (e) {
      console.log(`   ❌ Error: ${e.message}`);
      if (e.response) {
        console.log(`   Status: ${e.response.status}`);
        console.log(`   Data:`, e.response.data);
      }
    }

    console.log("\n✅ API Testing Complete!");
    console.log("\n💡 If all tests passed, the API is working correctly.");
    console.log("   Check the browser console for frontend errors.");

  } catch (error) {
    console.error("❌ Test failed:", error.message);
  }
}

testSuperAdminAPI();
