/**
 * Quick test: Set tenant to HYBRID mode
 * 
 * Run: node src/scripts/testPayrollMode.js [tenant-id]
 */

require("dotenv").config();
const { sequelize } = require("../config/db");
const models = require("../models");

async function testPayrollMode() {
  try {
    const { Tenant } = models;
    const tenantId = process.argv[2];

    if (!tenantId) {
      // List all tenants
      console.log("\n📋 Available tenants:");
      const allTenants = await Tenant.findAll({ limit: 10 });
      allTenants.forEach(t => {
        console.log(`  - ${t.id}: ${t.name || 'Unnamed'} (mode: ${t.payroll_mode || 'NOT SET'})`);
      });
      
      if (allTenants.length === 0) {
        console.log("  No tenants found!");
        process.exit(1);
      }
      
      console.log("\n💡 Usage: node src/scripts/testPayrollMode.js <tenant-id>");
      console.log(`💡 Example: node src/scripts/testPayrollMode.js ${allTenants[0].id}`);
      process.exit(0);
    }

    console.log(`\n🔍 Setting tenant ${tenantId} to HYBRID mode...`);

    const tenant = await Tenant.findByPk(tenantId);
    if (!tenant) {
      console.error(`❌ Tenant not found: ${tenantId}`);
      process.exit(1);
    }

    console.log(`   Current mode: ${tenant.payroll_mode || 'NOT SET'}`);
    console.log(`   Tenant name: ${tenant.name || 'Unnamed'}`);

    // Update to HYBRID
    await tenant.update({
      payroll_mode: 'HYBRID',
      ai_payroll_enabled: true
    });

    // Verify
    await tenant.reload();
    console.log(`\n✅ Updated successfully!`);
    console.log(`   New mode: ${tenant.payroll_mode}`);
    console.log(`   AI payroll enabled: ${tenant.ai_payroll_enabled}`);

    // Test query to verify
    const testTenant = await Tenant.findByPk(tenantId);
    console.log(`\n✅ Verification:`);
    console.log(`   Mode from DB: ${testTenant.payroll_mode}`);
    console.log(`   AI enabled: ${testTenant.ai_payroll_enabled}`);

    if (testTenant.payroll_mode === 'HYBRID') {
      console.log(`\n🎉 TEST PASSED: Tenant is in HYBRID mode!`);
    } else {
      console.log(`\n❌ TEST FAILED: Mode mismatch!`);
      process.exit(1);
    }

    process.exit(0);
  } catch (err) {
    console.error("\n❌ Error:", err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

// Run test
sequelize.authenticate()
  .then(() => {
    console.log("✅ Database connected");
    return testPayrollMode();
  })
  .catch(err => {
    console.error("❌ Database connection failed:", err.message);
    process.exit(1);
  });
