/**
 * Update shift locations to real addresses for weather/traffic alerts
 */

require("dotenv").config();
const { pool } = require("../config/db");

async function updateShiftLocations() {
  try {
    // Update test locations to real addresses (must be geocodable)
    // Format: "City, State" or recognized city name
    const updates = [
      { old: "Test Location 1", new: "New York, NY" },
      { old: "Test Location 2", new: "New York, NY" },
      { old: "Test Location 3", new: "New York, NY" },
      { old: "Test Location 4", new: "New York, NY" },
      { old: "Test Location 5", new: "New York, NY" },
      { old: "Main Office", new: "New York, NY" }, // Also update existing "Main Office" if any
    ];

    console.log("🔄 Updating shift locations...\n");

    for (const update of updates) {
      const result = await pool.query(
        `UPDATE shifts 
         SET location = $1 
         WHERE location = $2 
           AND status = 'OPEN'
           AND tenant_id = (SELECT tenant_id FROM guards WHERE email = 'john@abesecurity.com' LIMIT 1)
         RETURNING id, shift_date, location`,
        [update.new, update.old]
      );

      if (result.rows.length > 0) {
        result.rows.forEach((row) => {
          console.log(`✅ Updated: ${row.shift_date} → ${row.location}`);
        });
      }
    }

    console.log("\n✅ All locations updated!");
    console.log("💡 Refresh the guard-ui Shifts page to see weather/traffic alerts");

    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error("❌ Error:", error.message);
    process.exit(1);
  }
}

updateShiftLocations();
