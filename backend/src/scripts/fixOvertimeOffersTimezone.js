/**
 * Fix overtime_offers table timezone issue
 * Changes timestamp columns to TIMESTAMPTZ to properly handle timezones
 */
require("dotenv").config({ path: require("path").resolve(__dirname, "../../.env") });
const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

(async () => {
  try {
    console.log("🔧 Fixing overtime_offers timezone columns...");
    console.log("");

    // First, convert existing data: assume all existing timestamps are in UTC
    // We'll convert them to TIMESTAMPTZ by treating them as UTC
    console.log("Step 1: Converting existing data...");
    await pool.query(`
      UPDATE overtime_offers
      SET 
        current_end_time = (current_end_time AT TIME ZONE 'UTC')::timestamptz,
        proposed_end_time = (proposed_end_time AT TIME ZONE 'UTC')::timestamptz,
        expires_at = CASE 
          WHEN expires_at IS NOT NULL 
          THEN (expires_at AT TIME ZONE 'UTC')::timestamptz 
          ELSE NULL 
        END,
        guard_response_at = CASE 
          WHEN guard_response_at IS NOT NULL 
          THEN (guard_response_at AT TIME ZONE 'UTC')::timestamptz 
          ELSE NULL 
        END
      WHERE current_end_time IS NOT NULL;
    `);
    console.log("✅ Existing data converted");
    console.log("");

    // Now change the column types
    console.log("Step 2: Changing column types to TIMESTAMPTZ...");
    await pool.query(`
      ALTER TABLE overtime_offers
      ALTER COLUMN current_end_time TYPE timestamptz USING current_end_time,
      ALTER COLUMN proposed_end_time TYPE timestamptz USING proposed_end_time,
      ALTER COLUMN expires_at TYPE timestamptz USING expires_at,
      ALTER COLUMN guard_response_at TYPE timestamptz USING guard_response_at;
    `);
    console.log("✅ Column types changed to TIMESTAMPTZ");
    console.log("");

    // Verify the change
    const result = await pool.query(`
      SELECT 
        column_name,
        data_type,
        udt_name
      FROM information_schema.columns
      WHERE table_name = 'overtime_offers'
        AND column_name IN ('current_end_time', 'proposed_end_time', 'expires_at', 'guard_response_at')
      ORDER BY column_name;
    `);

    console.log("✅ Verification - Column types:");
    result.rows.forEach((col) => {
      console.log(`  ${col.column_name}: ${col.data_type} (${col.udt_name})`);
    });
    console.log("");

    console.log("✅ Migration complete!");
    console.log("");
    console.log("💡 Next steps:");
    console.log("  1. Update the INSERT query to use ISO strings directly");
    console.log("  2. PostgreSQL will automatically handle timezone conversion");
    console.log("  3. No more 5-hour offset issues!");

  } catch (error) {
    console.error("❌ Error fixing timezone columns:", error);
    process.exit(1);
  } finally {
    await pool.end();
  }
})();
