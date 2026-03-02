/**
 * Test Overtime Offer Functionality
 * 
 * Tests the admin overtime offer creation and guard notification flow
 */

require("dotenv").config({ path: require("path").join(__dirname, "../../.env") });
const axios = require("axios");
const jwt = require("jsonwebtoken");
const { sequelize } = require("../models");

// Configuration
const ADMIN_DASHBOARD_URL = process.env.ADMIN_DASHBOARD_URL || "http://localhost:3000";
const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key";

let adminToken = null;
let testGuardId = null;
let testShiftId = null;

/**
 * Get admin token directly from database
 */
async function getAdminToken() {
  console.log("\n🔐 Getting admin token...");
  try {
    // Try to find a super_admin first (bypasses tenant filtering)
    const [superAdmins] = await sequelize.query(
      `SELECT id, email, role, tenant_id FROM admins WHERE role = 'super_admin' ORDER BY id LIMIT 1`
    );
    
    let admin;
    if (superAdmins && superAdmins.length > 0) {
      admin = superAdmins[0];
      console.log(`✅ Found super_admin: ${admin.email} (ID: ${admin.id})`);
    } else {
      // Fallback to regular admin
      const [admins] = await sequelize.query(
        `SELECT id, email, role, tenant_id FROM admins ORDER BY id LIMIT 1`
      );
      
      if (!admins || admins.length === 0) {
        throw new Error("No admin found in database");
      }
      
      admin = admins[0];
      console.log(`✅ Found admin: ${admin.email} (ID: ${admin.id}, Role: ${admin.role})`);
    }
    
    // Create a JWT token
    const token = jwt.sign(
      {
        id: admin.id,
        email: admin.email,
        role: admin.role,
        tenant_id: admin.tenant_id,
      },
      JWT_SECRET,
      { expiresIn: "1h" }
    );
    
    adminToken = token;
    console.log("✅ Admin token created");
    return true;
  } catch (error) {
    console.error("❌ Error getting admin token:", error.message);
    return false;
  }
}

/**
 * Get clock status to find a guard who is currently clocked in
 */
async function getClockedInGuard() {
  console.log("\n👥 Finding a clocked-in guard...");
  try {
    const response = await axios.get(`${ADMIN_DASHBOARD_URL}/api/admin/dashboard/clock-status`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    const clockedIn = response.data?.clockedIn || [];
    
    if (clockedIn.length === 0) {
      console.log("⚠️  No guards are currently clocked in");
      console.log("   You need to have a guard clock in first to test overtime offers");
      return null;
    }

    const guard = clockedIn[0];
    console.log(`✅ Found clocked-in guard: ${guard.guardName || guard.guardEmail}`);
    console.log(`   Guard ID: ${guard.guardId}`);
    console.log(`   Shift ID: ${guard.shiftId}`);
    console.log(`   Location: ${guard.location || "N/A"}`);
    console.log(`   Clocked in at: ${guard.clockInAt}`);

    return guard;
  } catch (error) {
    console.error("❌ Failed to get clock status:", error.response?.data?.message || error.message);
    return null;
  }
}

/**
 * Test creating an overtime offer
 */
async function testCreateOvertimeOffer(guard) {
  console.log("\n📝 Testing overtime offer creation...");

  if (!guard || !guard.guardId || !guard.shiftId) {
    console.error("❌ Invalid guard data");
    return false;
  }

  // Calculate proposed end time (1 hour after current shift end)
  const shiftDate = guard.shiftDate || new Date().toISOString().split("T")[0];
  const shiftEnd = guard.shiftEnd || "17:00:00";
  const currentEndTime = new Date(`${shiftDate}T${shiftEnd}`);
  const proposedEndTime = new Date(currentEndTime);
  proposedEndTime.setHours(proposedEndTime.getHours() + 1);

  const extensionHours = 1.0;

  const offerData = {
    guardId: guard.guardId,
    shiftId: guard.shiftId,
    proposedEndTime: proposedEndTime.toISOString(),
    extensionHours: extensionHours,
    reason: "Test overtime offer - please accept or decline",
  };

  console.log("   Offer details:");
  console.log(`   - Guard: ${guard.guardName || guard.guardEmail}`);
  console.log(`   - Current end: ${currentEndTime.toISOString()}`);
  console.log(`   - Proposed end: ${proposedEndTime.toISOString()}`);
  console.log(`   - Extension: ${extensionHours} hours`);
  console.log(`   - Reason: ${offerData.reason}`);

  try {
    const response = await axios.post(
      `${ADMIN_DASHBOARD_URL}/api/admin/overtime/offer`,
      offerData,
      {
        headers: { Authorization: `Bearer ${adminToken}` },
      }
    );

    if (response.data?.data?.id) {
      console.log("✅ Overtime offer created successfully!");
      console.log(`   Offer ID: ${response.data.data.id}`);
      console.log(`   Status: ${response.data.data.status}`);
      return response.data.data;
    } else {
      console.error("❌ Offer creation failed: Invalid response");
      return false;
    }
  } catch (error) {
    console.error("❌ Failed to create overtime offer:", error.response?.data?.message || error.message);
    if (error.response?.data) {
      console.error("   Response:", JSON.stringify(error.response.data, null, 2));
    }
    return false;
  }
}

/**
 * Test getting overtime offers
 */
async function testGetOvertimeOffers() {
  console.log("\n📋 Testing get overtime offers...");
  try {
    const response = await axios.get(`${ADMIN_DASHBOARD_URL}/api/admin/overtime/offers`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      params: { status: "pending" },
    });

    const offers = response.data?.data || [];
    console.log(`✅ Found ${offers.length} pending overtime offer(s)`);

    if (offers.length > 0) {
      offers.forEach((offer, index) => {
        console.log(`\n   Offer ${index + 1}:`);
        console.log(`   - ID: ${offer.id}`);
        console.log(`   - Guard: ${offer.guard_name || offer.guard_email || "Unknown"}`);
        console.log(`   - Status: ${offer.status}`);
        console.log(`   - Extension: ${offer.extension_hours} hours`);
        console.log(`   - Created: ${offer.created_at}`);
        if (offer.expires_at) {
          console.log(`   - Expires: ${offer.expires_at}`);
        }
      });
    }

    return offers;
  } catch (error) {
    console.error("❌ Failed to get overtime offers:", error.response?.data?.message || error.message);
    return [];
  }
}

/**
 * Main test function
 */
async function runTest() {
  console.log("=".repeat(60));
  console.log("🧪 OVERTIME OFFER TEST");
  console.log("=".repeat(60));

  // Step 1: Get admin token
  const tokenSuccess = await getAdminToken();
  if (!tokenSuccess) {
    console.error("\n❌ Test failed: Could not get admin token");
    process.exit(1);
  }

  // Step 2: Find a clocked-in guard
  const guard = await getClockedInGuard();
  if (!guard) {
    console.error("\n❌ Test failed: No clocked-in guard found");
    console.log("\n💡 To test overtime offers:");
    console.log("   1. Have a guard clock in to a shift");
    console.log("   2. Run this test again");
    process.exit(1);
  }

  // Step 3: Create an overtime offer
  const offer = await testCreateOvertimeOffer(guard);
  if (!offer) {
    console.error("\n❌ Test failed: Could not create overtime offer");
    process.exit(1);
  }

  // Step 4: Verify offer appears in list
  await testGetOvertimeOffers();

  console.log("\n" + "=".repeat(60));
  console.log("✅ TEST COMPLETE");
  console.log("=".repeat(60));
  console.log("\n📝 Next steps:");
  console.log("   1. Check guard-ui to see if they received the overtime offer notification");
  console.log("   2. Guard can accept/decline the offer from their interface");
  console.log("   3. Check admin dashboard 'Overtime Requests' component for status updates");
  console.log("\n");
}

// Run the test
runTest().catch((error) => {
  console.error("\n❌ Test error:", error);
  process.exit(1);
});
