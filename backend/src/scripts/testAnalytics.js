/**
 * Test Analytics Endpoints
 * Tests all analytics endpoints and displays results
 */

require("dotenv").config();
const axios = require("axios");

const API_URL = process.env.ADMIN_API_URL || "http://localhost:5000/api/admin";
const ADMIN_EMAIL = process.env.TEST_ADMIN_EMAIL || "admin@test.com";
const ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD || "password123";

async function testAnalytics() {
  try {
    console.log("🧪 Testing Analytics Endpoints\n");
    console.log("=" .repeat(60));

    // Step 1: Login to get token
    console.log("\n1️⃣ Logging in as admin...");
    const loginResponse = await axios.post(`${API_URL}/login`, {
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
    });

    if (!loginResponse.data.token) {
      console.error("❌ Login failed - no token received");
      return;
    }

    const token = loginResponse.data.token;
    console.log("✅ Login successful");

    // Set up axios instance with auth token
    const api = axios.create({
      baseURL: API_URL,
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    // Step 2: Test KPIs endpoint
    console.log("\n2️⃣ Testing Real-Time KPIs...");
    try {
      const kpisResponse = await api.get("/analytics/kpis");
      const kpis = kpisResponse.data;
      console.log("✅ KPIs retrieved successfully");
      console.log("\n📊 Real-Time KPIs:");
      console.log("   Guards:", {
        total: kpis.guards?.total || 0,
        available: kpis.guards?.available || 0,
        unavailable: kpis.guards?.unavailable || 0,
        availabilityRate: `${kpis.guards?.availabilityRate || 0}%`,
      });
      console.log("   Shifts:", {
        openToday: kpis.shifts?.openToday || 0,
        openTotal: kpis.shifts?.openTotal || 0,
        filledToday: kpis.shifts?.filledToday || 0,
        coverageRate: `${kpis.shifts?.coverageRate || 0}%`,
      });
      console.log("   Callouts:", {
        today: kpis.callouts?.today || 0,
        last7Days: kpis.callouts?.last7Days || 0,
        calloutRate: `${kpis.callouts?.calloutRate || 0}%`,
      });
    } catch (error) {
      console.error("❌ KPIs endpoint failed:", error.response?.data?.message || error.message);
    }

    // Step 3: Test Trends endpoint
    console.log("\n3️⃣ Testing Trend Analysis (30 days)...");
    try {
      const trendsResponse = await api.get("/analytics/trends?days=30");
      const trends = trendsResponse.data;
      console.log("✅ Trends retrieved successfully");
      console.log("\n📈 Trend Summary:");
      console.log("   Labels:", trends.labels?.length || 0, "days");
      console.log("   Data points:", {
        openShifts: trends.data?.openShifts?.length || 0,
        filledShifts: trends.data?.filledShifts?.length || 0,
        callouts: trends.data?.callouts?.length || 0,
        coverageRate: trends.data?.coverageRate?.length || 0,
      });
      if (trends.summary) {
        console.log("   Summary:", {
          avgOpenShifts: trends.summary.avgOpenShifts,
          avgFilledShifts: trends.summary.avgFilledShifts,
          avgCallouts: trends.summary.avgCallouts,
          avgCoverageRate: `${trends.summary.avgCoverageRate}%`,
        });
      }
      console.log("   Sample data (last 5 days):");
      const last5 = trends.labels?.slice(-5) || [];
      last5.forEach((label, idx) => {
        const i = trends.labels.length - 5 + idx;
        console.log(`     ${label}:`, {
          open: trends.data?.openShifts?.[i] || 0,
          filled: trends.data?.filledShifts?.[i] || 0,
          callouts: trends.data?.callouts?.[i] || 0,
          coverage: `${trends.data?.coverageRate?.[i] || 0}%`,
        });
      });
    } catch (error) {
      console.error("❌ Trends endpoint failed:", error.response?.data?.message || error.message);
    }

    // Step 4: Test Performance endpoint
    console.log("\n4️⃣ Testing Performance Metrics (30 days)...");
    try {
      const performanceResponse = await api.get("/analytics/performance?days=30");
      const performance = performanceResponse.data;
      console.log("✅ Performance metrics retrieved successfully");
      console.log("\n🏆 Performance Summary:");
      console.log("   Average Reliability:", `${performance.averageReliability || 0}%`);
      console.log("   Top Performers:", performance.topPerformers?.length || 0);
      if (performance.topPerformers?.length > 0) {
        console.log("   Top 3 Guards:");
        performance.topPerformers.slice(0, 3).forEach((guard, idx) => {
          console.log(`     ${idx + 1}. ${guard.guardName}:`, {
            shifts: guard.shiftsCompleted,
            callouts: guard.callouts,
            reliability: `${guard.reliability}%`,
          });
        });
      }
      console.log("   Bottom Performers:", performance.bottomPerformers?.length || 0);
    } catch (error) {
      console.error("❌ Performance endpoint failed:", error.response?.data?.message || error.message);
    }

    // Step 5: Test Comparative endpoint
    console.log("\n5️⃣ Testing Comparative Analytics...");
    try {
      const comparativeResponse = await api.get("/analytics/comparative");
      const comparative = comparativeResponse.data;
      console.log("✅ Comparative analytics retrieved successfully");
      console.log("\n📊 Comparative Summary:");
      console.log("   Week-over-Week:");
      console.log("     Shifts:", {
        current: comparative.weekOverWeek?.shifts?.current || 0,
        previous: comparative.weekOverWeek?.shifts?.previous || 0,
        change: `${comparative.weekOverWeek?.shifts?.change || 0}%`,
      });
      console.log("     Callouts:", {
        current: comparative.weekOverWeek?.callouts?.current || 0,
        previous: comparative.weekOverWeek?.callouts?.previous || 0,
        change: `${comparative.weekOverWeek?.callouts?.change || 0}%`,
      });
      console.log("   Month-over-Month:");
      console.log("     Shifts:", {
        current: comparative.monthOverMonth?.shifts?.current || 0,
        previous: comparative.monthOverMonth?.shifts?.previous || 0,
        change: `${comparative.monthOverMonth?.shifts?.change || 0}%`,
      });
      console.log("     Callouts:", {
        current: comparative.monthOverMonth?.callouts?.current || 0,
        previous: comparative.monthOverMonth?.callouts?.previous || 0,
        change: `${comparative.monthOverMonth?.callouts?.change || 0}%`,
      });
    } catch (error) {
      console.error("❌ Comparative endpoint failed:", error.response?.data?.message || error.message);
    }

    // Step 6: Test Overview endpoint
    console.log("\n6️⃣ Testing Overview Endpoint (all data)...");
    try {
      const overviewResponse = await api.get("/analytics/overview?days=30");
      const overview = overviewResponse.data;
      console.log("✅ Overview retrieved successfully");
      console.log("\n📋 Overview Summary:");
      console.log("   KPIs:", overview.kpis ? "✅" : "❌");
      console.log("   Trends:", overview.trends ? "✅" : "❌");
      console.log("   Performance:", overview.performance ? "✅" : "❌");
      console.log("   Comparative:", overview.comparative ? "✅" : "❌");
    } catch (error) {
      console.error("❌ Overview endpoint failed:", error.response?.data?.message || error.message);
    }

    console.log("\n" + "=".repeat(60));
    console.log("✅ Analytics test completed!");
    console.log("\n💡 To view the analytics dashboard:");
    console.log("   1. Open http://localhost:3000 (or your frontend port)");
    console.log("   2. Navigate to '📊 Analytics' in the sidebar");
    console.log("   3. The dashboard will display all the metrics and charts\n");

  } catch (error) {
    console.error("\n❌ Test failed:", error.message);
    if (error.response) {
      console.error("   Status:", error.response.status);
      console.error("   Data:", JSON.stringify(error.response.data, null, 2));
    }
    process.exit(1);
  }
}

// Run the test
testAnalytics();
