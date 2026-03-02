/**
 * Create Schedule Email Tables
 * Creates tables for schedule email preferences and logs
 */

require("dotenv").config();
const { Sequelize, DataTypes } = require("sequelize");

const isTest = process.env.NODE_ENV === "test";

const sequelize = isTest
  ? new Sequelize({
      dialect: "sqlite",
      storage: "file::memory:",
      logging: false,
    })
  : new Sequelize(
      process.env.DB_NAME,
      process.env.DB_USER,
      process.env.DB_PASS,
      {
        host: process.env.DB_HOST,
        dialect: "postgres",
        logging: false,
      }
    );

async function createScheduleEmailTables() {
  try {
    await sequelize.authenticate();
    console.log("✅ Connected to database");

    console.log("\n🔧 Creating schedule email tables...");

    // Create schedule_email_preferences table
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS schedule_email_preferences (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        guard_id UUID NOT NULL REFERENCES guards(id) ON DELETE CASCADE,
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        frequency VARCHAR(20) NOT NULL DEFAULT 'weekly' CHECK (frequency IN ('weekly', 'bi-weekly', 'monthly', 'never')),
        day_of_week INTEGER CHECK (day_of_week >= 0 AND day_of_week <= 6),
        day_of_month INTEGER CHECK (day_of_month >= 1 AND day_of_month <= 28),
        preferred_time TIME DEFAULT '09:00:00',
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        last_sent_at TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        UNIQUE(guard_id)
      );
    `);
    console.log("✅ Created schedule_email_preferences table");

    // Create schedule_email_logs table
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS schedule_email_logs (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        guard_id UUID NOT NULL REFERENCES guards(id) ON DELETE CASCADE,
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        email_sent_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        schedule_period_start DATE NOT NULL,
        schedule_period_end DATE NOT NULL,
        shifts_count INTEGER NOT NULL DEFAULT 0,
        email_status VARCHAR(20) NOT NULL DEFAULT 'sent' CHECK (email_status IN ('sent', 'failed', 'pending')),
        error_message TEXT,
        email_subject VARCHAR(255),
        email_to VARCHAR(255) NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      );
    `);
    console.log("✅ Created schedule_email_logs table");

    // Create indexes
    await sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_schedule_email_prefs_guard_id ON schedule_email_preferences (guard_id);
      CREATE INDEX IF NOT EXISTS idx_schedule_email_prefs_tenant_id ON schedule_email_preferences (tenant_id);
      CREATE INDEX IF NOT EXISTS idx_schedule_email_prefs_active ON schedule_email_preferences (is_active) WHERE is_active = TRUE;
      CREATE INDEX IF NOT EXISTS idx_schedule_email_logs_guard_id ON schedule_email_logs (guard_id);
      CREATE INDEX IF NOT EXISTS idx_schedule_email_logs_tenant_id ON schedule_email_logs (tenant_id);
      CREATE INDEX IF NOT EXISTS idx_schedule_email_logs_sent_at ON schedule_email_logs (email_sent_at);
      CREATE INDEX IF NOT EXISTS idx_schedule_email_logs_status ON schedule_email_logs (email_status);
    `);
    console.log("✅ Created indexes");

    console.log("\n✅ All schedule email tables created successfully!");
    console.log("\n💡 Next steps:");
    console.log("   1. Start the backend server");
    console.log("   2. Access the Schedule Email API at /api/admin/schedule-email");
    console.log("   3. Configure email preferences for guards");

  } catch (error) {
    console.error("❌ Error creating schedule email tables:", error);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

createScheduleEmailTables();
