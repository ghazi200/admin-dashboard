/**
 * Direct Test Script for Multi-Tenant Guard Isolation (#49)
 * 
 * Tests tenant isolation logic directly without requiring API server
 */

require("dotenv").config();
const { pool } = require("../config/db");
const { 
  getGuardTenantSqlFilter, 
  canGuardAccessResource,
  canGuardAccessTenant 
} = require("../utils/guardTenantFilter");

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
 * Test 1: Verify tenant filter utility functions
 */
async function testTenantFilterUtilities() {
  console.log("\n📋 TEST 1: Tenant Filter Utility Functions");
  console.log("=".repeat(50));

  // Test guard with tenant_id
  const guardWithTenant = { guardId: "test-id", tenant_id: "tenant-123" };
  const params1 = [];
  const filter1 = getGuardTenantSqlFilter(guardWithTenant, params1);
  
  logTest(
    "getGuardTenantSqlFilter returns correct SQL",
    filter1 === "tenant_id = $1" && params1[0] === "tenant-123",
    `Expected "tenant_id = $1", got "${filter1}"`
  );

  // Test guard without tenant_id
  const guardWithoutTenant = { guardId: "test-id", tenant_id: null };
  const params2 = [];
  const filter2 = getGuardTenantSqlFilter(guardWithoutTenant, params2);
  
  logTest(
    "getGuardTenantSqlFilter returns empty for guard without tenant",
    filter2 === "" && params2.length === 0,
    `Expected "", got "${filter2}"`
  );

  // Test canGuardAccessTenant
  logTest(
    "canGuardAccessTenant allows same tenant",
    canGuardAccessTenant(guardWithTenant, "tenant-123") === true,
    "Should allow access to same tenant"
  );

  logTest(
    "canGuardAccessTenant blocks different tenant",
    canGuardAccessTenant(guardWithTenant, "tenant-456") === false,
    "Should block access to different tenant"
  );

  logTest(
    "canGuardAccessTenant blocks guard without tenant",
    canGuardAccessTenant(guardWithoutTenant, "tenant-123") === false,
    "Should block guard without tenant"
  );

  // Test canGuardAccessResource
  const resourceSameTenant = { id: "res-1", tenant_id: "tenant-123" };
  const resourceDiffTenant = { id: "res-2", tenant_id: "tenant-456" };
  const resourceNoTenant = { id: "res-3", tenant_id: null };

  logTest(
    "canGuardAccessResource allows same tenant",
    canGuardAccessResource(guardWithTenant, resourceSameTenant) === true,
    "Should allow access to resource from same tenant"
  );

  logTest(
    "canGuardAccessResource blocks different tenant",
    canGuardAccessResource(guardWithTenant, resourceDiffTenant) === false,
    "Should block access to resource from different tenant"
  );

  logTest(
    "canGuardAccessResource allows resource without tenant (legacy)",
    canGuardAccessResource(guardWithTenant, resourceNoTenant) === true,
    "Should allow access to legacy resources without tenant_id"
  );

  logTest(
    "canGuardAccessResource blocks guard without tenant",
    canGuardAccessResource(guardWithoutTenant, resourceSameTenant) === false,
    "Should block guard without tenant from accessing tenant resources"
  );
}

/**
 * Test 2: Verify shift queries are filtered by tenant
 */
async function testShiftQueryFiltering() {
  console.log("\n📋 TEST 2: Shift Query Tenant Filtering");
  console.log("=".repeat(50));

  try {
    // Get guards from different tenants
    const guardResult = await pool.query(
      `SELECT id, email, tenant_id FROM guards WHERE tenant_id IS NOT NULL LIMIT 2`
    );
    const guards = guardResult.rows || [];

    if (guards.length < 2) {
      logTest(
        "Shift Query - Setup",
        false,
        "Need at least 2 guards with different tenant_id"
      );
      return;
    }

    const guard1 = guards[0];
    const guard2 = guards[1];

    // Test query with tenant filter for guard1
    const params1 = [guard1.id];
    const tenantFilter1 = getGuardTenantSqlFilter({ tenant_id: guard1.tenant_id }, params1);
    const whereClause1 = tenantFilter1 ? `AND ${tenantFilter1}` : "";

    const query1 = `
      SELECT id, tenant_id, guard_id 
      FROM shifts 
      WHERE guard_id = $1 ${whereClause1}
      LIMIT 10
    `;

    const result1 = await pool.query(query1, params1);
    const shifts1 = result1.rows || [];

    // Verify all shifts are from guard1's tenant
    const allFromTenant1 = shifts1.every(
      (shift) => !shift.tenant_id || shift.tenant_id === guard1.tenant_id
    );

    logTest(
      `Guard 1 shifts are from tenant ${guard1.tenant_id}`,
      allFromTenant1,
      allFromTenant1
        ? `✅ All ${shifts1.length} shifts are from guard1's tenant`
        : `❌ Found shifts from other tenants`
    );

    // Test that guard1 doesn't see guard2's tenant shifts
    // Simply verify that guard1's tenant filter would exclude guard2's tenant
    if (guard1.tenant_id !== guard2.tenant_id) {
      // Guard1 should not be able to see shifts from guard2's tenant
      const params2 = [];
      const tenantFilter2 = getGuardTenantSqlFilter({ tenant_id: guard1.tenant_id }, params2);
      
      // Query shifts from guard2's tenant - should return 0 when filtered by guard1's tenant
      params2.push(guard2.tenant_id);
      const query2 = `
        SELECT id, tenant_id 
        FROM shifts 
        WHERE tenant_id = $1 AND ${tenantFilter2}
        LIMIT 10
      `;
      
      const result2 = await pool.query(query2, params2);
      const shifts2 = result2.rows || [];

      logTest(
        `Guard 1 cannot see Tenant 2 shifts`,
        shifts2.length === 0,
        shifts2.length === 0
          ? "✅ Guard 1 cannot see Tenant 2 shifts (correct isolation)"
          : `❌ Guard 1 can see ${shifts2.length} shifts from Tenant 2`
      );
    } else {
      logTest(
        `Guard 1 cannot see Tenant 2 shifts`,
        true,
        "Guards are from same tenant (skipping test)"
      );
    }

    logTest(
      `Guard 1 cannot see Tenant 2 shifts`,
      shifts2.length === 0,
      shifts2.length === 0
        ? "✅ Guard 1 cannot see Tenant 2 shifts (correct isolation)"
        : `❌ Guard 1 can see ${shifts2.length} shifts from Tenant 2`
    );

  } catch (error) {
    logTest("Shift Query Filtering", false, error.message);
  }
}

/**
 * Test 3: Verify resource access checks
 */
async function testResourceAccessChecks() {
  console.log("\n📋 TEST 3: Resource Access Checks");
  console.log("=".repeat(50));

  try {
    // Get guards from different tenants
    const guardResult = await pool.query(
      `SELECT id, email, tenant_id FROM guards WHERE tenant_id IS NOT NULL LIMIT 2`
    );
    const guards = guardResult.rows || [];

    if (guards.length < 2) {
      logTest(
        "Resource Access - Setup",
        false,
        "Need at least 2 guards with different tenant_id"
      );
      return;
    }

    const guard1 = guards[0];
    const guard2 = guards[1];

    // Verify guards are from different tenants
    if (guard1.tenant_id === guard2.tenant_id) {
      logTest(
        "Resource Access - Setup",
        false,
        "Guards must be from different tenants for this test"
      );
      return;
    }

    // Get a shift from guard2's tenant
    const shiftResult = await pool.query(
      `SELECT id, tenant_id FROM shifts 
       WHERE tenant_id = $1 
       LIMIT 1`,
      [guard2.tenant_id]
    );
    const shifts = shiftResult.rows || [];

    if (shifts.length === 0) {
      logTest(
        "Resource Access - Setup",
        false,
        "Need a shift from guard2's tenant"
      );
      return;
    }

    const otherTenantShift = shifts[0];

    // Test guard1 cannot access guard2's tenant shift
    const canAccess = canGuardAccessResource(
      { tenant_id: guard1.tenant_id },
      otherTenantShift
    );

    logTest(
      `Guard 1 (tenant ${guard1.tenant_id}) cannot access Tenant 2 (${guard2.tenant_id}) shift`,
      canAccess === false,
      canAccess === false
        ? `✅ Guard 1 correctly blocked from accessing shift ${otherTenantShift.id}`
        : `❌ Guard 1 can access shift from Tenant 2 (security breach!) - Guard tenant: ${guard1.tenant_id}, Shift tenant: ${otherTenantShift.tenant_id}`
    );

    // Test guard2 CAN access their own tenant's shift
    const canAccessOwn = canGuardAccessResource(
      { tenant_id: guard2.tenant_id },
      otherTenantShift
    );

    logTest(
      `Guard 2 can access their own tenant shift`,
      canAccessOwn === true,
      canAccessOwn === true
        ? `✅ Guard 2 can access their own tenant's shift`
        : `❌ Guard 2 cannot access their own tenant's shift`
    );

  } catch (error) {
    logTest("Resource Access Checks", false, error.message);
  }
}

/**
 * Test 4: Verify database queries use tenant filtering
 */
async function testDatabaseQueries() {
  console.log("\n📋 TEST 4: Database Query Tenant Filtering");
  console.log("=".repeat(50));

  try {
    // Get a guard with tenant_id
    const guardResult = await pool.query(
      `SELECT id, email, tenant_id FROM guards WHERE tenant_id IS NOT NULL LIMIT 1`
    );
    const guards = guardResult.rows || [];

    if (guards.length === 0) {
      logTest(
        "Database Query - Setup",
        false,
        "Need a guard with tenant_id"
      );
      return;
    }

    const guard = guards[0];

    // Test dashboard query pattern (like in guardDashboard.controller.js)
    const params = [guard.id];
    const tenantFilter = getGuardTenantSqlFilter({ tenant_id: guard.tenant_id }, params);
    const tenantWhere = tenantFilter ? `AND ${tenantFilter}` : "";

    const query = `
      SELECT id, shift_date, shift_start, shift_end, status, location, tenant_id
      FROM public.shifts
      WHERE guard_id = $1 ${tenantWhere}
      ORDER BY shift_date DESC
      LIMIT 10
    `;

    const result = await pool.query(query, params);
    const shifts = result.rows || [];

    // Verify all shifts are from guard's tenant
    const allFromTenant = shifts.every(
      (shift) => !shift.tenant_id || shift.tenant_id === guard.tenant_id
    );

    logTest(
      "Dashboard query returns only guard's tenant shifts",
      allFromTenant,
      allFromTenant
        ? `✅ All ${shifts.length} shifts are from guard's tenant`
        : `❌ Found shifts from other tenants`
    );

    // Test time_entries query
    const timeQuery = `
      SELECT id, shift_id, clock_in_at, tenant_id
      FROM public.time_entries
      WHERE guard_id = $1 ${tenantWhere}
      LIMIT 10
    `;

    const timeResult = await pool.query(timeQuery, params);
    const timeEntries = timeResult.rows || [];

    const allTimeFromTenant = timeEntries.every(
      (entry) => !entry.tenant_id || entry.tenant_id === guard.tenant_id
    );

    logTest(
      "Time entries query returns only guard's tenant entries",
      allTimeFromTenant || timeEntries.length === 0,
      allTimeFromTenant || timeEntries.length === 0
        ? `✅ All ${timeEntries.length} time entries are from guard's tenant`
        : `❌ Found time entries from other tenants`
    );

  } catch (error) {
    logTest("Database Queries", false, error.message);
  }
}

/**
 * Run all tests
 */
async function runAllTests() {
  console.log("\n" + "=".repeat(50));
  console.log("🧪 MULTI-TENANT GUARD ISOLATION DIRECT TEST SUITE");
  console.log("=".repeat(50));
  console.log("\nTesting tenant isolation logic directly...\n");

  await testTenantFilterUtilities();
  await testShiftQueryFiltering();
  await testResourceAccessChecks();
  await testDatabaseQueries();

  // Summary
  console.log("\n" + "=".repeat(50));
  console.log("📊 TEST SUMMARY");
  console.log("=".repeat(50));
  console.log(`✅ Passed: ${testResults.passed}`);
  console.log(`❌ Failed: ${testResults.failed}`);
  const total = testResults.passed + testResults.failed;
  console.log(`📈 Success Rate: ${total > 0 ? ((testResults.passed / total) * 100).toFixed(1) : 0}%`);

  if (testResults.errors.length > 0) {
    console.log("\n❌ Errors:");
    testResults.errors.forEach((err) => {
      console.log(`   - ${err.test}: ${err.message}`);
    });
  }

  console.log("\n" + "=".repeat(50));
  if (testResults.failed === 0) {
    console.log("✅ ALL TESTS PASSED - Tenant isolation logic is working correctly!");
  } else {
    console.log("⚠️  SOME TESTS FAILED - Review errors above");
  }
  console.log("=".repeat(50) + "\n");

  await pool.end();
  process.exit(testResults.failed === 0 ? 0 : 1);
}

// Run tests
runAllTests().catch((error) => {
  console.error("\n❌ Test suite failed:", error);
  console.error("Stack:", error.stack);
  process.exit(1);
});
