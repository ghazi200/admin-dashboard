/**
 * Create overtime_offers table
 * Migration script for overtime offer feature.
 * Uses same connection as abe-guard-ai (DATABASE_URL) and targets only abe_guard.
 */
const path = require("path");
const fs = require("fs");

// Load .env from abe-guard-ai/backend/ (same as src/config/db.js)
const envPath = path.resolve(__dirname, "../../.env");
if (fs.existsSync(envPath)) {
  require("dotenv").config({ path: envPath });
} else {
  require("dotenv").config();
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("❌ DATABASE_URL is required. Set it in abe-guard-ai/backend/.env to postgresql://.../abe_guard");
  process.exit(1);
}

const { Sequelize } = require("sequelize");
const REQUIRED_DB_NAMES = ["abe_guard", "abe-guard"];

const sequelize = new Sequelize(connectionString, {
  dialect: "postgres",
  logging: false,
});

(async () => {
  try {
    await sequelize.authenticate();
    const [rows] = await sequelize.query("SELECT current_database() AS db_name");
    const dbName = rows?.[0]?.db_name;
    if (!dbName || !REQUIRED_DB_NAMES.includes(dbName)) {
      console.error("❌ Wrong database. This script must use abe_guard (same as admin-dashboard).");
      console.error(`   Current: ${dbName || "(unknown)"}`);
      console.error("   Set DATABASE_URL in abe-guard-ai/backend/.env to postgresql://.../abe_guard");
      process.exit(1);
    }
    console.log(`✅ Database connected (${dbName})`);

    // Create overtime_offers table
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS overtime_offers (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        guard_id UUID NOT NULL REFERENCES guards(id) ON DELETE CASCADE,
        shift_id UUID NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
        admin_id UUID, -- Nullable: null for guard-initiated requests, set for admin-initiated offers
        
        -- Offer details
        proposed_end_time TIMESTAMP NOT NULL,
        current_end_time TIMESTAMP NOT NULL,
        extension_hours DECIMAL(4,2) NOT NULL,
        reason TEXT,
        
        -- Status tracking
        status VARCHAR(20) NOT NULL DEFAULT 'pending',
          CHECK (status IN ('pending', 'requested', 'accepted', 'declined', 'expired', 'cancelled')),
        guard_response_at TIMESTAMP,
        admin_notes TEXT,
        
        -- Metadata
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP,
        meta JSONB DEFAULT '{}'::jsonb
      );
    `);

    console.log("✅ overtime_offers table created");

    // Create indexes
    await sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_overtime_offers_guard_id ON overtime_offers(guard_id);
      CREATE INDEX IF NOT EXISTS idx_overtime_offers_shift_id ON overtime_offers(shift_id);
      CREATE INDEX IF NOT EXISTS idx_overtime_offers_status ON overtime_offers(status);
      CREATE INDEX IF NOT EXISTS idx_overtime_offers_created_at ON overtime_offers(created_at);
    `);

    console.log("✅ Indexes created");

    console.log("\n✅ Overtime offers table migration complete!");
    console.log("\n💡 Next steps:");
    console.log("   1. Overtime offers feature is ready to use");
    console.log("   2. Admins can now offer overtime to guards");
    console.log("   3. Guards can accept/decline offers");

  } catch (error) {
    console.error("❌ Error creating overtime_offers table:", error);
    if (error.message.includes("already exists")) {
      console.log("⚠️  Table may already exist, continuing...");
    } else {
      process.exit(1);
    }
  } finally {
    await sequelize.close();
  }
})();
