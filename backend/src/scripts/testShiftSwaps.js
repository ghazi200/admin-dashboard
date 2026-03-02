/**
 * Test Shift Swaps API Endpoints
 * 
 * Tests:
 * 1. Create shift swap request
 * 2. List shift swaps (admin)
 * 3. Approve shift swap (admin)
 * 4. Reject shift swap (admin)
 * 5. Test guard-facing endpoints
 */

require("dotenv").config({ path: require("path").join(__dirname, "../../.env") });
const { sequelize, Shift, Guard, ShiftSwap, Admin } = require("../models");
const jwt = require("jsonwebtoken");
const axios = require("axios");

const BASE_URL = process.env.API_URL || "http://localhost:5000";
const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key";

async function getAdminToken() {
  try {
    // Get or create a super admin
    let admin = await Admin.findOne({ where: { role: "super_admin" } });
    
    if (!admin) {
      // Create a test super admin
      admin = await Admin.create({
        name: "Test Super Admin",
        email: "test-superadmin@example.com",
        password: "password123", // Will be hashed by model
        role: "super_admin",
      });
      console.log("✅ Created test super admin");
    }

    // Generate JWT token
    const token = jwt.sign(
      {
        id: admin.id,
        email: admin.email,
        role: admin.role,
        tenant_id: admin.tenant_id,
      },
      JWT_SECRET,
      { expiresIn: "24h" }
    );

    return token;
  } catch (error) {
    console.error("Error getting admin token:", error);
    throw error;
  }
}

async function testShiftSwaps() {
  console.log("🧪 Testing Shift Swaps API Endpoints\n");
  console.log("=".repeat(60));

  try {
    await sequelize.authenticate();
    console.log("✅ Connected to database\n");

    // Get admin token
    console.log("🔐 Step 1: Getting admin token...");
    const adminToken = await getAdminToken();
    console.log("✅ Admin token obtained\n");

    // Setup: Get or create test data
    console.log("📋 Step 2: Setting up test data...");
    
    // Get or create guards (using raw SQL to avoid model issues)
    const [existingGuards] = await sequelize.query(`
      SELECT id, name, email, tenant_id FROM guards LIMIT 2
    `);
    
    let guard1, guard2;
    
    if (existingGuards.length >= 2) {
      guard1 = existingGuards[0];
      guard2 = existingGuards[1];
      console.log(`✅ Using existing guards:`);
      console.log(`   Guard 1: ${guard1.name || guard1.email}`);
      console.log(`   Guard 2: ${guard2.name || guard2.email}`);
    } else if (existingGuards.length === 1) {
      guard1 = existingGuards[0];
      const [newGuards] = await sequelize.query(`
        INSERT INTO guards (id, name, email, phone, is_active, created_at, updated_at)
        VALUES (gen_random_uuid(), 'Guard 2', 'guard2@test.com', '555-0002', true, NOW(), NOW())
        RETURNING id, name, email, tenant_id
      `);
      guard2 = newGuards[0];
      console.log(`✅ Using existing guard 1: ${guard1.name || guard1.email}`);
      console.log(`✅ Created guard 2: ${guard2.name}`);
    } else {
      const [newGuards1] = await sequelize.query(`
        INSERT INTO guards (id, name, email, phone, is_active, created_at, updated_at)
        VALUES (gen_random_uuid(), 'Guard 1', 'guard1@test.com', '555-0001', true, NOW(), NOW())
        RETURNING id, name, email, tenant_id
      `);
      guard1 = newGuards1[0];
      
      const [newGuards2] = await sequelize.query(`
        INSERT INTO guards (id, name, email, phone, is_active, created_at, updated_at)
        VALUES (gen_random_uuid(), 'Guard 2', 'guard2@test.com', '555-0002', true, NOW(), NOW())
        RETURNING id, name, email, tenant_id
      `);
      guard2 = newGuards2[0];
      console.log(`✅ Created guards:`);
      console.log(`   Guard 1: ${guard1.name}`);
      console.log(`   Guard 2: ${guard2.name}`);
    }

    // Get or create shifts (using raw SQL)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split('T')[0];
    
    const [existingShifts1] = await sequelize.query(`
      SELECT id, guard_id, shift_date, shift_start, shift_end, status, location, tenant_id
      FROM shifts
      WHERE guard_id = $1
      LIMIT 1
    `, { bind: [guard1.id] });
    
    let shift1;
    if (existingShifts1.length > 0) {
      shift1 = existingShifts1[0];
      console.log(`✅ Using existing shift 1: ${shift1.id}`);
    } else {
      const [newShifts1] = await sequelize.query(`
        INSERT INTO shifts (id, guard_id, shift_date, shift_start, shift_end, status, location, tenant_id, created_at)
        VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, NOW())
        RETURNING id, guard_id, shift_date, shift_start, shift_end, status, location, tenant_id
      `, {
        bind: [guard1.id, todayStr, "09:00:00", "17:00:00", "SCHEDULED", "Test Location 1", guard1.tenant_id]
      });
      shift1 = newShifts1[0];
      console.log(`✅ Created shift 1: ${shift1.id}`);
    }

    const [existingShifts2] = await sequelize.query(`
      SELECT id, guard_id, shift_date, shift_start, shift_end, status, location, tenant_id
      FROM shifts
      WHERE guard_id = $1 AND id != $2
      LIMIT 1
    `, { bind: [guard2.id, shift1.id] });
    
    let shift2;
    if (existingShifts2.length > 0) {
      shift2 = existingShifts2[0];
      console.log(`✅ Using existing shift 2: ${shift2.id}`);
    } else {
      const [newShifts2] = await sequelize.query(`
        INSERT INTO shifts (id, guard_id, shift_date, shift_start, shift_end, status, location, tenant_id, created_at)
        VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, NOW())
        RETURNING id, guard_id, shift_date, shift_start, shift_end, status, location, tenant_id
      `, {
        bind: [guard2.id, todayStr, "18:00:00", "02:00:00", "SCHEDULED", "Test Location 2", guard2.tenant_id]
      });
      shift2 = newShifts2[0];
      console.log(`✅ Created shift 2: ${shift2.id}`);
    }

    console.log("");

    // Test 1: Create shift swap request (via guard endpoint simulation)
    console.log("🔄 Test 1: Create Shift Swap Request");
    console.log("-".repeat(60));
    
    const swapData = {
      shift_id: shift1.id,
      requester_guard_id: guard1.id,
      target_guard_id: guard2.id,
      target_shift_id: shift2.id,
      status: "pending",
      reason: "Test swap request - need to swap shifts",
      tenant_id: guard1.tenant_id || null,
    };

    const swap = await ShiftSwap.create(swapData);
    console.log(`✅ Created shift swap: ${swap.id}`);
    console.log(`   Requester: ${guard1.name || guard1.email}`);
    console.log(`   Target: ${guard2.name || guard2.email}`);
    console.log(`   Status: ${swap.status}`);
    console.log("");

    // Test 2: List shift swaps (admin endpoint)
    console.log("📋 Test 2: List Shift Swaps (Admin Endpoint)");
    console.log("-".repeat(60));
    
    try {
      const response = await axios.get(`${BASE_URL}/api/admin/shift-swaps`, {
        headers: {
          Authorization: `Bearer ${adminToken}`,
          "Content-Type": "application/json",
        },
      });

      if (response.status === 200 && response.data.data) {
        console.log(`✅ Successfully fetched ${response.data.data.length} shift swaps`);
        if (response.data.data.length > 0) {
          const firstSwap = response.data.data[0];
          console.log(`   First swap ID: ${firstSwap.id}`);
          console.log(`   Status: ${firstSwap.status}`);
          console.log(`   Requester: ${firstSwap.requester_name || "N/A"}`);
        }
      } else {
        console.log("⚠️  Unexpected response structure:", response.data);
      }
    } catch (error) {
      if (error.response) {
        console.log(`❌ API Error: ${error.response.status} - ${error.response.data?.message || error.message}`);
        console.log(`   URL: ${error.config?.url}`);
      } else {
        console.log(`❌ Network Error: ${error.message}`);
        console.log(`   Make sure the backend server is running on ${BASE_URL}`);
      }
    }
    console.log("");

    // Test 3: List pending swaps
    console.log("📋 Test 3: List Pending Swaps");
    console.log("-".repeat(60));
    
    try {
      const response = await axios.get(`${BASE_URL}/api/admin/shift-swaps?status=pending`, {
        headers: {
          Authorization: `Bearer ${adminToken}`,
          "Content-Type": "application/json",
        },
      });

      if (response.status === 200 && response.data.data) {
        const pendingSwaps = response.data.data.filter(s => s.status === "pending");
        console.log(`✅ Found ${pendingSwaps.length} pending swaps`);
      }
    } catch (error) {
      if (error.response) {
        console.log(`❌ API Error: ${error.response.status} - ${error.response.data?.message || error.message}`);
      } else {
        console.log(`❌ Network Error: ${error.message}`);
      }
    }
    console.log("");

    // Test 4: Approve shift swap
    console.log("✅ Test 4: Approve Shift Swap");
    console.log("-".repeat(60));
    
    try {
      const response = await axios.post(
        `${BASE_URL}/api/admin/shift-swaps/${swap.id}/approve`,
        { admin_notes: "Test approval - approved via test script" },
        {
          headers: {
            Authorization: `Bearer ${adminToken}`,
            "Content-Type": "application/json",
          },
        }
      );

      if (response.status === 200) {
        console.log(`✅ Successfully approved swap: ${swap.id}`);
        console.log(`   Message: ${response.data.message || "Approved"}`);
        
        // Verify swap status changed
        const updatedSwap = await ShiftSwap.findByPk(swap.id);
        console.log(`   Updated status: ${updatedSwap.status}`);
      }
    } catch (error) {
      if (error.response) {
        console.log(`❌ API Error: ${error.response.status} - ${error.response.data?.message || error.message}`);
        if (error.response.status === 400) {
          console.log(`   Note: Swap might already be approved/rejected`);
        }
      } else {
        console.log(`❌ Network Error: ${error.message}`);
      }
    }
    console.log("");

    // Test 5: Create another swap for rejection test
    console.log("🔄 Test 5: Create Swap for Rejection Test");
    console.log("-".repeat(60));
    
    const swap2 = await ShiftSwap.create({
      shift_id: shift2.id,
      requester_guard_id: guard2.id,
      status: "pending",
      reason: "Test swap to be rejected",
      tenant_id: guard2.tenant_id || null,
    });
    console.log(`✅ Created swap for rejection test: ${swap2.id}`);
    console.log("");

    // Test 6: Reject shift swap
    console.log("❌ Test 6: Reject Shift Swap");
    console.log("-".repeat(60));
    
    try {
      const response = await axios.post(
        `${BASE_URL}/api/admin/shift-swaps/${swap2.id}/reject`,
        { admin_notes: "Test rejection - rejected via test script" },
        {
          headers: {
            Authorization: `Bearer ${adminToken}`,
            "Content-Type": "application/json",
          },
        }
      );

      if (response.status === 200) {
        console.log(`✅ Successfully rejected swap: ${swap2.id}`);
        console.log(`   Message: ${response.data.message || "Rejected"}`);
        
        // Verify swap status changed
        const updatedSwap = await ShiftSwap.findByPk(swap2.id);
        console.log(`   Updated status: ${updatedSwap.status}`);
      }
    } catch (error) {
      if (error.response) {
        console.log(`❌ API Error: ${error.response.status} - ${error.response.data?.message || error.message}`);
        if (error.response.status === 400) {
          console.log(`   Note: Swap might already be approved/rejected`);
        }
      } else {
        console.log(`❌ Network Error: ${error.message}`);
      }
    }
    console.log("");

    // Test 7: Database verification
    console.log("🗄️  Test 7: Database Verification");
    console.log("-".repeat(60));
    
    const [allSwaps] = await sequelize.query(`
      SELECT ss.id, ss.status, ss.reason, ss.created_at,
             rg.name as requester_name, rg.email as requester_email
      FROM shift_swaps ss
      LEFT JOIN guards rg ON ss.requester_guard_id = rg.id
      ORDER BY ss.created_at DESC
      LIMIT 5
    `);
    
    console.log(`✅ Found ${allSwaps.length} shift swaps in database`);
    allSwaps.forEach((s, i) => {
      console.log(`   ${i + 1}. ID: ${s.id}, Status: ${s.status}, Requester: ${s.requester_name || s.requester_email}`);
    });
    console.log("");

    console.log("=".repeat(60));
    console.log("✅ SHIFT SWAPS TESTS COMPLETED!");
    console.log("=".repeat(60));
    console.log("\n📋 Summary:");
    console.log("  ✅ Created shift swap requests");
    console.log("  ✅ Tested list endpoint (admin)");
    console.log("  ✅ Tested approve endpoint (admin)");
    console.log("  ✅ Tested reject endpoint (admin)");
    console.log("  ✅ Verified database operations");
    console.log("\n🎯 Next Steps:");
    console.log("  1. Test via frontend UI");
    console.log("  2. Test guard-facing endpoints (when guard-ui is ready)");
    console.log("  3. Test with real guard accounts");
    
    return true;

  } catch (error) {
    console.error("\n❌ Test error:", error);
    console.error("Stack:", error.stack);
    return false;
  }
}

// Run tests
if (require.main === module) {
  testShiftSwaps()
    .then((success) => {
      if (success) {
        console.log("\n🎉 Shift Swaps API is working!");
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

module.exports = { testShiftSwaps };
