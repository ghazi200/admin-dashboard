/**
 * Run sequence: Clock In → On Break → (End Break / back to Clocked In) → Clock Out
 * DB-only: no API server required.
 * Usage: from backend: node src/scripts/runClockInBreakClockOut.js
 */
const path = require("path");
const fs = require("fs");
const envPath = path.resolve(__dirname, "../../.env");
if (fs.existsSync(envPath)) require("dotenv").config({ path: envPath });
else require("dotenv").config();

const { sequelize } = require("../models");

async function getShiftAndGuard() {
  const [rows] = await sequelize.query(`
    SELECT s.id AS shift_id, s.guard_id, s.shift_date, s.shift_start, s.shift_end, s.location,
           g.name AS guard_name, g.email AS guard_email
    FROM shifts s
    INNER JOIN guards g ON s.guard_id = g.id
    WHERE s.guard_id IS NOT NULL
    ORDER BY s.created_at DESC
    LIMIT 1
  `);
  return rows && rows[0] ? rows[0] : null;
}

async function getTimeEntry(shiftId, guardId) {
  const [rows] = await sequelize.query(
    `SELECT id, clock_in_at, clock_out_at, lunch_start_at, lunch_end_at
     FROM time_entries WHERE shift_id = $1 AND guard_id = $2 ORDER BY created_at DESC NULLS LAST LIMIT 1`,
    { bind: [shiftId, guardId] }
  );
  return rows && rows[0] ? rows[0] : null;
}

async function clockIn(shiftId, guardId) {
  const existing = await getTimeEntry(shiftId, guardId);
  const isClockedOut = existing && existing.clock_out_at && new Date(existing.clock_out_at) >= new Date(existing.clock_in_at);
  if (existing && !isClockedOut) {
    await sequelize.query(`UPDATE time_entries SET clock_in_at = NOW() WHERE id = $1`, { bind: [existing.id] });
    return { id: existing.id, clock_in_at: new Date() };
  }
  if (existing && isClockedOut) {
    await sequelize.query(
      `UPDATE time_entries SET clock_in_at = NOW(), clock_out_at = NULL WHERE id = $1`,
      { bind: [existing.id] }
    );
    return { id: existing.id, clock_in_at: new Date() };
  }
  const [out] = await sequelize.query(
    `INSERT INTO time_entries (id, shift_id, guard_id, clock_in_at, created_at)
     VALUES (gen_random_uuid(), $1, $2, NOW(), NOW())
     RETURNING id, clock_in_at`,
    { bind: [shiftId, guardId] }
  );
  return out[0];
}

async function startBreak(shiftId, guardId) {
  const existing = await getTimeEntry(shiftId, guardId);
  if (!existing) throw new Error("No time entry. Clock in first.");
  if (existing.lunch_start_at && !existing.lunch_end_at) return existing;
  await sequelize.query(`UPDATE time_entries SET lunch_start_at = NOW() WHERE id = $1`, { bind: [existing.id] });
  return { ...existing, lunch_start_at: new Date() };
}

async function endBreak(shiftId, guardId) {
  const existing = await getTimeEntry(shiftId, guardId);
  if (!existing || !existing.lunch_start_at || existing.lunch_end_at) throw new Error("Not on break.");
  await sequelize.query(`UPDATE time_entries SET lunch_end_at = NOW() WHERE id = $1`, { bind: [existing.id] });
  return { ...existing, lunch_end_at: new Date() };
}

async function clockOut(shiftId, guardId) {
  const existing = await getTimeEntry(shiftId, guardId);
  if (!existing) throw new Error("No time entry. Clock in first.");
  if (existing.clock_out_at && new Date(existing.clock_out_at) >= new Date(existing.clock_in_at))
    throw new Error("Already clocked out.");
  await sequelize.query(`UPDATE time_entries SET clock_out_at = NOW() WHERE id = $1`, { bind: [existing.id] });
  return { ...existing, clock_out_at: new Date() };
}

async function run() {
  try {
    await sequelize.authenticate();
    console.log("✅ DB connected\n");

    const shift = await getShiftAndGuard();
    if (!shift) {
      console.error("❌ No shift with assigned guard found.");
      process.exit(1);
    }
    console.log("📋 Shift:", shift.shift_id.substring(0, 8) + "...", "| Guard:", shift.guard_name || shift.guard_email);
    console.log("   Date:", shift.shift_date, "|", shift.shift_start, "-", shift.shift_end, "|", shift.location || "N/A");
    console.log("");

    // 1. Clock In
    console.log("1️⃣  CLOCK IN");
    const afterIn = await clockIn(shift.shift_id, shift.guard_id);
    console.log("   ✅ Clocked in at:", afterIn.clock_in_at?.toISOString?.() || new Date().toISOString());
    console.log("");

    // 2. On Break
    console.log("2️⃣  ON BREAK (start break)");
    await startBreak(shift.shift_id, shift.guard_id);
    const teBreak = await getTimeEntry(shift.shift_id, shift.guard_id);
    console.log("   ✅ Break started at:", teBreak?.lunch_start_at?.toISOString?.() || "—");
    console.log("");

    // 3. Back to Clocked In (end break)
    console.log("3️⃣  CLOCK IN AGAIN (end break / back to work)");
    await endBreak(shift.shift_id, shift.guard_id);
    const teBack = await getTimeEntry(shift.shift_id, shift.guard_id);
    console.log("   ✅ Break ended at:", teBack?.lunch_end_at?.toISOString?.() || "—");
    console.log("");

    // 4. Clock Out
    console.log("4️⃣  CLOCK OUT");
    await clockOut(shift.shift_id, shift.guard_id);
    const final = await getTimeEntry(shift.shift_id, shift.guard_id);
    console.log("   ✅ Clocked out at:", final?.clock_out_at?.toISOString?.() || "—");
    console.log("");

    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("✅ Done: Clock In → On Break → End Break → Clock Out");
    console.log("   Time entry id:", final?.id?.substring(0, 8) + "...");
    console.log("   Shift:", shift.shift_id.substring(0, 8) + "...");
  } catch (e) {
    console.error("❌", e.message);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

run();
