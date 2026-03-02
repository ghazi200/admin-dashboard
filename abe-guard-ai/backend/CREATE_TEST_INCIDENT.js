/**
 * Create Test Incident
 * 
 * Creates a test incident so you can see the Summarize button in the admin dashboard.
 * 
 * Usage:
 *   node CREATE_TEST_INCIDENT.js
 */

require("dotenv").config();
const { sequelize } = require("./src/config/db");
const { Incident, Guard, Tenant, Site } = require("./src/models");
const { v4: uuidv4 } = require("uuid");

async function createTestIncident() {
  try {
    await sequelize.authenticate();
    console.log("✅ Connected to database");

    // Get or create a tenant
    let tenant = await Tenant.findOne();
    if (!tenant) {
      console.log("⚠️  No tenant found. Creating one...");
      tenant = await Tenant.create({
        id: uuidv4(),
        name: "Test Tenant",
        is_active: true,
      });
      console.log(`✅ Created tenant: ${tenant.id}`);
    } else {
      console.log(`✅ Using existing tenant: ${tenant.name} (${tenant.id})`);
    }

    // Get or create a guard
    let guard = await Guard.findOne({ where: { tenant_id: tenant.id } });
    if (!guard) {
      console.log("⚠️  No guard found. Creating one...");
      guard = await Guard.create({
        id: uuidv4(),
        tenant_id: tenant.id,
        name: "Test Guard",
        email: "testguard@test.com",
        is_active: true,
      });
      console.log(`✅ Created guard: ${guard.name} (${guard.id})`);
    } else {
      console.log(`✅ Using existing guard: ${guard.name} (${guard.id})`);
    }

    // Get or create a site
    let site = await Site.findOne({ where: { tenant_id: tenant.id } });
    if (!site) {
      console.log("⚠️  No site found. Creating one...");
      site = await Site.create({
        id: uuidv4(),
        tenant_id: tenant.id,
        name: "Test Site",
        address_1: "123 Test St",
        city: "Test City",
        state: "TS",
        zip: "12345",
        is_active: true,
      });
      console.log(`✅ Created site: ${site.name} (${site.id})`);
    } else {
      console.log(`✅ Using existing site: ${site.name} (${site.id})`);
    }

    // Create test incident
    const incident = await Incident.create({
      id: uuidv4(),
      tenant_id: tenant.id,
      guard_id: guard.id,
      site_id: site.id,
      type: "TRESPASS",
      severity: "HIGH",
      status: "OPEN",
      description: "Test incident: Suspicious individual observed near the main entrance. Individual was asked to leave and complied. No further action required at this time.",
      location_text: "Main entrance",
      occurred_at: new Date(),
      reported_at: new Date(),
    });

    console.log("\n✅ Test incident created!");
    console.log(`   ID: ${incident.id}`);
    console.log(`   Type: ${incident.type}`);
    console.log(`   Severity: ${incident.severity}`);
    console.log(`   Status: ${incident.status}`);
    console.log(`   Description: ${incident.description.substring(0, 60)}...`);
    console.log(`\n📋 Next steps:`);
    console.log(`   1. Go to the Admin Dashboard Incidents page`);
    console.log(`   2. You should now see the incident card`);
    console.log(`   3. The "🤖 Summarize" and "Update" buttons should be on the right side`);
    console.log(`   4. Click "🤖 Summarize" to test the AI summary feature`);

    process.exit(0);
  } catch (error) {
    console.error("❌ Error creating test incident:", error);
    process.exit(1);
  }
}

createTestIncident();
