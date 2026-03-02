/**
 * Create email_scheduler_settings table for configurable email scheduling
 */

require("dotenv").config();
const { Sequelize } = require("sequelize");

const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASS,
  {
    host: process.env.DB_HOST,
    dialect: "postgres",
    logging: false,
  }
);

(async () => {
  try {
    await sequelize.authenticate();
    console.log("✅ Database connected");

    // Create email_scheduler_settings table
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS email_scheduler_settings (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID,
        setting_type VARCHAR(50) NOT NULL,
        enabled BOOLEAN DEFAULT TRUE,
        interval_minutes INTEGER DEFAULT 60,
        run_times JSONB DEFAULT '[]'::jsonb,
        timezone VARCHAR(50) DEFAULT 'America/New_York',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(tenant_id, setting_type)
      );
    `);

    console.log("✅ email_scheduler_settings table created");

    // Insert default settings if none exist
    const [existing] = await sequelize.query(`
      SELECT COUNT(*) as count FROM email_scheduler_settings WHERE setting_type = 'scheduled_reports'
    `);

    if (parseInt(existing[0]?.count || 0) === 0) {
      await sequelize.query(`
        INSERT INTO email_scheduler_settings (setting_type, enabled, interval_minutes, run_times)
        VALUES 
          ('scheduled_reports', TRUE, 60, '[]'::jsonb),
          ('schedule_emails', TRUE, 360, '[]'::jsonb)
      `);
      console.log("✅ Default email scheduler settings inserted");
    }

    console.log("✅ Migration complete!");
    process.exit(0);
  } catch (err) {
    console.error("❌ Error:", err.message);
    console.error(err);
    process.exit(1);
  }
})();
