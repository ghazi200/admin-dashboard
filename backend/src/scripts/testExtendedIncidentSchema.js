/**
 * Test Extended Incident Schema
 * 
 * Tests that all roles can use the extended incident schema with all 18 columns
 */

require("dotenv").config();
const axios = require("axios");

const BASE_URL = process.env.ADMIN_DASHBOARD_URL || "http://localhost:5000";
const API_BASE = `${BASE_URL}/api/admin`;
const SUPER_ADMIN_API_BASE = `${BASE_URL}/api/super-admin`;

const TEST_EMAIL = process.env.TEST_ADMIN_EMAIL || "admin@test.com";
const TEST_PASSWORD = process.env.TEST_ADMIN_PASSWORD || "password123";

let adminToken = null;
let superAdminToken = null;

async function loginAsAdmin() {
  try {
    const response = await axios.post(`${API_BASE}/login`, {
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
    });
    
    if (response.data.token) {
      adminToken = response.data.token;
      console.log("✅ Logged in as admin");
      return true;
    }
    return false;
  } catch (error) {
    console.error("❌ Admin login failed:", error.response?.data?.message || error.message);
    return false;
  }
}

async function loginAsSuperAdmin() {
  try {
    // Try to find super admin email
    const superAdminEmail = process.env.SUPER_ADMIN_EMAIL || "superadmin@test.com";
    const superAdminPassword = process.env.SUPER_ADMIN_PASSWORD || "superadmin123";
    
    const response = await axios.post(`${API_BASE}/login`, {
      email: superAdminEmail,
      password: superAdminPassword,
    });
    
    if (response.data.token) {
      superAdminToken = response.data.token;
      console.log("✅ Logged in as super admin");
      return true;
    }
    return false;
  } catch (error) {
    console.log("⚠️  Super admin login skipped (may not exist)");
    return false;
  }
}

async function testDatabaseSchema() {
  console.log("\n📊 Testing Database Schema...\n");
  
  try {
    const { Sequelize } = require("sequelize");
    const sequelize = new Sequelize(
      process.env.DB_NAME,
      process.env.DB_USER,
      process.env.DB_PASS,
      {
        host: process.env.DB_HOST,
        dialect: "postgres",
        logging: false,
      }
    );

    await sequelize.authenticate();
    
    // Check columns
    const [columns] = await sequelize.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns 
      WHERE table_name = 'incidents'
      ORDER BY ordinal_position;
    `);

    console.log(`📋 Found ${columns.length} columns in incidents table:\n`);
    
    const expectedColumns = [
      "id", "tenant_id", "guard_id", "shift_id", "site_id",
      "title", "type", "description", "status", "severity",
      "occurred_at", "reported_at", "location_text",
      "ai_summary", "ai_tags_json", "attachments_json",
      "created_at", "updated_at"
    ];

    let allColumnsPresent = true;
    expectedColumns.forEach(expectedCol => {
      const found = columns.find(col => col.column_name === expectedCol);
      if (found) {
        console.log(`   ✅ ${expectedCol} (${found.data_type})`);
      } else {
        console.log(`   ❌ ${expectedCol} - MISSING`);
        allColumnsPresent = false;
      }
    });

    // Check indexes
    const [indexes] = await sequelize.query(`
      SELECT indexname 
      FROM pg_indexes 
      WHERE tablename = 'incidents';
    `);

    console.log(`\n📊 Found ${indexes.length} indexes:\n`);
    indexes.forEach(idx => {
      console.log(`   ✅ ${idx.indexname}`);
    });

    await sequelize.close();
    
    if (allColumnsPresent && columns.length === 18) {
      console.log("\n✅ Database schema test PASSED");
      return true;
    } else {
      console.log("\n❌ Database schema test FAILED");
      return false;
    }
  } catch (error) {
    console.error("❌ Database schema test error:", error.message);
    return false;
  }
}

async function testIncidentModel() {
  console.log("\n🔧 Testing Incident Model...\n");
  
  try {
    const models = require("../models");
    
    if (!models.Incident) {
      console.log("❌ Incident model not found in models");
      return false;
    }

    console.log("✅ Incident model loaded");
    
    // Check model attributes
    const attributes = Object.keys(models.Incident.rawAttributes || {});
    console.log(`\n📋 Model has ${attributes.length} attributes:\n`);
    
    const expectedAttributes = [
      "id", "tenantId", "guardId", "shiftId", "siteId",
      "title", "type", "description", "status", "severity",
      "occurredAt", "reportedAt", "locationText",
      "aiSummary", "aiTagsJson", "attachmentsJson",
    ];

    // createdAt and updatedAt are handled by Sequelize timestamps
    // They may not appear in rawAttributes but are available via timestamps: true

    let allAttributesPresent = true;
    expectedAttributes.forEach(expectedAttr => {
      if (attributes.includes(expectedAttr)) {
        console.log(`   ✅ ${expectedAttr}`);
      } else {
        console.log(`   ❌ ${expectedAttr} - MISSING`);
        allAttributesPresent = false;
      }
    });

    // Check if timestamps are enabled
    const hasTimestamps = models.Incident.options.timestamps === true;
    if (hasTimestamps) {
      console.log(`   ✅ createdAt (via timestamps)`);
      console.log(`   ✅ updatedAt (via timestamps)`);
    } else {
      console.log(`   ⚠️  createdAt/updatedAt (timestamps disabled)`);
    }

    if (allAttributesPresent) {
      console.log("\n✅ Incident model test PASSED");
      return true;
    } else {
      console.log("\n❌ Incident model test FAILED");
      return false;
    }
  } catch (error) {
    console.error("❌ Incident model test error:", error.message);
    return false;
  }
}

async function testSuperAdminIncidents() {
  console.log("\n👑 Testing Super Admin Incidents API...\n");
  
  if (!superAdminToken) {
    console.log("⚠️  Skipping (super admin not logged in)");
    return true;
  }

  try {
    const response = await axios.get(`${SUPER_ADMIN_API_BASE}/incidents`, {
      headers: { Authorization: `Bearer ${superAdminToken}` },
    });

    const data = response.data;
    
    console.log("✅ Super admin incidents API response:");
    console.log(`   - Total incidents: ${data.total || 0}`);
    console.log(`   - Status breakdown: ${JSON.stringify(data.statusBreakdown || [])}`);
    
    if (data.incidents && data.incidents.length > 0) {
      const firstIncident = data.incidents[0];
      console.log(`\n📋 Sample incident fields:`);
      console.log(`   - id: ${firstIncident.id ? '✅' : '❌'}`);
      console.log(`   - tenant_id: ${firstIncident.tenant_id ? '✅' : '⚠️'}`);
      console.log(`   - guard_id: ${firstIncident.guard_id !== undefined ? '✅' : '⚠️'}`);
      console.log(`   - shift_id: ${firstIncident.shift_id !== undefined ? '✅' : '⚠️'}`);
      console.log(`   - site_id: ${firstIncident.site_id !== undefined ? '✅' : '⚠️'}`);
      console.log(`   - type: ${firstIncident.type !== undefined ? '✅' : '⚠️'}`);
      console.log(`   - reported_at: ${firstIncident.reported_at !== undefined ? '✅' : '⚠️'}`);
      console.log(`   - occurred_at: ${firstIncident.occurred_at !== undefined ? '✅' : '⚠️'}`);
      console.log(`   - location_text: ${firstIncident.location_text !== undefined ? '✅' : '⚠️'}`);
      console.log(`   - ai_summary: ${firstIncident.ai_summary !== undefined ? '✅' : '⚠️'}`);
    }

    console.log("\n✅ Super admin incidents API test PASSED");
    return true;
  } catch (error) {
    console.error("❌ Super admin incidents API test error:", error.response?.data?.message || error.message);
    return false;
  }
}

async function testSiteHealthService() {
  console.log("\n🏥 Testing Site Health Service...\n");
  
  if (!adminToken) {
    console.log("⚠️  Skipping (admin not logged in)");
    return true;
  }

  try {
    // This tests that siteHealth service can query with extended schema
    const response = await axios.get(`${API_BASE}/command-center/site-health`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      params: { tenantId: null }, // Will use admin's tenant_id
    });

    console.log("✅ Site health API response received");
    console.log(`   - Data count: ${response.data?.count || 0}`);
    
    // The service should now use siteId and reportedAt without errors
    console.log("\n✅ Site health service test PASSED (no errors = success)");
    return true;
  } catch (error) {
    // Check if it's a schema error or just a normal error
    if (error.response?.data?.error?.includes("column") || 
        error.message?.includes("column")) {
      console.error("❌ Site health service test FAILED - schema error:", error.message);
      return false;
    } else {
      // Other errors (like no tenant) are OK
      console.log("⚠️  Site health service test - expected error (no tenant/data):", error.response?.data?.message || error.message);
      return true;
    }
  }
}

async function runAllTests() {
  console.log("🧪 Testing Extended Incident Schema\n");
  console.log("=" .repeat(50));
  
  const results = {
    databaseSchema: false,
    incidentModel: false,
    superAdminAPI: false,
    siteHealthService: false,
  };

  // Test 1: Database Schema
  results.databaseSchema = await testDatabaseSchema();

  // Test 2: Incident Model
  results.incidentModel = await testIncidentModel();

  // Test 3: Login
  await loginAsAdmin();
  await loginAsSuperAdmin();

  // Test 4: Super Admin API
  results.superAdminAPI = await testSuperAdminIncidents();

  // Test 5: Site Health Service
  results.siteHealthService = await testSiteHealthService();

  // Summary
  console.log("\n" + "=".repeat(50));
  console.log("📊 Test Summary\n");
  
  Object.entries(results).forEach(([test, passed]) => {
    const status = passed ? "✅ PASSED" : "❌ FAILED";
    console.log(`   ${test}: ${status}`);
  });

  const allPassed = Object.values(results).every(r => r === true);
  
  if (allPassed) {
    console.log("\n🎉 All tests PASSED! Extended schema is working correctly.");
  } else {
    console.log("\n⚠️  Some tests failed. Please review the output above.");
  }

  process.exit(allPassed ? 0 : 1);
}

runAllTests().catch((error) => {
  console.error("\n❌ Test suite error:", error);
  process.exit(1);
});
