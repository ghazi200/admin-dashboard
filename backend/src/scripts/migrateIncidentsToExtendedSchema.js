/**
 * Migration: Add Extended Schema Columns to Incidents Table
 * 
 * Adds the missing columns that the code expects:
 * - guard_id, shift_id, site_id
 * - type, occurred_at, reported_at
 * - location_text, ai_summary, ai_tags_json, attachments_json
 */

// Load .env and get DATABASE_URL
require("dotenv").config({ path: require("path").resolve(__dirname, "../../.env") });
const { Sequelize } = require("sequelize");

// Use DATABASE_URL if available, otherwise fall back to DB_* variables
const databaseUrl = process.env.DATABASE_URL;
const sequelize = databaseUrl
  ? new Sequelize(databaseUrl, {
      dialect: "postgres",
      logging: console.log,
    })
  : new Sequelize(
      process.env.DB_NAME,
      process.env.DB_USER,
      process.env.DB_PASS,
      {
        host: process.env.DB_HOST,
        dialect: "postgres",
        logging: console.log,
      }
    );

(async () => {
  try {
    await sequelize.authenticate();
    console.log("✅ Database connected");

    console.log("🔧 Migrating incidents table to extended schema...\n");

    // Check current schema
    const [currentColumns] = await sequelize.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'incidents'
      ORDER BY ordinal_position;
    `);

    console.log("📋 Current columns:");
    currentColumns.forEach(col => {
      console.log(`   - ${col.column_name} (${col.data_type})`);
    });

    // Add missing columns
    console.log("\n➕ Adding missing columns...\n");

    const migrations = [
      {
        name: "guard_id",
        sql: `ALTER TABLE incidents ADD COLUMN IF NOT EXISTS guard_id UUID;`,
        description: "Link incident to guard"
      },
      {
        name: "shift_id",
        sql: `ALTER TABLE incidents ADD COLUMN IF NOT EXISTS shift_id UUID;`,
        description: "Link incident to shift"
      },
      {
        name: "site_id",
        sql: `ALTER TABLE incidents ADD COLUMN IF NOT EXISTS site_id UUID;`,
        description: "Link incident to site/location"
      },
      {
        name: "type",
        sql: `ALTER TABLE incidents ADD COLUMN IF NOT EXISTS type VARCHAR(100);`,
        description: "Incident type (theft, vandalism, medical, etc.)"
      },
      {
        name: "occurred_at",
        sql: `ALTER TABLE incidents ADD COLUMN IF NOT EXISTS occurred_at TIMESTAMP;`,
        description: "When the incident actually occurred"
      },
      {
        name: "reported_at",
        sql: `ALTER TABLE incidents ADD COLUMN IF NOT EXISTS reported_at TIMESTAMP;`,
        description: "When the incident was reported"
      },
      {
        name: "location_text",
        sql: `ALTER TABLE incidents ADD COLUMN IF NOT EXISTS location_text TEXT;`,
        description: "Human-readable location description"
      },
      {
        name: "ai_summary",
        sql: `ALTER TABLE incidents ADD COLUMN IF NOT EXISTS ai_summary TEXT;`,
        description: "AI-generated summary of the incident"
      },
      {
        name: "ai_tags_json",
        sql: `ALTER TABLE incidents ADD COLUMN IF NOT EXISTS ai_tags_json JSONB;`,
        description: "AI-generated tags in JSON format"
      },
      {
        name: "attachments_json",
        sql: `ALTER TABLE incidents ADD COLUMN IF NOT EXISTS attachments_json JSONB;`,
        description: "Attachments metadata in JSON format"
      },
    ];

    for (const migration of migrations) {
      try {
        await sequelize.query(migration.sql);
        console.log(`✅ Added: ${migration.name} - ${migration.description}`);
      } catch (err) {
        if (err.message.includes("already exists")) {
          console.log(`⚠️  Column ${migration.name} already exists, skipping...`);
        } else {
          console.error(`❌ Error adding ${migration.name}:`, err.message);
        }
      }
    }

    // Add indexes for better query performance
    console.log("\n📊 Adding indexes...\n");

    const indexes = [
      {
        name: "idx_incidents_guard_id",
        sql: `CREATE INDEX IF NOT EXISTS idx_incidents_guard_id ON incidents(guard_id);`,
      },
      {
        name: "idx_incidents_shift_id",
        sql: `CREATE INDEX IF NOT EXISTS idx_incidents_shift_id ON incidents(shift_id);`,
      },
      {
        name: "idx_incidents_site_id",
        sql: `CREATE INDEX IF NOT EXISTS idx_incidents_site_id ON incidents(site_id);`,
      },
      {
        name: "idx_incidents_tenant_id",
        sql: `CREATE INDEX IF NOT EXISTS idx_incidents_tenant_id ON incidents(tenant_id);`,
      },
      {
        name: "idx_incidents_reported_at",
        sql: `CREATE INDEX IF NOT EXISTS idx_incidents_reported_at ON incidents(reported_at);`,
      },
      {
        name: "idx_incidents_status",
        sql: `CREATE INDEX IF NOT EXISTS idx_incidents_status ON incidents(status);`,
      },
    ];

    for (const index of indexes) {
      try {
        await sequelize.query(index.sql);
        console.log(`✅ Created index: ${index.name}`);
      } catch (err) {
        console.error(`❌ Error creating index ${index.name}:`, err.message);
      }
    }

    // Verify final schema
    console.log("\n📋 Final schema:\n");
    const [finalColumns] = await sequelize.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns 
      WHERE table_name = 'incidents'
      ORDER BY ordinal_position;
    `);

    finalColumns.forEach(col => {
      const nullable = col.is_nullable === 'YES' ? 'NULL' : 'NOT NULL';
      console.log(`   - ${col.column_name} (${col.data_type}) ${nullable}`);
    });

    console.log("\n✅ Migration complete!");
    console.log(`   Total columns: ${finalColumns.length}`);
    process.exit(0);
  } catch (err) {
    console.error("❌ Migration error:", err);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
})();
