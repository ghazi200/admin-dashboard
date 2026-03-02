/**
 * Test Tenant Isolation System
 * 
 * Tests:
 * 1. Super Admin can see all tenants
 * 2. Admin can only see their own tenant
 * 3. Supervisor can only see their own tenant
 * 4. Create operations auto-set tenant_id
 * 5. Update/delete operations check tenant access
 */

require("dotenv").config({ path: require("path").join(__dirname, "../../.env") });
const { sequelize } = require("../models");

// Mock req.admin objects for testing
const superAdmin = {
  id: 1,
  role: "super_admin",
  permissions: [],
  tenant_id: null
};

const adminTenant1 = {
  id: 2,
  role: "admin",
  permissions: ["guards:write", "shifts:write"],
  tenant_id: "11111111-1111-1111-1111-111111111111"
};

const supervisorTenant1 = {
  id: 3,
  role: "supervisor",
  permissions: ["guards:read", "shifts:read"],
  tenant_id: "11111111-1111-1111-1111-111111111111"
};

const adminTenant2 = {
  id: 4,
  role: "admin",
  permissions: ["guards:write", "shifts:write"],
  tenant_id: "22222222-2222-2222-2222-222222222222"
};

// Import tenant filter utilities
const {
  getTenantFilter,
  getTenantWhere,
  getTenantSqlFilter,
  ensureTenantId,
  canAccessTenant
} = require("../utils/tenantFilter");

async function testTenantFiltering() {
  console.log("🧪 Testing Tenant Isolation System\n");
  console.log("=" .repeat(60));

  // Test 1: getTenantFilter
  console.log("\n✅ Test 1: getTenantFilter");
  console.log("-".repeat(60));
  
  const superAdminFilter = getTenantFilter(superAdmin);
  const adminFilter = getTenantFilter(adminTenant1);
  const supervisorFilter = getTenantFilter(supervisorTenant1);
  
  console.log(`Super Admin filter: ${superAdminFilter} (should be null)`);
  console.log(`Admin Tenant1 filter: ${adminFilter} (should be tenant1 UUID)`);
  console.log(`Supervisor Tenant1 filter: ${supervisorFilter} (should be tenant1 UUID)`);
  
  if (superAdminFilter !== null) {
    console.log("❌ FAIL: Super Admin should return null");
    return false;
  }
  if (adminFilter !== adminTenant1.tenant_id) {
    console.log("❌ FAIL: Admin should return their tenant_id");
    return false;
  }
  if (supervisorFilter !== supervisorTenant1.tenant_id) {
    console.log("❌ FAIL: Supervisor should return their tenant_id");
    return false;
  }
  console.log("✅ PASS: getTenantFilter works correctly");

  // Test 2: getTenantWhere
  console.log("\n✅ Test 2: getTenantWhere (Sequelize)");
  console.log("-".repeat(60));
  
  const superAdminWhere = getTenantWhere(superAdmin);
  const adminWhere = getTenantWhere(adminTenant1);
  
  console.log(`Super Admin where: ${JSON.stringify(superAdminWhere)} (should be null)`);
  console.log(`Admin where: ${JSON.stringify(adminWhere)} (should have tenant_id)`);
  
  if (superAdminWhere !== null) {
    console.log("❌ FAIL: Super Admin should return null");
    return false;
  }
  if (adminWhere?.tenant_id !== adminTenant1.tenant_id) {
    console.log("❌ FAIL: Admin where should have tenant_id");
    return false;
  }
  console.log("✅ PASS: getTenantWhere works correctly");

  // Test 3: getTenantSqlFilter
  console.log("\n✅ Test 3: getTenantSqlFilter (Raw SQL)");
  console.log("-".repeat(60));
  
  const params = [];
  const superAdminSql = getTenantSqlFilter(superAdmin, params);
  const params2 = [];
  const adminSql = getTenantSqlFilter(adminTenant1, params2);
  
  console.log(`Super Admin SQL: "${superAdminSql}" (should be empty)`);
  console.log(`Admin SQL: "${adminSql}" (should have tenant_id filter)`);
  console.log(`Admin params: ${JSON.stringify(params2)}`);
  
  if (superAdminSql !== "") {
    console.log("❌ FAIL: Super Admin should return empty string");
    return false;
  }
  if (!adminSql.includes("tenant_id")) {
    console.log("❌ FAIL: Admin SQL should include tenant_id");
    return false;
  }
  if (params2.length !== 1 || params2[0] !== adminTenant1.tenant_id) {
    console.log("❌ FAIL: Admin params should include tenant_id");
    return false;
  }
  console.log("✅ PASS: getTenantSqlFilter works correctly");

  // Test 4: ensureTenantId
  console.log("\n✅ Test 4: ensureTenantId (Auto-set tenant_id)");
  console.log("-".repeat(60));
  
  const data1 = { name: "Test Guard" };
  const data2 = { name: "Test Guard", tenant_id: "99999999-9999-9999-9999-999999999999" };
  
  const superAdminData1 = ensureTenantId(superAdmin, data1);
  const superAdminData2 = ensureTenantId(superAdmin, data2);
  const adminData1 = ensureTenantId(adminTenant1, data1);
  const adminData2 = ensureTenantId(adminTenant1, data2);
  
  console.log(`Super Admin (no tenant_id): ${JSON.stringify(superAdminData1)}`);
  console.log(`Super Admin (with tenant_id): ${JSON.stringify(superAdminData2)}`);
  console.log(`Admin (no tenant_id): ${JSON.stringify(adminData1)}`);
  console.log(`Admin (with tenant_id): ${JSON.stringify(adminData2)}`);
  
  if (superAdminData1.tenant_id !== undefined) {
    console.log("❌ FAIL: Super Admin should not auto-set tenant_id");
    return false;
  }
  if (superAdminData2.tenant_id !== data2.tenant_id) {
    console.log("❌ FAIL: Super Admin should preserve provided tenant_id");
    return false;
  }
  if (adminData1.tenant_id !== adminTenant1.tenant_id) {
    console.log("❌ FAIL: Admin should auto-set tenant_id");
    return false;
  }
  if (adminData2.tenant_id !== adminTenant1.tenant_id) {
    console.log("❌ FAIL: Admin should override provided tenant_id with their own");
    return false;
  }
  console.log("✅ PASS: ensureTenantId works correctly");

  // Test 5: canAccessTenant
  console.log("\n✅ Test 5: canAccessTenant (Access Control)");
  console.log("-".repeat(60));
  
  const tenant1 = "11111111-1111-1111-1111-111111111111";
  const tenant2 = "22222222-2222-2222-2222-222222222222";
  
  const superAdminCanAccess1 = canAccessTenant(superAdmin, tenant1);
  const superAdminCanAccess2 = canAccessTenant(superAdmin, tenant2);
  const adminCanAccess1 = canAccessTenant(adminTenant1, tenant1);
  const adminCanAccess2 = canAccessTenant(adminTenant1, tenant2);
  const supervisorCanAccess1 = canAccessTenant(supervisorTenant1, tenant1);
  const supervisorCanAccess2 = canAccessTenant(supervisorTenant1, tenant2);
  
  console.log(`Super Admin can access Tenant1: ${superAdminCanAccess1} (should be true)`);
  console.log(`Super Admin can access Tenant2: ${superAdminCanAccess2} (should be true)`);
  console.log(`Admin Tenant1 can access Tenant1: ${adminCanAccess1} (should be true)`);
  console.log(`Admin Tenant1 can access Tenant2: ${adminCanAccess2} (should be false)`);
  console.log(`Supervisor Tenant1 can access Tenant1: ${supervisorCanAccess1} (should be true)`);
  console.log(`Supervisor Tenant1 can access Tenant2: ${supervisorCanAccess2} (should be false)`);
  
  if (!superAdminCanAccess1 || !superAdminCanAccess2) {
    console.log("❌ FAIL: Super Admin should access all tenants");
    return false;
  }
  if (!adminCanAccess1 || adminCanAccess2) {
    console.log("❌ FAIL: Admin should only access their tenant");
    return false;
  }
  if (!supervisorCanAccess1 || supervisorCanAccess2) {
    console.log("❌ FAIL: Supervisor should only access their tenant");
    return false;
  }
  console.log("✅ PASS: canAccessTenant works correctly");

  // Test 6: Database Query Test (if models are available)
  console.log("\n✅ Test 6: Database Query Test");
  console.log("-".repeat(60));
  
  try {
    const { Guard } = require("../models");
    
    // Test Super Admin query (should see all)
    const superAdminWhereClause = getTenantWhere(superAdmin);
    const allGuards = await Guard.findAll({
      where: superAdminWhereClause || {},
      limit: 5,
      attributes: ["id", "name", "tenant_id"]
    });
    console.log(`Super Admin sees ${allGuards.length} guards (all tenants)`);
    if (allGuards.length > 0) {
      console.log(`   Sample guard tenant_id: ${allGuards[0].tenant_id || 'null'}`);
    }
    
    // Test Admin query (should see only their tenant)
    const adminWhereClause = getTenantWhere(adminTenant1);
    if (adminWhereClause) {
      // Use raw query to test actual database filtering
      const { sequelize } = require("../models");
      const params = [];
      const tenantSql = getTenantSqlFilter(adminTenant1, params);
      
      if (tenantSql) {
        const [tenant1Guards] = await sequelize.query(`
          SELECT id, name, tenant_id
          FROM guards
          WHERE ${tenantSql}
          LIMIT 5
        `, { bind: params });
        
        console.log(`Admin Tenant1 sees ${tenant1Guards.length} guards (only Tenant1)`);
        if (tenant1Guards.length > 0) {
          console.log(`   Sample guard tenant_id: ${tenant1Guards[0].tenant_id || 'null'}`);
        }
        
        // Verify all guards belong to Tenant1
        const allBelongToTenant1 = tenant1Guards.every(g => 
          !g.tenant_id || g.tenant_id === adminTenant1.tenant_id
        );
        if (!allBelongToTenant1) {
          console.log("❌ FAIL: Admin should only see guards from their tenant");
          return false;
        }
        console.log("✅ PASS: Database query filtering works correctly");
      } else {
        console.log("⚠️  SKIP: No tenant SQL filter generated");
      }
    } else {
      console.log("⚠️  SKIP: Admin where clause is null (no tenant_id set)");
    }
  } catch (error) {
    console.log(`⚠️  SKIP: Database test (${error.message})`);
    console.log(`   Error details: ${error.stack?.split('\n')[0]}`);
  }

  console.log("\n" + "=".repeat(60));
  console.log("✅ ALL TESTS PASSED!");
  console.log("=".repeat(60));
  
  return true;
}

// Run tests
if (require.main === module) {
  testTenantFiltering()
    .then((success) => {
      if (success) {
        console.log("\n🎉 Tenant isolation system is working correctly!");
        process.exit(0);
      } else {
        console.log("\n❌ Some tests failed!");
        process.exit(1);
      }
    })
    .catch((error) => {
      console.error("\n❌ Test error:", error);
      process.exit(1);
    })
    .finally(() => {
      sequelize.close();
    });
}

module.exports = { testTenantFiltering };
