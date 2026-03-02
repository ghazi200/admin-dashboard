/**
 * One-off: Clock out Bob (Bob Smith / bob@abe.com) and cancel his pending overtime.
 * Clocks out ALL active time_entries for this guard so "Offer OT" cards disappear.
 *
 * Run from backend folder: node src/scripts/clockOutBobAndStopOvertime.js
 * Optional: GUARD_EMAIL=other@example.com node src/scripts/clockOutBobAndStopOvertime.js
 */
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../../.env") });
const { sequelize } = require("../models");

const GUARD_EMAIL = process.env.GUARD_EMAIL || "bob@abe.com";

async function main() {
  console.log("\n--- Clock out Bob & stop overtime (test cleanup) ---\n");

  try {
    // Find guard by email (case-insensitive) or by name "Bob Smith"
    const [guardRows] = await sequelize.query(
      `SELECT id, name, email FROM guards
       WHERE LOWER(TRIM(email)) = LOWER(TRIM($1))
          OR (name IS NOT NULL AND LOWER(name) LIKE '%bob%smith%')
       LIMIT 5`,
      { bind: [GUARD_EMAIL] }
    );
    if (guardRows.length === 0) {
      console.log("No guard found with email", GUARD_EMAIL, "or name like 'Bob Smith'.");
      process.exit(1);
    }
    // Use first match; if multiple Bob Smiths, run script per guard or set GUARD_EMAIL
    const guard = guardRows[0];
    console.log("Guard:", guard.name || guard.email, "(" + guard.email + ") id:", guard.id);

    // 1) Clock out ALL active time entries for this guard (no clock_out_at or clock_out_at < clock_in_at)
    const [timeRows] = await sequelize.query(
      `SELECT id, shift_id, clock_in_at, clock_out_at
       FROM time_entries
       WHERE guard_id = $1
         AND clock_in_at IS NOT NULL
         AND (clock_out_at IS NULL OR clock_out_at < clock_in_at)`,
      { bind: [guard.id] }
    );

    if (timeRows.length === 0) {
      console.log("No active clock-in found for this guard (already clocked out or no time entry).");
    } else {
      const [updateResult] = await sequelize.query(
        `UPDATE time_entries
         SET clock_out_at = NOW()
         WHERE guard_id = $1
           AND clock_in_at IS NOT NULL
           AND (clock_out_at IS NULL OR clock_out_at < clock_in_at)
         RETURNING id`,
        { bind: [guard.id] }
      );
      console.log("Clocked out", updateResult.length, "time entry(ies):", updateResult.map((r) => r.id).join(", "));
    }

    // 2) Cancel any pending/requested overtime for this guard
    const [offers] = await sequelize.query(
      `SELECT id, shift_id, status FROM overtime_offers WHERE guard_id = $1 AND status IN ('pending', 'requested')`,
      { bind: [guard.id] }
    );
    if (offers.length === 0) {
      console.log("No pending or requested overtime for this guard.");
    } else {
      await sequelize.query(
        `UPDATE overtime_offers SET status = 'cancelled' WHERE guard_id = $1 AND status IN ('pending', 'requested')`,
        { bind: [guard.id] }
      );
      console.log("Cancelled", offers.length, "overtime offer(s).");
    }

    console.log("\nDone. Refresh the admin dashboard to see Bob in 'Clocked out' (Offer OT cards should be gone).\n");
  } catch (e) {
    console.error("Error:", e.message);
    if (e.stack) console.error(e.stack);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

main();
