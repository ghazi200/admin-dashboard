/**
 * Create Test Data for Super-Admin Dashboard
 * 
 * Creates:
 * - 2 tenants with different plans and locations
 * - 20 guards distributed across tenants
 * - 2 incidents
 * - Some shifts and other data
 * 
 * Run: node src/scripts/createSuperAdminTestData.js
 */

require("dotenv").config();
const { v4: uuidv4 } = require("uuid");
const bcrypt = require("bcryptjs");
const { Admin, Guard, sequelize } = require("../models");

(async () => {
  try {
    await sequelize.authenticate();
    console.log("✅ Connected to database\n");

    // Add missing columns if they don't exist
    console.log("🔧 Checking and adding missing columns...");
    try {
      await sequelize.query(`
        ALTER TABLE tenants 
        ADD COLUMN IF NOT EXISTS domain VARCHAR(255),
        ADD COLUMN IF NOT EXISTS contact_email VARCHAR(255),
        ADD COLUMN IF NOT EXISTS contact_phone VARCHAR(255),
        ADD COLUMN IF NOT EXISTS subscription_plan VARCHAR(50) DEFAULT 'free',
        ADD COLUMN IF NOT EXISTS features JSONB DEFAULT '{}',
        ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'trial',
        ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMP,
        ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW(),
        ADD COLUMN IF NOT EXISTS max_guards INTEGER,
        ADD COLUMN IF NOT EXISTS max_locations INTEGER,
        ADD COLUMN IF NOT EXISTS notes TEXT;
      `);
      console.log("✅ Columns checked/added");
    } catch (e) {
      console.log("⚠️ Some columns may already exist:", e.message);
    }

    // Create Tenant 1: Enterprise Plan
    const tenant1Id = uuidv4();
    console.log("🏢 Creating Tenant 1: Enterprise Security Corp...");
    await sequelize.query(`
      INSERT INTO tenants (
        id, name, domain, contact_email, contact_phone, location, monthly_amount,
        subscription_plan, features, status, trial_ends_at, created_at, updated_at
      )
      VALUES (
        $1::uuid, $2, $3, $4, $5, $6, $7,
        $8, $9::jsonb, $10, $11, NOW(), NOW()
      )
      ON CONFLICT (id) DO NOTHING
    `, {
      bind: [
        tenant1Id,
        "Enterprise Security Corp",
        "enterprise-security.com",
        "contact@enterprise-security.com",
        "+1-555-0101",
        "New York, NY",
        2999.99,
        "enterprise",
        JSON.stringify({
          dashboard: true,
          analytics: true,
          ai_optimization: true,
          callout_prediction: true,
          report_builder: true,
          smart_notifications: true,
          scheduled_reports: true,
          multi_location: true,
          api_access: true,
          white_label: true,
        }),
        "active",
        null,
      ],
    });
    console.log("✅ Tenant 1 created:", tenant1Id);

    // Create Tenant 2: Pro Plan
    const tenant2Id = uuidv4();
    console.log("🏢 Creating Tenant 2: Pro Guard Services...");
    await sequelize.query(`
      INSERT INTO tenants (
        id, name, domain, contact_email, contact_phone, location, monthly_amount,
        subscription_plan, features, status, trial_ends_at, created_at, updated_at
      )
      VALUES (
        $1::uuid, $2, $3, $4, $5, $6, $7,
        $8, $9::jsonb, $10, $11, NOW(), NOW()
      )
      ON CONFLICT (id) DO NOTHING
    `, {
      bind: [
        tenant2Id,
        "Pro Guard Services",
        "proguard.com",
        "info@proguard.com",
        "+1-555-0202",
        "Los Angeles, CA",
        999.99,
        "pro",
        JSON.stringify({
          dashboard: true,
          analytics: true,
          ai_optimization: true,
          callout_prediction: true,
          report_builder: true,
          smart_notifications: true,
          scheduled_reports: false,
          multi_location: true,
          api_access: false,
          white_label: false,
        }),
        "active",
        null,
      ],
    });
    console.log("✅ Tenant 2 created:", tenant2Id);

    // Create 12 guards for Tenant 1
    console.log("\n🛡️ Creating 12 guards for Tenant 1...");
    const tenant1Guards = [];
    for (let i = 1; i <= 12; i++) {
      const guardId = uuidv4();
      await sequelize.query(`
        INSERT INTO guards (
          id, tenant_id, name, email, phone, is_active, created_at
        )
        VALUES (
          $1::uuid, $2::uuid, $3, $4, $5, $6, NOW()
        )
        ON CONFLICT (id) DO NOTHING
      `, {
        bind: [
          guardId,
          tenant1Id,
          `Guard ${i} - Enterprise`,
          `guard${i}@enterprise-security.com`,
          `+1-555-${1000 + i}`,
          true,
        ],
      });
      tenant1Guards.push(guardId);
    }
    console.log(`✅ Created ${tenant1Guards.length} guards for Tenant 1`);

    // Create 8 guards for Tenant 2
    console.log("\n🛡️ Creating 8 guards for Tenant 2...");
    const tenant2Guards = [];
    for (let i = 1; i <= 8; i++) {
      const guardId = uuidv4();
      await sequelize.query(`
        INSERT INTO guards (
          id, tenant_id, name, email, phone, is_active, created_at
        )
        VALUES (
          $1::uuid, $2::uuid, $3, $4, $5, $6, NOW()
        )
        ON CONFLICT (id) DO NOTHING
      `, {
        bind: [
          guardId,
          tenant2Id,
          `Guard ${i} - Pro`,
          `guard${i}@proguard.com`,
          `+1-555-${2000 + i}`,
          true,
        ],
      });
      tenant2Guards.push(guardId);
    }
    console.log(`✅ Created ${tenant2Guards.length} guards for Tenant 2`);

    // Create admins for each tenant
    console.log("\n👤 Creating admins for tenants...");
    const admin1Hash = await bcrypt.hash("admin123", 10);
    await sequelize.query(`
      INSERT INTO admins (name, email, password_hash, role, tenant_id, created_at)
      VALUES ($1, $2, $3, $4, $5::uuid, NOW())
      ON CONFLICT (email) DO NOTHING
    `, {
      bind: [
        "Enterprise Admin",
        "admin@enterprise-security.com",
        admin1Hash,
        "admin",
        tenant1Id,
      ],
    });

    const admin2Hash = await bcrypt.hash("admin123", 10);
    await sequelize.query(`
      INSERT INTO admins (name, email, password_hash, role, tenant_id, created_at)
      VALUES ($1, $2, $3, $4, $5::uuid, NOW())
      ON CONFLICT (email) DO NOTHING
    `, {
      bind: [
        "Pro Admin",
        "admin@proguard.com",
        admin2Hash,
        "admin",
        tenant2Id,
      ],
    });
    console.log("✅ Created admins for both tenants");

    // Create some shifts
    console.log("\n📅 Creating shifts...");
    const today = new Date();
    for (let i = 0; i < 5; i++) {
      const shiftDate = new Date(today);
      shiftDate.setDate(today.getDate() + i);
      const shiftId = uuidv4();
      
      await sequelize.query(`
        INSERT INTO shifts (
          id, tenant_id, guard_id, shift_date, shift_start, shift_end, status, location, created_at
        )
        VALUES (
          $1::uuid, $2::uuid, $3::uuid, $4::date, $5, $6, $7, $8, NOW()
        )
        ON CONFLICT (id) DO NOTHING
      `, {
        bind: [
          shiftId,
          tenant1Id,
          tenant1Guards[i % tenant1Guards.length],
          shiftDate.toISOString().split('T')[0],
          "08:00:00",
          "16:00:00",
          i < 2 ? "OPEN" : "CLOSED",
          "New York Office",
        ],
      });
    }

    for (let i = 0; i < 3; i++) {
      const shiftDate = new Date(today);
      shiftDate.setDate(today.getDate() + i);
      const shiftId = uuidv4();
      
      await sequelize.query(`
        INSERT INTO shifts (
          id, tenant_id, guard_id, shift_date, shift_start, shift_end, status, location, created_at
        )
        VALUES (
          $1::uuid, $2::uuid, $3::uuid, $4::date, $5, $6, $7, $8, NOW()
        )
        ON CONFLICT (id) DO NOTHING
      `, {
        bind: [
          shiftId,
          tenant2Id,
          tenant2Guards[i % tenant2Guards.length],
          shiftDate.toISOString().split('T')[0],
          "09:00:00",
          "17:00:00",
          i < 1 ? "OPEN" : "CLOSED",
          "LA Warehouse",
        ],
      });
    }
    console.log("✅ Created shifts for both tenants");

    // Create incidents table if it doesn't exist, then create 2 incidents
    console.log("\n⚠️ Creating incidents table and incidents...");
    try {
      // Drop table if it exists with wrong structure
      await sequelize.query(`DROP TABLE IF EXISTS incidents CASCADE;`);
      
      // Create table with correct structure
      await sequelize.query(`
        CREATE TABLE incidents (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          tenant_id UUID,
          title VARCHAR(255) NOT NULL,
          description TEXT,
          status VARCHAR(50) DEFAULT 'OPEN',
          severity VARCHAR(50) DEFAULT 'MEDIUM',
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        );
      `);
      console.log("✅ Incidents table created");
    } catch (e) {
      console.log("⚠️ Error creating incidents table:", e.message);
      // Try to add columns if table exists
      try {
        await sequelize.query(`
          ALTER TABLE incidents 
          ADD COLUMN IF NOT EXISTS title VARCHAR(255),
          ADD COLUMN IF NOT EXISTS description TEXT,
          ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'OPEN',
          ADD COLUMN IF NOT EXISTS severity VARCHAR(50) DEFAULT 'MEDIUM',
          ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();
        `);
        console.log("✅ Added missing columns to incidents table");
      } catch (e2) {
        console.log("⚠️ Could not add columns:", e2.message);
      }
    }
    
    // Incident 1 for Tenant 1
    const incident1Id = uuidv4();
    await sequelize.query(`
      INSERT INTO incidents (
        id, tenant_id, type, description, status, severity, occurred_at, reported_at, created_at, updated_at
      )
      VALUES (
        $1::uuid, $2::uuid, $3, $4, $5, $6, NOW(), NOW(), NOW(), NOW()
      )
      ON CONFLICT (id) DO NOTHING
    `, {
      bind: [
        incident1Id,
        tenant1Id,
        "Security Breach",
        "Unauthorized person attempted to enter the building. Guard intervened and reported incident.",
        "OPEN",
        "HIGH",
      ],
    });
    console.log("✅ Created Incident 1 for Tenant 1");

    // Incident 2 for Tenant 2
    const incident2Id = uuidv4();
    await sequelize.query(`
      INSERT INTO incidents (
        id, tenant_id, type, description, status, severity, occurred_at, reported_at, created_at, updated_at
      )
      VALUES (
        $1::uuid, $2::uuid, $3, $4, $5, $6, NOW(), NOW(), NOW(), NOW()
      )
      ON CONFLICT (id) DO NOTHING
    `, {
      bind: [
        incident2Id,
        tenant2Id,
        "Equipment Malfunction",
        "Security camera system experienced temporary outage. Issue resolved within 2 hours.",
        "RESOLVED",
        "MEDIUM",
      ],
    });
    console.log("✅ Created Incident 2 for Tenant 2");

    // Verify data
    console.log("\n📊 Verifying created data...");
    
    const [tenantCount] = await sequelize.query(`
      SELECT COUNT(*) as count FROM tenants WHERE id IN ($1::uuid, $2::uuid)
    `, {
      bind: [tenant1Id, tenant2Id],
    });
    console.log(`✅ Tenants: ${tenantCount[0]?.count || 0}`);

    const [guardCount] = await sequelize.query(`
      SELECT COUNT(*) as count FROM guards WHERE tenant_id IN ($1::uuid, $2::uuid)
    `, {
      bind: [tenant1Id, tenant2Id],
    });
    console.log(`✅ Guards: ${guardCount[0]?.count || 0}`);

    const [incidentCount] = await sequelize.query(`
      SELECT COUNT(*) as count FROM incidents WHERE tenant_id IN ($1::uuid, $2::uuid)
    `, {
      bind: [tenant1Id, tenant2Id],
    });
    console.log(`✅ Incidents: ${incidentCount[0]?.count || 0}`);

    console.log("\n✅ Test data creation complete!");
    console.log("\n📋 Summary:");
    console.log(`   - Tenant 1: Enterprise Security Corp (New York, NY) - 12 guards`);
    console.log(`   - Tenant 2: Pro Guard Services (Los Angeles, CA) - 8 guards`);
    console.log(`   - Total Guards: 20`);
    console.log(`   - Total Incidents: 2`);
    console.log("\n💡 Next steps:");
    console.log("   1. Start the backend server");
    console.log("   2. Login as super-admin");
    console.log("   3. Navigate to /super-admin");
    console.log("   4. You should see all the test data!");

    process.exit(0);
  } catch (err) {
    console.error("❌ Error creating test data:", err);
    process.exit(1);
  }
})();
