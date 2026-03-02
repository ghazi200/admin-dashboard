/**
 * Create Report Builder Database Tables
 * Run this script to create the necessary tables for the Custom Report Builder feature
 */

require("dotenv").config();
const { sequelize } = require("../models");
const { v4: uuidv4 } = require("uuid");

async function createReportBuilderTables() {
  try {
    console.log("🔧 Creating Report Builder tables...\n");

    // Create report_templates table
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS report_templates (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        category VARCHAR(100) DEFAULT 'custom',
        widgets JSONB NOT NULL DEFAULT '[]',
        settings JSONB DEFAULT '{}',
        is_public BOOLEAN DEFAULT false,
        is_default BOOLEAN DEFAULT false,
        created_by UUID,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP
      )
    `);
    console.log("✅ Created report_templates table");

    // Create scheduled_reports table
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS scheduled_reports (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID,
        template_id UUID NOT NULL,
        name VARCHAR(255) NOT NULL,
        frequency VARCHAR(50) NOT NULL,
        schedule_config JSONB DEFAULT '{}',
        email_recipients TEXT[] DEFAULT '{}',
        email_subject VARCHAR(500),
        email_message TEXT,
        export_format VARCHAR(50) DEFAULT 'pdf',
        is_active BOOLEAN DEFAULT true,
        last_run_at TIMESTAMP,
        next_run_at TIMESTAMP,
        created_by UUID,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP
      )
    `);
    console.log("✅ Created scheduled_reports table");

    // Create report_runs table
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS report_runs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID,
        template_id UUID,
        scheduled_report_id UUID,
        report_data JSONB NOT NULL,
        file_paths JSONB DEFAULT '{}',
        formats TEXT[] DEFAULT '{}',
        status VARCHAR(50) DEFAULT 'pending',
        error_message TEXT,
        generated_by UUID,
        generated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log("✅ Created report_runs table");

    // Create report_shares table
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS report_shares (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID,
        template_id UUID,
        report_run_id UUID,
        share_type VARCHAR(50) DEFAULT 'link',
        share_token VARCHAR(255) UNIQUE,
        recipients TEXT[] DEFAULT '{}',
        permission VARCHAR(50) DEFAULT 'view',
        password_protected BOOLEAN DEFAULT false,
        password_hash VARCHAR(255),
        expires_at TIMESTAMP,
        view_count INTEGER DEFAULT 0,
        last_viewed_at TIMESTAMP,
        created_by UUID,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log("✅ Created report_shares table");

    // Create indexes
    await sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_report_templates_tenant ON report_templates(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_report_templates_public ON report_templates(is_public);
      CREATE INDEX IF NOT EXISTS idx_scheduled_reports_tenant ON scheduled_reports(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_scheduled_reports_active ON scheduled_reports(is_active);
      CREATE INDEX IF NOT EXISTS idx_scheduled_reports_next_run ON scheduled_reports(next_run_at);
      CREATE INDEX IF NOT EXISTS idx_report_runs_tenant ON report_runs(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_report_runs_template ON report_runs(template_id);
      CREATE INDEX IF NOT EXISTS idx_report_shares_token ON report_shares(share_token);
    `);
    console.log("✅ Created indexes\n");

    console.log("✅ All Report Builder tables created successfully!");
    console.log("\n💡 Next steps:");
    console.log("   1. Start the backend server");
    console.log("   2. Access the Report Builder API at /api/admin/reports");
    console.log("   3. Create your first report template");

  } catch (error) {
    console.error("❌ Error creating tables:", error);
    throw error;
  } finally {
    await sequelize.close();
  }
}

// Run if called directly
if (require.main === module) {
  createReportBuilderTables()
    .then(() => {
      console.log("\n✅ Migration completed");
      process.exit(0);
    })
    .catch((error) => {
      console.error("\n❌ Migration failed:", error);
      process.exit(1);
    });
}

module.exports = createReportBuilderTables;
