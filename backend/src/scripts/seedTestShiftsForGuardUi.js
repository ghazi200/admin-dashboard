/**
 * Create OPEN shifts in Postgres so guard-ui (Home / clock in-out) has data to show.
 *
 * Usage (from backend/):
 *   npm run seed:test-shift
 *   npm run seed:test-shift -- --email=bob@abe.com
 *   npm run seed:test-shift -- --email=bob@abe.com --days=3
 *
 * Env: DATABASE_URL or DB_* (same as server). Loads backend/.env automatically via config/db.
 */

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../../.env") });

const { sequelize } = require("../config/db");
const { v4: uuidv4 } = require("uuid");

function parseArgs() {
  const argv = process.argv.slice(2);
  let email = process.env.GUARD_TEST_EMAIL || null;
  let days = 1;
  for (const a of argv) {
    if (a.startsWith("--email=")) email = a.slice("--email=".length).trim() || null;
    else if (a.startsWith("--days=")) days = Math.min(14, Math.max(1, parseInt(a.slice("--days=".length), 10) || 1));
  }
  return { email, days };
}

/** YYYY-MM-DD in local timezone (matches what guards expect as “today”). */
function todayLocalISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDays(isoDateStr, n) {
  const [yy, mm, dd] = isoDateStr.split("-").map(Number);
  const d = new Date(yy, mm - 1, dd);
  d.setDate(d.getDate() + n);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

async function pickGuard(email) {
  if (email) {
    const [rows] = await sequelize.query(
      `SELECT id, name, email, tenant_id FROM guards WHERE LOWER(TRIM(email)) = LOWER(TRIM($1)) LIMIT 1`,
      { bind: [email] }
    );
    return rows[0] || null;
  }
  const [rows] = await sequelize.query(
    `SELECT id, name, email, tenant_id FROM guards ORDER BY email NULLS LAST, id LIMIT 1`
  );
  return rows[0] || null;
}

async function main() {
  const { email, days } = parseArgs();

  const guard = await pickGuard(email);
  if (!guard) {
    console.error(email ? `❌ No guard found for email: ${email}` : "❌ No guards in database.");
    console.log("   Create a guard in the admin dashboard first, or pass --email=guard@example.com");
    process.exitCode = 1;
    return;
  }

  console.log(`✅ Using guard: ${guard.name || "—"} <${guard.email || guard.id}>`);
  console.log(`   id=${guard.id}`);
  console.log(`   tenant_id=${guard.tenant_id || "null"}\n`);

  const baseDate = todayLocalISO();
  const created = [];

  for (let i = 0; i < days; i++) {
    const shiftDateStr = addDays(baseDate, i);
    const shiftId = uuidv4();
    const location = `Guard UI test shift (seeded ${baseDate})`;

    await sequelize.query(
      `INSERT INTO shifts (id, tenant_id, guard_id, shift_date, shift_start, shift_end, status, location, created_at)
       VALUES ($1, $2, $3, $4::date, $5::time, $6::time, 'OPEN', $7, NOW())`,
      {
        bind: [
          shiftId,
          guard.tenant_id || null,
          guard.id,
          shiftDateStr,
          "01:00:00",
          "23:59:00",
          location,
        ],
      }
    );

    created.push({ id: shiftId, date: shiftDateStr });
    console.log(`📅 Created OPEN shift ${shiftId}`);
    console.log(`   date=${shiftDateStr}  01:00–23:59  location=${location}\n`);
  }

  console.log("—".repeat(60));
  console.log("Next steps:");
  console.log("  1. Log in to guard-ui as this guard.");
  console.log("  2. Open Home — you should see the new shift(s).");
  console.log("  3. Clock in/out uses your Guard API host (often abe-guard-ai :4000 if not merged into admin-dashboard).");
  console.log("Shift IDs:", created.map((c) => c.id).join(", "));
}

main()
  .catch((e) => {
    console.error("❌ seedTestShiftsForGuardUi failed:", e.message);
    console.error(e.stack);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await sequelize.close();
    } catch (_) {}
  });
