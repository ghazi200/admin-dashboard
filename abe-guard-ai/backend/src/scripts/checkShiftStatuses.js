/**
 * Check shift statuses to understand why 0 are available
 */

require("dotenv").config();
const { pool } = require("../config/db");

async function checkShiftStatuses() {
  try {
    // Get all shifts with their statuses
    const result = await pool.query(
      `SELECT 
        status,
        COUNT(*) as count,
        COUNT(CASE WHEN guard_id IS NULL THEN 1 END) as unassigned,
        COUNT(CASE WHEN guard_id IS NOT NULL THEN 1 END) as assigned
       FROM shifts
       GROUP BY status
       ORDER BY status`
    );

    console.log("📊 Shift Status Breakdown:");
    console.log("=".repeat(50));
    result.rows.forEach((row) => {
      console.log(`Status: ${row.status || 'NULL'}`);
      console.log(`  Total: ${row.count}`);
      console.log(`  Unassigned: ${row.unassigned}`);
      console.log(`  Assigned: ${row.assigned}`);
      console.log("");
    });

    // Get shifts for john@abesecurity.com
    const guardResult = await pool.query(
      `SELECT 
        s.status,
        COUNT(*) as count
       FROM shifts s
       JOIN guards g ON s.guard_id = g.id
       WHERE g.email = $1
       GROUP BY s.status
       ORDER BY s.status`,
      ["john@abesecurity.com"]
    );

    console.log("📊 Shifts for john@abesecurity.com:");
    console.log("=".repeat(50));
    guardResult.rows.forEach((row) => {
      console.log(`Status: ${row.status || 'NULL'} - Count: ${row.count}`);
    });

    // Get OPEN shifts
    const openResult = await pool.query(
      `SELECT COUNT(*) as count FROM shifts WHERE status = 'OPEN'`
    );
    console.log(`\n✅ OPEN shifts (available): ${openResult.rows[0].count}`);

    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error("❌ Error:", error.message);
    process.exit(1);
  }
}

checkShiftStatuses();
