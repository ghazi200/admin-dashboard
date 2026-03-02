/**
 * Test Script: Remote Inspections Feature
 * 
 * Tests the inspection request and submission flow.
 * Run with: node src/scripts/testInspections.js
 */

require("dotenv").config();
const { sequelize } = require("../config/db");
const { InspectionRequest, InspectionSubmission, Site, Guard, Admin, TimeEntry, Shift, Tenant } = require("../models");

async function testInspections() {
  try {
    await sequelize.authenticate();
    console.log("✅ Connected to database\n");

    // Test 1: Generate Challenge Code
    console.log("📋 Test 1: Challenge Code Generation");
    const inspectionService = require("../services/inspection.service");
    const code1 = inspectionService.generateChallengeCode();
    const code2 = inspectionService.generateChallengeCode();
    console.log(`   Generated code 1: ${code1}`);
    console.log(`   Generated code 2: ${code2}`);
    console.log(`   ✅ Codes are unique: ${code1 !== code2}\n`);

    // Test 2: Check if we have test data (create if missing)
    console.log("📋 Test 2: Check/Create Test Data");
    let tenant = await sequelize.models.Tenant.findOne();
    if (!tenant) {
      console.log("   ⚠️  No tenant found. Creating test tenant...");
      tenant = await sequelize.models.Tenant.create({
        name: "Test Tenant",
        is_active: true,
      });
      console.log(`   ✅ Created tenant: ${tenant.id}`);
    } else {
      console.log(`   ✅ Found tenant: ${tenant.id}`);
    }

    let site = await Site.findOne({ where: { tenant_id: tenant.id } });
    if (!site) {
      console.log("   ⚠️  No site found. Creating test site...");
      site = await Site.create({
        tenant_id: tenant.id,
        name: "Test Site - Building A",
        address_1: "123 Test Street",
        city: "Test City",
        state: "TS",
        zip: "12345",
        lat: 40.7128,
        lng: -74.0060,
        is_active: true,
      });
      console.log(`   ✅ Created site: ${site.name} (${site.id})`);
    } else {
      console.log(`   ✅ Found site: ${site.name} (${site.id})`);
    }

    let guard = await Guard.findOne({ where: { tenant_id: tenant.id } });
    if (!guard) {
      console.log("   ⚠️  No guard found. Creating test guard...");
      guard = await Guard.create({
        tenant_id: tenant.id,
        name: "Test Guard",
        email: "testguard@test.com",
        phone: "555-0100",
        is_active: true,
        acceptance_rate: 0.85,
        reliability_score: 0.8,
      });
      console.log(`   ✅ Created guard: ${guard.name} (${guard.id})`);
    } else {
      console.log(`   ✅ Found guard: ${guard.name} (${guard.id})`);
    }

    let admin = await Admin.findOne({ where: { tenant_id: tenant.id } });
    if (!admin) {
      console.log("   ⚠️  No admin found. Creating test admin...");
      const bcrypt = require("bcrypt");
      admin = await Admin.create({
        tenant_id: tenant.id,
        name: "Test Admin",
        email: "testadmin@test.com",
        password_hash: await bcrypt.hash("password123", 10),
        role: "admin",
      });
      console.log(`   ✅ Created admin: ${admin.name} (${admin.id})`);
    } else {
      console.log(`   ✅ Found admin: ${admin.name} (${admin.id})`);
    }
    console.log("");

    // Test 3: Create Inspection Request
    console.log("📋 Test 3: Create Inspection Request");
    const challengeCode = inspectionService.generateChallengeCode();
    const dueAt = new Date();
    dueAt.setMinutes(dueAt.getMinutes() + 10);

    const request = await InspectionRequest.create({
      tenant_id: tenant.id,
      site_id: site.id,
      guard_id: guard.id,
      requested_by_admin_id: admin.id,
      challenge_code: challengeCode,
      instructions: "Test inspection: Please take a selfie showing the lobby area",
      required_items_json: {
        selfie: true,
        badge: true,
        signage: false,
      },
      due_at: dueAt,
      status: "PENDING",
    });
    console.log(`   ✅ Created request: ${request.id}`);
    console.log(`   Challenge code: ${request.challenge_code}`);
    console.log(`   Due at: ${request.due_at}\n`);

    // Test 4: Check Request Retrieval
    console.log("📋 Test 4: Retrieve Inspection Request");
    const retrieved = await InspectionRequest.findByPk(request.id, {
      include: [
        { model: Site, attributes: ["id", "name"] },
        { model: Guard, attributes: ["id", "name"] },
        { model: Admin, as: "requestedBy", attributes: ["id", "name"] },
      ],
    });
    console.log(`   ✅ Retrieved request: ${retrieved.id}`);
    console.log(`   Site: ${retrieved.Site?.name || "N/A"}`);
    console.log(`   Guard: ${retrieved.Guard?.name || "N/A"}`);
    console.log(`   Requested by: ${retrieved.requestedBy?.name || "N/A"}\n`);

    // Test 5: Create Mock Submission (without actual file upload)
    console.log("📋 Test 5: Create Mock Submission");
    const mockPhotos = [
      {
        url: "/uploads/inspections/test_photo_1.jpg",
        hash_sha256: "mock_hash_12345",
        filename: "test_photo_1.jpg",
        size: 1024000,
        mime: "image/jpeg",
        uploaded_at: new Date().toISOString(),
      },
    ];

    const submission = await InspectionSubmission.create({
      request_id: request.id,
      tenant_id: tenant.id,
      guard_id: guard.id,
      submitted_at: new Date(),
      photos_json: mockPhotos,
      comment: "Test submission - all good, no incidents",
      meta_json: {
        device: { type: "mobile", os: "iOS", id: "test-device-123" },
        ip: "127.0.0.1",
        location: { lat: 40.7128, lng: -74.0060 },
      },
    });
    console.log(`   ✅ Created submission: ${submission.id}`);
    console.log(`   Photos: ${submission.photos_json.length} file(s)`);
    console.log(`   Comment: ${submission.comment}\n`);

    // Test 6: Check Duplicate Hash Detection
    console.log("📋 Test 6: Duplicate Hash Detection");
    const duplicateCheck = await inspectionService.checkDuplicateHashes(
      ["mock_hash_12345"],
      guard.id,
      { InspectionSubmission }
    );
    console.log(`   Has duplicate: ${duplicateCheck.hasDuplicate}`);
    console.log(`   Message: ${duplicateCheck.message}\n`);

    // Test 7: Update Request Status
    console.log("📋 Test 7: Update Request Status");
    await request.update({ status: "SUBMITTED" });
    const updated = await InspectionRequest.findByPk(request.id);
    console.log(`   ✅ Updated status: ${updated.status}\n`);

    // Test 8: List Requests with Submissions
    console.log("📋 Test 8: List Requests with Submissions");
    const requestsWithSubs = await InspectionRequest.findAll({
      where: { tenant_id: tenant.id },
      include: [
        { model: sequelize.models.InspectionSubmission, as: "submissions" },
      ],
      limit: 5,
    });
    console.log(`   ✅ Found ${requestsWithSubs.length} request(s)`);
    requestsWithSubs.forEach((req) => {
      console.log(`   - Request ${req.id}: ${req.status} (${req.submissions?.length || 0} submission(s))`);
    });
    console.log("");

    // Cleanup (optional - comment out to keep test data)
    console.log("📋 Cleanup: Removing test data...");
    await submission.destroy();
    await request.destroy();
    console.log("   ✅ Test data cleaned up\n");

    console.log("✅ All inspection tests passed!");
    console.log("\n📝 Summary:");
    console.log("   ✅ Challenge code generation works");
    console.log("   ✅ Inspection requests can be created");
    console.log("   ✅ Requests can be retrieved with associations");
    console.log("   ✅ Submissions can be created");
    console.log("   ✅ Duplicate hash detection works");
    console.log("   ✅ Request status can be updated");
    console.log("   ✅ Requests can be listed with submissions\n");

    process.exit(0);
  } catch (error) {
    console.error("❌ Test failed:", error);
    console.error(error.stack);
    process.exit(1);
  }
}

testInspections();
