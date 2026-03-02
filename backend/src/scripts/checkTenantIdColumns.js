/**
 * Check if tenant_id columns exist in database tables
 */

require("dotenv").config({ path: require("path").join(__dirname, "../../.env") });
const { sequelize } = require("../models");

async function checkTenantIdColumns() {
  console.log("🔍 Checking tenant_id columns in database tables...\n");
  console.log("=".repeat(60));

  try {
    // List of tables to check
    const tables = [
      "guards",
      "shifts",
      "callouts",
      "admins",
      "incidents",
      "op_events",
      "command_center_actions",
      "time_entries"
    ];

    for (const table of tables) {
      try {
        // Check if table exists and has tenant_id column
        const [results] = await sequelize.query(`
          SELECT column_name, data_type, is_nullable
          FROM information_schema.columns
          WHERE table_name = '${table}'
            AND column_name = 'tenant_id'
        `);

        if (results.length > 0) {
          const col = results[0];
          console.log(`✅ ${table.padEnd(30)} tenant_id: ${col.data_type} (nullable: ${col.is_nullable})`);
        } else {
          // Check if table exists at all
          const [tableCheck] = await sequelize.query(`
            SELECT table_name
            FROM information_schema.tables
            WHERE table_name = '${table}'
          `);
          
          if (tableCheck.length > 0) {
            console.log(`❌ ${table.padEnd(30)} tenant_id: NOT FOUND (table exists)`);
          } else {
            console.log(`⚠️  ${table.padEnd(30)} tenant_id: TABLE DOES NOT EXIST`);
          }
        }
      } catch (error) {
        console.log(`⚠️  ${table.padEnd(30)} Error: ${error.message}`);
      }
    }

    // Also check models
    console.log("\n" + "=".repeat(60));
    console.log("📋 Checking Sequelize Models:\n");

    const { Guard, Shift, CallOut, Admin } = require("../models");

    console.log(`Guard model: ${Guard.rawAttributes.tenant_id ? "✅ Has tenant_id" : "❌ No tenant_id"}`);
    console.log(`Shift model: ${Shift.rawAttributes.tenant_id ? "✅ Has tenant_id" : "❌ No tenant_id"}`);
    console.log(`CallOut model: ${CallOut.rawAttributes.tenant_id ? "✅ Has tenant_id" : "❌ No tenant_id"}`);
    console.log(`Admin model: ${Admin.rawAttributes.tenant_id ? "✅ Has tenant_id" : "❌ No tenant_id"}`);

    // Test actual query
    console.log("\n" + "=".repeat(60));
    console.log("🧪 Testing actual queries:\n");

    try {
      const [guards] = await sequelize.query(`
        SELECT id, name, tenant_id
        FROM guards
        LIMIT 1
      `);
      if (guards.length > 0) {
        console.log(`✅ Guards query works. Sample guard:`, guards[0]);
      } else {
        console.log(`⚠️  Guards table is empty`);
      }
    } catch (error) {
      console.log(`❌ Guards query failed: ${error.message}`);
    }

    try {
      const [shifts] = await sequelize.query(`
        SELECT id, tenant_id, status
        FROM shifts
        LIMIT 1
      `);
      if (shifts.length > 0) {
        console.log(`✅ Shifts query works. Sample shift:`, shifts[0]);
      } else {
        console.log(`⚠️  Shifts table is empty`);
      }
    } catch (error) {
      console.log(`❌ Shifts query failed: ${error.message}`);
    }

  } catch (error) {
    console.error("❌ Error:", error);
  } finally {
    await sequelize.close();
  }
}

if (require.main === module) {
  checkTenantIdColumns()
    .then(() => {
      console.log("\n✅ Check complete!");
      process.exit(0);
    })
    .catch((error) => {
      console.error("\n❌ Error:", error);
      process.exit(1);
    });
}

module.exports = { checkTenantIdColumns };
