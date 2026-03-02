/**
 * Check tenant filtering for shifts
 */

require("dotenv").config();
const { pool } = require("../config/db");

async function checkTenantFiltering() {
  try {
    // Get guard's tenant_id
    const guardResult = await pool.query(
      `SELECT id, email, tenant_id FROM guards WHERE email = $1 LIMIT 1`,
      ["john@abesecurity.com"]
    );

    if (guardResult.rows.length === 0) {
      console.log("❌ Guard not found");
      return;
    }

    const guard = guardResult.rows[0];
    console.log("👤 Guard Info:");
    console.log(`   ID: ${guard.id}`);
    console.log(`   Email: ${guard.email}`);
    console.log(`   Tenant ID: ${guard.tenant_id || 'NULL'}`);
    console.log("");

    // Check OPEN shifts by tenant
    const openShiftsResult = await pool.query(
      `SELECT 
        tenant_id,
        COUNT(*) as count
       FROM shifts
       WHERE status = 'OPEN'
       GROUP BY tenant_id
       ORDER BY tenant_id NULLS LAST`
    );

    console.log("📊 OPEN Shifts by Tenant:");
    console.log("=".repeat(50));
    openShiftsResult.rows.forEach((row) => {
      const matches = row.tenant_id === guard.tenant_id;
      console.log(`Tenant: ${row.tenant_id || 'NULL'} - Count: ${row.count} ${matches ? '✅ MATCHES' : ''}`);
    });

    // Count OPEN shifts that match guard's tenant
    if (guard.tenant_id) {
      const matchingResult = await pool.query(
        `SELECT COUNT(*) as count 
         FROM shifts 
         WHERE status = 'OPEN' AND tenant_id = $1`,
        [guard.tenant_id]
      );
      console.log(`\n✅ OPEN shifts matching guard's tenant: ${matchingResult.rows[0].count}`);
    } else {
      console.log(`\n⚠️  Guard has no tenant_id - should see all OPEN shifts`);
    }

    // Check what the API would return
    const apiResult = await pool.query(
      `SELECT COUNT(*) as count
       FROM shifts
       WHERE (status = 'OPEN' OR guard_id = $1)
         ${guard.tenant_id ? 'AND tenant_id = $2' : ''}
      `,
      guard.tenant_id ? [guard.id, guard.tenant_id] : [guard.id]
    );
    console.log(`\n📡 Shifts API would return: ${apiResult.rows[0].count}`);

    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error("❌ Error:", error.message);
    process.exit(1);
  }
}

checkTenantFiltering();
