/**
 * Migration Script: Create Shift Management Tables
 * 
 * Creates tables for:
 * 1. Shift Swap Marketplace
 * 2. Shift Availability Preferences
 * 3. Shift Notes/Reports
 * 4. Shift Reminders (stored in notifications)
 */

require("dotenv").config({ path: require("path").join(__dirname, "../../.env") });
const { sequelize } = require("../models");

async function createShiftManagementTables() {
  console.log("🔧 Creating Shift Management tables...\n");

  try {
    // 1. Shift Swaps Table
    console.log("1. Creating shift_swaps table...");
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS shift_swaps (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        shift_id UUID NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
        requester_guard_id UUID NOT NULL REFERENCES guards(id) ON DELETE CASCADE,
        target_guard_id UUID,
        target_shift_id UUID REFERENCES shifts(id) ON DELETE SET NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        reason TEXT,
        admin_notes TEXT,
        approved_by UUID REFERENCES admins(id) ON DELETE SET NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        tenant_id UUID
      );
    `);
    console.log("   ✅ shift_swaps table created");

    // Create indexes
    await sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_shift_swaps_shift_id ON shift_swaps(shift_id);
      CREATE INDEX IF NOT EXISTS idx_shift_swaps_requester ON shift_swaps(requester_guard_id);
      CREATE INDEX IF NOT EXISTS idx_shift_swaps_status ON shift_swaps(status);
      CREATE INDEX IF NOT EXISTS idx_shift_swaps_tenant ON shift_swaps(tenant_id);
    `);
    console.log("   ✅ Indexes created");

    // 2. Guard Availability Preferences Table
    console.log("\n2. Creating guard_availability_prefs table...");
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS guard_availability_prefs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        guard_id UUID NOT NULL UNIQUE REFERENCES guards(id) ON DELETE CASCADE,
        preferred_days JSONB DEFAULT '[]',
        preferred_times JSONB DEFAULT '[]',
        blocked_dates JSONB DEFAULT '[]',
        min_hours_per_week INT DEFAULT 0,
        max_hours_per_week INT DEFAULT 40,
        location_preferences JSONB DEFAULT '[]',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        tenant_id UUID
      );
    `);
    console.log("   ✅ guard_availability_prefs table created");

    await sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_availability_prefs_guard ON guard_availability_prefs(guard_id);
      CREATE INDEX IF NOT EXISTS idx_availability_prefs_tenant ON guard_availability_prefs(tenant_id);
    `);
    console.log("   ✅ Indexes created");

    // 3. Add columns to shifts table for notes/reports
    console.log("\n3. Adding notes/reports columns to shifts table...");
    await sequelize.query(`
      ALTER TABLE shifts 
      ADD COLUMN IF NOT EXISTS notes TEXT,
      ADD COLUMN IF NOT EXISTS report_url TEXT,
      ADD COLUMN IF NOT EXISTS report_type TEXT,
      ADD COLUMN IF NOT EXISTS report_submitted_at TIMESTAMP,
      ADD COLUMN IF NOT EXISTS report_submitted_by UUID REFERENCES guards(id) ON DELETE SET NULL;
    `);
    console.log("   ✅ Notes/reports columns added to shifts");

    // 4. Shift Report Photos Table (for photo attachments)
    console.log("\n4. Creating shift_report_photos table...");
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS shift_report_photos (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        shift_id UUID NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
        photo_url TEXT NOT NULL,
        photo_type TEXT DEFAULT 'incident',
        description TEXT,
        uploaded_by UUID REFERENCES guards(id) ON DELETE SET NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        tenant_id UUID
      );
    `);
    console.log("   ✅ shift_report_photos table created");

    await sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_report_photos_shift ON shift_report_photos(shift_id);
      CREATE INDEX IF NOT EXISTS idx_report_photos_tenant ON shift_report_photos(tenant_id);
    `);
    console.log("   ✅ Indexes created");

    // 5. Shift History View (virtual - calculated from time_entries and shifts)
    console.log("\n5. Creating shift_history view...");
    await sequelize.query(`
      CREATE OR REPLACE VIEW shift_history AS
      SELECT 
        s.id,
        s.tenant_id,
        s.guard_id,
        s.shift_date,
        s.shift_start,
        s.shift_end,
        s.location,
        s.status,
        s.created_at,
        s.notes,
        s.report_url,
        s.report_type,
        s.report_submitted_at,
        te.clock_in_at,
        te.clock_out_at,
        te.lunch_start_at,
        te.lunch_end_at,
        CASE 
          WHEN te.clock_in_at IS NOT NULL AND te.clock_out_at IS NOT NULL 
          THEN EXTRACT(EPOCH FROM (te.clock_out_at - te.clock_in_at)) / 3600
          ELSE NULL
        END as hours_worked,
        g.name as guard_name,
        g.email as guard_email
      FROM shifts s
      LEFT JOIN time_entries te ON s.id = te.shift_id
      LEFT JOIN guards g ON s.guard_id = g.id
      WHERE s.status = 'CLOSED' OR te.clock_out_at IS NOT NULL;
    `);
    console.log("   ✅ shift_history view created");

    console.log("\n✅ All Shift Management tables created successfully!");
    console.log("\nTables created:");
    console.log("  - shift_swaps");
    console.log("  - guard_availability_prefs");
    console.log("  - shift_report_photos");
    console.log("  - shift_history (view)");
    console.log("  - Added columns to shifts table (notes, report_url, etc.)");

  } catch (error) {
    console.error("❌ Error creating tables:", error);
    throw error;
  }
}

// Run if called directly
if (require.main === module) {
  createShiftManagementTables()
    .then(() => {
      console.log("\n✅ Migration complete!");
      process.exit(0);
    })
    .catch((error) => {
      console.error("\n❌ Migration failed:", error);
      process.exit(1);
    })
    .finally(() => {
      sequelize.close();
    });
}

module.exports = { createShiftManagementTables };
