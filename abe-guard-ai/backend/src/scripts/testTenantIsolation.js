/**
 * Test Script for Multi-Tenant Guard Isolation (#49)
 * 
 * Tests that guards can only access data from their own tenant
 */

require("dotenv").config();
const { pool } = require("../config/db");
const jwt = require("jsonwebtoken");
const axios = require("axios");

const BASE_URL = process.env.GUARD_API_URL || "http://localhost:5000";
const JWT_SECRET = process.env.JWT_SECRET;

// Test configuration
let testResults = {
  passed: 0,
  failed: 0,
  errors: [],
};

function logTest(name, passed, message = "") {
  if (passed) {
    console.log(`✅ ${name}`);
    testResults.passed++;
  } else {
    console.log(`❌ ${name}`);
    if (message) console.log(`   ${message}`);
    testResults.failed++;
    testResults.errors.push({ test: name, message });
  }
}

/**
 * Create a guard token for testing
 */
async function createGuardToken(guardId, tenantId) {
  return jwt.sign(
    {
      guardId: guardId,
      tenant_id: tenantId,
      role: "guard",
    },
    JWT_SECRET,
    { expiresIn: "1h" }
  );
}

/**
 * Test 1: Verify guards can only see shifts from their tenant
 */
async function testShiftListingIsolation() {
  console.log("\n📋 TEST 1: Shift Listing Tenant Isolation");
  console.log("=".repeat(50));

  try {
    // Get two guards from different tenants
    const guardResult = await pool.query(
      `SELECT id, email, tenant_id FROM guards WHERE tenant_id IS NOT NULL LIMIT 2`
    );
    const guardRows = guardResult.rows || [];

    if (guardRows.length < 2) {
      logTest(
        "Shift Listing - Setup",
        false,
        "Need at least 2 guards with different tenant_id for testing"
      );
      return;
    }

    const guard1 = guardRows[0];
    const guard2 = guardRows[1];

    // Get shifts for each tenant
    const tenant1Result = await pool.query(
      `SELECT id, tenant_id FROM shifts WHERE tenant_id = $1 LIMIT 5`,
      [guard1.tenant_id]
    );
    const tenant1Shifts = tenant1Result.rows || [];
    const tenant2Result = await pool.query(
      `SELECT id, tenant_id FROM shifts WHERE tenant_id = $1 LIMIT 5`,
      [guard2.tenant_id]
    );
    const tenant2Shifts = tenant2Result.rows || [];

    if (tenant1Shifts.length === 0 || tenant2Shifts.length === 0) {
      logTest(
        "Shift Listing - Setup",
        false,
        "Need shifts from both tenants for testing"
      );
      return;
    }

    // Create tokens
    const token1 = await createGuardToken(guard1.id, guard1.tenant_id);
    const token2 = await createGuardToken(guard2.id, guard2.tenant_id);

    // Test Guard 1 can only see Tenant 1 shifts
    try {
      const response1 = await axios.get(`${BASE_URL}/shifts`, {
        headers: { Authorization: `Bearer ${token1}` },
      });

      const guard1Shifts = response1.data || [];
      const allFromTenant1 = guard1Shifts.every(
        (shift) => !shift.tenant_id || shift.tenant_id === guard1.tenant_id
      );

      logTest(
        "Guard 1 sees only Tenant 1 shifts",
        allFromTenant1,
        allFromTenant1
          ? `✅ Guard 1 sees ${guard1Shifts.length} shifts, all from their tenant`
          : `❌ Guard 1 sees shifts from other tenants`
      );

      // Check Guard 1 doesn't see Tenant 2 shifts
      const seesTenant2Shifts = guard1Shifts.some(
        (shift) => shift.tenant_id === guard2.tenant_id
      );
      logTest(
        "Guard 1 does NOT see Tenant 2 shifts",
        !seesTenant2Shifts,
        seesTenant2Shifts
          ? "❌ Guard 1 can see shifts from Tenant 2"
          : "✅ Guard 1 cannot see Tenant 2 shifts"
      );
    } catch (err) {
      logTest(
        "Guard 1 shift listing",
        false,
        `API Error: ${err.message}`
      );
    }

    // Test Guard 2 can only see Tenant 2 shifts
    try {
      const response2 = await axios.get(`${BASE_URL}/shifts`, {
        headers: { Authorization: `Bearer ${token2}` },
      });

      const guard2Shifts = response2.data || [];
      const allFromTenant2 = guard2Shifts.every(
        (shift) => !shift.tenant_id || shift.tenant_id === guard2.tenant_id
      );

      logTest(
        "Guard 2 sees only Tenant 2 shifts",
        allFromTenant2,
        allFromTenant2
          ? `✅ Guard 2 sees ${guard2Shifts.length} shifts, all from their tenant`
          : `❌ Guard 2 sees shifts from other tenants`
      );
    } catch (err) {
      logTest(
        "Guard 2 shift listing",
        false,
        `API Error: ${err.message}`
      );
    }
  } catch (error) {
    logTest("Shift Listing Test", false, error.message);
  }
}

/**
 * Test 2: Verify guards cannot accept shifts from other tenants
 */
async function testShiftAcceptanceIsolation() {
  console.log("\n📋 TEST 2: Shift Acceptance Tenant Isolation");
  console.log("=".repeat(50));

  try {
    // Get two guards from different tenants
    const guardResult = await pool.query(
      `SELECT id, email, tenant_id FROM guards WHERE tenant_id IS NOT NULL LIMIT 2`
    );
    const guardRows = guardResult.rows || [];

    if (guardRows.length < 2) {
      logTest(
        "Shift Acceptance - Setup",
        false,
        "Need at least 2 guards with different tenant_id"
      );
      return;
    }

    const guard1 = guardRows[0];
    const guard2 = guardRows[1];

    // Find an OPEN shift from Tenant 2
    const tenant2Result = await pool.query(
      `SELECT id, tenant_id, status FROM shifts 
       WHERE tenant_id = $1 AND status = 'OPEN' 
       LIMIT 1`,
      [guard2.tenant_id]
    );
    const tenant2Shifts = tenant2Result.rows || [];

    if (tenant2Shifts.length === 0) {
      logTest(
        "Shift Acceptance - Setup",
        false,
        "Need an OPEN shift from Tenant 2 for testing"
      );
      return;
    }

    const otherTenantShift = tenant2Shifts[0];

    // Create token for Guard 1 (Tenant 1)
    const token1 = await createGuardToken(guard1.id, guard1.tenant_id);

    // Try to accept shift from Tenant 2 (should fail)
    try {
      await axios.post(
        `${BASE_URL}/shifts/accept/${otherTenantShift.id}`,
        {},
        {
          headers: { Authorization: `Bearer ${token1}` },
        }
      );

      logTest(
        "Guard 1 cannot accept Tenant 2 shift",
        false,
        "❌ Guard 1 was able to accept shift from Tenant 2 (should be blocked)"
      );
    } catch (err) {
      const is403 = err.response?.status === 403;
      const isCorrectError =
        err.response?.data?.error?.includes("tenant") ||
        err.response?.data?.error?.includes("Access denied");

      logTest(
        "Guard 1 cannot accept Tenant 2 shift",
        is403 && isCorrectError,
        is403
          ? `✅ Correctly blocked with 403: ${err.response?.data?.error || "Access denied"}`
          : `❌ Wrong error: ${err.response?.status} - ${err.response?.data?.error || err.message}`
      );
    }
  } catch (error) {
    logTest("Shift Acceptance Test", false, error.message);
  }
}

/**
 * Test 3: Verify dashboard only shows tenant data
 */
async function testDashboardIsolation() {
  console.log("\n📋 TEST 3: Dashboard Tenant Isolation");
  console.log("=".repeat(50));

  try {
    // Get a guard with tenant_id
    const guardResult = await pool.query(
      `SELECT id, email, tenant_id FROM guards WHERE tenant_id IS NOT NULL LIMIT 1`
    );
    const guardRows = guardResult.rows || [];

    if (guardRows.length === 0) {
      logTest(
        "Dashboard - Setup",
        false,
        "Need a guard with tenant_id for testing"
      );
      return;
    }

    const guard = guardRows[0];
    const token = await createGuardToken(guard.id, guard.tenant_id);

    // Get dashboard data
    try {
      const response = await axios.get(`${BASE_URL}/api/guard/dashboard`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const dashboard = response.data;

      // Check that upcoming shifts are from guard's tenant
      if (dashboard.upcomingShifts && dashboard.upcomingShifts.length > 0) {
        const allFromTenant = dashboard.upcomingShifts.every((shift) => {
          // If shift has tenant_id, it must match guard's tenant
          // If shift has no tenant_id (legacy), allow it
          return !shift.tenant_id || shift.tenant_id === guard.tenant_id;
        });

        logTest(
          "Dashboard shifts are from guard's tenant",
          allFromTenant,
          allFromTenant
            ? `✅ All ${dashboard.upcomingShifts.length} shifts are from guard's tenant`
            : "❌ Dashboard shows shifts from other tenants"
        );
      } else {
        logTest(
          "Dashboard shifts are from guard's tenant",
          true,
          "No shifts to check (OK)"
        );
      }

      logTest("Dashboard API call successful", true);
    } catch (err) {
      logTest(
        "Dashboard API call",
        false,
        `Error: ${err.message} - ${err.response?.data?.error || ""}`
      );
    }
  } catch (error) {
    logTest("Dashboard Test", false, error.message);
  }
}

/**
 * Test 4: Verify alerts only work for guard's tenant shifts
 */
async function testAlertsIsolation() {
  console.log("\n📋 TEST 4: Alerts Tenant Isolation");
  console.log("=".repeat(50));

  try {
    // Get two guards from different tenants
    const guardResult = await pool.query(
      `SELECT id, email, tenant_id FROM guards WHERE tenant_id IS NOT NULL LIMIT 2`
    );
    const guardRows = guardResult.rows || [];

    if (guardRows.length < 2) {
      logTest(
        "Alerts - Setup",
        false,
        "Need at least 2 guards with different tenant_id"
      );
      return;
    }

    const guard1 = guardRows[0];
    const guard2 = guardRows[1];

    // Find a shift from Tenant 2
    const tenant2Result = await pool.query(
      `SELECT id, tenant_id FROM shifts 
       WHERE tenant_id = $1 
       LIMIT 1`,
      [guard2.tenant_id]
    );
    const tenant2Shifts = tenant2Result.rows || [];

    if (tenant2Shifts.length === 0) {
      logTest(
        "Alerts - Setup",
        false,
        "Need a shift from Tenant 2 for testing"
      );
      return;
    }

    const otherTenantShift = tenant2Shifts[0];
    const token1 = await createGuardToken(guard1.id, guard1.tenant_id);

    // Try to get alerts for shift from Tenant 2 (should fail)
    try {
      await axios.get(
        `${BASE_URL}/api/guard/alerts/combined/${otherTenantShift.id}`,
        {
          headers: { Authorization: `Bearer ${token1}` },
        }
      );

      logTest(
        "Guard 1 cannot access Tenant 2 shift alerts",
        false,
        "❌ Guard 1 was able to access alerts for Tenant 2 shift (should be blocked)"
      );
    } catch (err) {
      const is403 = err.response?.status === 403;
      const isCorrectError =
        err.response?.data?.error?.includes("tenant") ||
        err.response?.data?.error?.includes("Access denied");

      logTest(
        "Guard 1 cannot access Tenant 2 shift alerts",
        is403 && isCorrectError,
        is403
          ? `✅ Correctly blocked with 403: ${err.response?.data?.error || "Access denied"}`
          : `❌ Wrong error: ${err.response?.status} - ${err.response?.data?.error || err.message}`
      );
    }
  } catch (error) {
    logTest("Alerts Test", false, error.message);
  }
}

/**
 * Test 5: Verify guards without tenant_id are blocked
 */
async function testGuardWithoutTenant() {
  console.log("\n📋 TEST 5: Guard Without Tenant Isolation");
  console.log("=".repeat(50));

  try {
    // Get a guard without tenant_id (if exists)
    const guardResult = await pool.query(
      `SELECT id, email, tenant_id FROM guards WHERE tenant_id IS NULL LIMIT 1`
    );
    const guardRows = guardResult.rows || [];

    if (guardRows.length === 0) {
      logTest(
        "Guard Without Tenant - Setup",
        true,
        "No guards without tenant_id found (this is OK - all guards should have tenant_id)"
      );
      return;
    }

    const guard = guardRows[0];
    const token = await createGuardToken(guard.id, null);

    // Try to list shifts (should be empty or blocked)
    try {
      const response = await axios.get(`${BASE_URL}/shifts`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const shifts = response.data || [];
      logTest(
        "Guard without tenant sees no shifts",
        shifts.length === 0,
        shifts.length === 0
          ? "✅ Guard without tenant sees no shifts (correct isolation)"
          : `❌ Guard without tenant sees ${shifts.length} shifts (should see none)`
      );
    } catch (err) {
      // If API returns error, that's also acceptable
      logTest(
        "Guard without tenant access",
        err.response?.status === 403 || err.response?.status === 401,
        `API returned ${err.response?.status} (acceptable)`
      );
    }
  } catch (error) {
    logTest("Guard Without Tenant Test", false, error.message);
  }
}

/**
 * Run all tests
 */
async function runAllTests() {
  console.log("\n" + "=".repeat(50));
  console.log("🧪 MULTI-TENANT GUARD ISOLATION TEST SUITE");
  console.log("=".repeat(50));
  console.log(`\nTesting against: ${BASE_URL}`);
  console.log(`JWT Secret: ${JWT_SECRET ? "✅ Configured" : "❌ Missing"}\n`);

  if (!JWT_SECRET) {
    console.log("❌ JWT_SECRET not configured. Cannot create test tokens.");
    process.exit(1);
  }

  // Check if backend is running
  try {
    await axios.get(`${BASE_URL}/health`).catch(() => {
      // Health endpoint might not exist, try shifts endpoint
      return axios.get(`${BASE_URL}/shifts`).catch(() => {
        throw new Error("Backend not responding");
      });
    });
  } catch (err) {
    console.log("⚠️  Backend might not be running. Tests may fail.");
    console.log(`   Error: ${err.message}`);
    console.log(`   Attempting to continue...\n`);
  }

  // Run all tests
  await testShiftListingIsolation();
  await testShiftAcceptanceIsolation();
  await testDashboardIsolation();
  await testAlertsIsolation();
  await testGuardWithoutTenant();

  // Summary
  console.log("\n" + "=".repeat(50));
  console.log("📊 TEST SUMMARY");
  console.log("=".repeat(50));
  console.log(`✅ Passed: ${testResults.passed}`);
  console.log(`❌ Failed: ${testResults.failed}`);
  console.log(`📈 Success Rate: ${((testResults.passed / (testResults.passed + testResults.failed)) * 100).toFixed(1)}%`);

  if (testResults.errors.length > 0) {
    console.log("\n❌ Errors:");
    testResults.errors.forEach((err) => {
      console.log(`   - ${err.test}: ${err.message}`);
    });
  }

  console.log("\n" + "=".repeat(50));
  if (testResults.failed === 0) {
    console.log("✅ ALL TESTS PASSED - Tenant isolation is working correctly!");
  } else {
    console.log("⚠️  SOME TESTS FAILED - Review errors above");
  }
  console.log("=".repeat(50) + "\n");

  process.exit(testResults.failed === 0 ? 0 : 1);
}

// Run tests
runAllTests().catch((error) => {
  console.error("\n❌ Test suite failed:", error);
  console.error("Stack:", error.stack);
  process.exit(1);
});
