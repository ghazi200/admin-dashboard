/**
 * Assign tenant_id to admin accounts
 * 
 * This script assigns the first available tenant to all admins that don't have a tenant_id
 */

require("dotenv").config();
const { Pool } = require("pg");

async function assignTenantToAdmins() {
  const pool = new Pool({
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
  });

  try {
    console.log("🔍 Checking for tenants...");

    // Get first available tenant
    const tenantRes = await pool.query("SELECT id, name FROM tenants ORDER BY name LIMIT 1");
    
    if (tenantRes.rows.length === 0) {
      console.error("❌ No tenants found in database. Please create a tenant first.");
      process.exit(1);
    }

    const tenant = tenantRes.rows[0];
    console.log(`✅ Found tenant: ${tenant.name} (${tenant.id})`);

    // Get admins without tenant_id
    const adminsRes = await pool.query(
      'SELECT id, email, name, tenant_id FROM "Admins" WHERE tenant_id IS NULL'
    );

    if (adminsRes.rows.length === 0) {
      console.log("✅ All admins already have a tenant_id assigned.");
      process.exit(0);
    }

    console.log(`\n📋 Found ${adminsRes.rows.length} admin(s) without tenant_id:`);
    adminsRes.rows.forEach((admin) => {
      console.log(`   - ${admin.email} (${admin.name || "N/A"})`);
    });

    // Update admins
    const updateRes = await pool.query(
      'UPDATE "Admins" SET tenant_id = $1 WHERE tenant_id IS NULL RETURNING id, email, name, tenant_id',
      [tenant.id]
    );

    console.log(`\n✅ Updated ${updateRes.rows.length} admin(s) with tenant_id: ${tenant.id}`);
    updateRes.rows.forEach((admin) => {
      console.log(`   - ${admin.email} → tenant_id: ${admin.tenant_id}`);
    });

    console.log("\n📝 Next steps:");
    console.log("   1. Restart the admin-dashboard backend (if running)");
    console.log("   2. Log out and log back in to get a new JWT token with tenant_id");
    console.log("   3. The Guard Reputation feature should now work!");
  } catch (error) {
    console.error("❌ Error:", error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

assignTenantToAdmins();
