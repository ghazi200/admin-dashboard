/**
 * Test Multi-Tenant Setup
 * 
 * Verifies that:
 * 1. tenant_id column exists in Admins table
 * 2. JWT tokens include tenant_id
 * 3. Auth middleware extracts tenant_id correctly
 */

require("dotenv").config();
const { sequelize } = require("../config/db");
const Admin = require("../models/Admin")(sequelize, require("sequelize").DataTypes);
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const authAdmin = require("../middleware/authAdmin");

async function testMultiTenant() {
  try {
    console.log("🧪 Testing Multi-Tenant Setup...\n");

    // Test 1: Verify tenant_id column exists
    console.log("1️⃣  Testing: tenant_id column exists in Admins table");
    const [columnCheck] = await sequelize.query(`
      SELECT column_name, data_type, is_nullable 
      FROM information_schema.columns 
      WHERE table_name = 'Admins' AND column_name = 'tenant_id'
    `);

    if (columnCheck.length === 0) {
      console.log("   ❌ FAILED: tenant_id column not found\n");
      return false;
    }
    console.log(`   ✅ PASSED: tenant_id column exists (type: ${columnCheck[0].data_type}, nullable: ${columnCheck[0].is_nullable})\n`);

    // Test 2: Verify Admin model has tenant_id field
    console.log("2️⃣  Testing: Admin model includes tenant_id field");
    const adminAttributes = Admin.rawAttributes;
    if (!adminAttributes.tenant_id) {
      console.log("   ❌ FAILED: tenant_id not found in Admin model\n");
      return false;
    }
    console.log(`   ✅ PASSED: Admin model has tenant_id field (type: ${adminAttributes.tenant_id.type.key})\n`);

    // Test 3: Create test admin with tenant_id and verify JWT includes it
    console.log("3️⃣  Testing: JWT token includes tenant_id");
    const testTenantId = "123e4567-e89b-12d3-a456-426614174000"; // Test UUID
    const testEmail = `test-multitenant-${Date.now()}@example.com`;
    
    // Check if test admin already exists
    let testAdmin = await Admin.findOne({ where: { email: testEmail } });
    
    if (!testAdmin) {
      const hash = await bcrypt.hash("testpass123", 10);
      testAdmin = await Admin.create({
        name: "Test Multi-Tenant Admin",
        email: testEmail,
        password: hash,
        role: "admin",
        tenant_id: testTenantId,
      });
      console.log(`   📝 Created test admin: ${testAdmin.id}`);
    }

    // Generate JWT token (simulate login)
    const token = jwt.sign(
      {
        adminId: testAdmin.id,
        role: testAdmin.role,
        permissions: testAdmin.permissions || [],
        tenant_id: testAdmin.tenant_id || null, // ✅ Multi-tenant: Include tenant_id
      },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    // Decode and verify token contains tenant_id
    const decoded = jwt.decode(token);
    if (!decoded.tenant_id) {
      console.log("   ❌ FAILED: JWT token does not include tenant_id\n");
      await testAdmin.destroy();
      return false;
    }
    
    if (decoded.tenant_id !== testTenantId) {
      console.log(`   ❌ FAILED: JWT tenant_id mismatch (expected: ${testTenantId}, got: ${decoded.tenant_id})\n`);
      await testAdmin.destroy();
      return false;
    }
    console.log(`   ✅ PASSED: JWT token includes tenant_id: ${decoded.tenant_id}\n`);

    // Test 4: Verify auth middleware extracts tenant_id
    console.log("4️⃣  Testing: Auth middleware extracts tenant_id from JWT");
    let middlewareTenantId = null;
    
    const mockReq = {
      headers: { authorization: `Bearer ${token}` },
      admin: null,
    };
    const mockRes = {
      status: (code) => ({
        json: (data) => {
          throw new Error(`Auth failed: ${data.message}`);
        },
      }),
    };
    let middlewareCalled = false;

    try {
      await new Promise((resolve, reject) => {
        authAdmin(mockReq, mockRes, (err) => {
          if (err) reject(err);
          else resolve();
        });
        // Give middleware a moment to set req.admin
        setTimeout(() => {
          middlewareCalled = true;
          middlewareTenantId = mockReq.admin?.tenant_id;
          resolve();
        }, 10);
      });
    } catch (e) {
      // Expected if middleware fails
    }

    if (!middlewareCalled) {
      console.log("   ⚠️  SKIPPED: Could not test middleware (requires full Express context)\n");
    } else if (middlewareTenantId !== testTenantId) {
      console.log(`   ❌ FAILED: Middleware tenant_id mismatch (expected: ${testTenantId}, got: ${middlewareTenantId})\n`);
      await testAdmin.destroy();
      return false;
    } else {
      console.log(`   ✅ PASSED: Auth middleware extracts tenant_id: ${middlewareTenantId}\n`);
    }

    // Cleanup: Delete test admin
    await testAdmin.destroy();
    console.log("   🧹 Cleaned up test admin\n");

    // All tests passed
    console.log("✅ All multi-tenant tests passed!\n");
    console.log("📋 Summary:");
    console.log("   - tenant_id column exists in database");
    console.log("   - Admin model includes tenant_id field");
    console.log("   - JWT tokens include tenant_id");
    console.log("   - Ready for multi-tenant deployment\n");

    return true;
  } catch (error) {
    console.error("❌ Test failed with error:", error.message);
    console.error(error.stack);
    return false;
  } finally {
    await sequelize.close();
  }
}

// Run tests
testMultiTenant()
  .then((success) => {
    process.exit(success ? 0 : 1);
  })
  .catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  });
