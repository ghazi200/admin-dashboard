#!/usr/bin/env node
/**
 * Delete guards that do not match "keep" patterns (substring match on email + name).
 * Clears dependent rows so FK constraints succeed. Same DB as admin-dashboard (abe_guard / Railway).
 *
 * Usage:
 *   DRY_RUN=1 node scripts/pruneTestGuards.js
 *   CONFIRM_PRUNE=yes node scripts/pruneTestGuards.js
 *
 * Env:
 *   KEEP_GUARD_EMAIL_PATTERNS — comma-separated substrings (case-insensitive), default:
 *     bob@,ghazi,techworldstarz,alice@,carlos@,@abe.com,@abesecurity.com
 *   KEEP_GUARD_IDS — extra UUIDs to always keep (comma-separated)
 *   DRY_RUN=1 — list keep/delete only, no writes
 *   CONFIRM_PRUNE=yes — required for actual DELETE
 */

require("../src/loadEnv");
const { sequelize } = require("../src/config/db");

/** Substrings matched against lowercased email + name (space-separated). */
const DEFAULT_KEEP_PATTERNS = [
  "bob@",
  "ghazi",
  "techworldstarz",
  "alice@",
  "carlos@",
  "@abe.com",
  "@abesecurity.com",
];

function parseList(envVal, fallback) {
  if (!envVal || !String(envVal).trim()) return [...fallback];
  return String(envVal)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function matchesKeep(guard, patterns, extraIds) {
  if (extraIds.has(guard.id)) return true;
  const email = (guard.email || "").toLowerCase();
  const name = (guard.name || "").toLowerCase();
  const hay = `${email} ${name}`;
  return patterns.some((p) => hay.includes(p.toLowerCase()));
}

async function runOptional(sql, bind, t) {
  try {
    const [, meta] = await sequelize.query(sql, { bind, transaction: t });
    return meta?.rowCount ?? 0;
  } catch (e) {
    const c = e?.parent?.code;
    if (c === "42P01" || c === "42703" || c === "42883") return 0; // missing table/column / type mismatch
    throw e;
  }
}

async function pruneDependentRows(ids, t) {
  if (!ids.length) return;

  const bind = [ids];

  const deletes = [
    // Messaging / reads (admin backend)
    [`DELETE FROM message_reads WHERE reader_type = 'guard' AND reader_id = ANY($1::uuid[])`, bind],
    [`DELETE FROM message_hidden WHERE reader_type = 'guard' AND reader_id = ANY($1::uuid[])`, bind],
    [`DELETE FROM messages WHERE sender_type = 'guard' AND sender_id = ANY($1::uuid[])`, bind],
    [`DELETE FROM conversation_participants WHERE participant_type = 'guard' AND participant_id = ANY($1::uuid[])`, bind],

    [`DELETE FROM shift_swaps WHERE requester_guard_id = ANY($1::uuid[]) OR target_guard_id = ANY($1::uuid[])`, bind],
    [`DELETE FROM guard_availability_prefs WHERE guard_id = ANY($1::uuid[])`, bind],
    [`DELETE FROM schedule_email_logs WHERE guard_id = ANY($1::uuid[])`, bind],
    [`DELETE FROM schedule_email_preferences WHERE guard_id = ANY($1::uuid[])`, bind],

    // availability_logs.guardId is integer in some DBs — do not compare to UUID; legacy rows are unrelated to current guards.

    [`DELETE FROM notifications WHERE guard_id = ANY($1::uuid[])`, bind],
    [`DELETE FROM "ContactPreferences" WHERE "guardId" = ANY($1::uuid[])`, bind],

    // abe-guard-ai + shared payroll / ops
    [`UPDATE ai_decisions SET selected_guard_id = NULL WHERE selected_guard_id = ANY($1::uuid[])`, bind],
    [`DELETE FROM callouts WHERE guard_id = ANY($1::uuid[])`, bind],
    [`DELETE FROM guard_notifications WHERE guard_id = ANY($1::uuid[])`, bind],
    [`DELETE FROM announcement_reads WHERE guard_id = ANY($1::uuid[])`, bind],
    [`DELETE FROM emergency_events WHERE guard_id = ANY($1::uuid[])`, bind],
    [`DELETE FROM emergency_contacts WHERE guard_id = ANY($1::uuid[])`, bind],
    [`DELETE FROM inspection_submissions WHERE guard_id = ANY($1::uuid[])`, bind],
    [`DELETE FROM inspection_requests WHERE guard_id = ANY($1::uuid[])`, bind],
    [`DELETE FROM incidents WHERE guard_id = ANY($1::uuid[])`, bind],
    [`DELETE FROM time_entries WHERE guard_id = ANY($1::uuid[])`, bind],
    [`DELETE FROM shift_time_entries WHERE guard_id = ANY($1::uuid[])`, bind],
    [`DELETE FROM clock_in_verifications WHERE guard_id = ANY($1::uuid[])`, bind],
    [`DELETE FROM guard_reputation WHERE guard_id = ANY($1::uuid[])`, bind],
    [`DELETE FROM timesheet_lines WHERE timesheet_id IN (SELECT id FROM timesheets WHERE guard_id = ANY($1::uuid[]))`, bind],
    [`DELETE FROM timesheets WHERE guard_id = ANY($1::uuid[])`, bind],
    [`DELETE FROM pay_stubs WHERE guard_id = ANY($1::uuid[])`, bind],
    [`DELETE FROM payroll_adjustments WHERE guard_id = ANY($1::uuid[])`, bind],
  ];

  let total = 0;
  for (const [sql, b] of deletes) {
    const n = await runOptional(sql, b, t);
    total += n;
  }

  await sequelize.query(
    `UPDATE shifts SET guard_id = NULL WHERE guard_id = ANY($1::uuid[])`,
    { bind, transaction: t }
  );
  await sequelize.query(
    `UPDATE shifts SET report_submitted_by = NULL WHERE report_submitted_by = ANY($1::uuid[])`,
    { bind, transaction: t }
  );

  return total;
}

async function main() {
  await sequelize.authenticate();

  const patterns = parseList(process.env.KEEP_GUARD_EMAIL_PATTERNS, DEFAULT_KEEP_PATTERNS);
  const extraIds = new Set(
    parseList(process.env.KEEP_GUARD_IDS, []).filter((id) => /^[0-9a-f-]{36}$/i.test(id))
  );
  const dryRun = String(process.env.DRY_RUN || "").toLowerCase() === "1" || String(process.env.DRY_RUN || "").toLowerCase() === "true";
  const confirm = String(process.env.CONFIRM_PRUNE || "").toLowerCase() === "yes";

  const [rows] = await sequelize.query(
    `SELECT id, name, email, created_at::text AS created_at FROM guards ORDER BY created_at NULLS LAST, name`
  );

  const keep = [];
  const del = [];
  for (const g of rows) {
    if (matchesKeep(g, patterns, extraIds)) keep.push(g);
    else del.push(g);
  }

  console.log("Keep patterns:", patterns.join(", "));
  if (extraIds.size) console.log("Extra keep IDs:", [...extraIds].join(", "));
  console.log(`Guards to keep: ${keep.length}`);
  keep.forEach((g) => console.log(`  KEEP ${g.id}  ${g.name}  <${g.email || ""}>`));
  console.log(`Guards to delete: ${del.length}`);
  del.slice(0, 50).forEach((g) => console.log(`  DEL  ${g.id}  ${g.name}  <${g.email || ""}>`));
  if (del.length > 50) console.log(`  ... and ${del.length - 50} more`);

  if (del.length === 0) {
    console.log("Nothing to delete.");
    await sequelize.close();
    return;
  }

  if (dryRun) {
    console.log("\nDRY_RUN: no changes. Run with CONFIRM_PRUNE=yes to apply.");
    await sequelize.close();
    return;
  }

  if (!confirm) {
    console.error("\nRefusing to delete without CONFIRM_PRUNE=yes (and omit DRY_RUN).");
    process.exitCode = 1;
    await sequelize.close();
    return;
  }

  const ids = del.map((g) => g.id);
  const t = await sequelize.transaction();
  try {
    await pruneDependentRows(ids, t);
    const [, meta] = await sequelize.query(`DELETE FROM guards WHERE id = ANY($1::uuid[])`, {
      bind: [ids],
      transaction: t,
    });
    await t.commit();
    console.log(`\nDeleted ${meta?.rowCount ?? del.length} guards.`);
  } catch (e) {
    await t.rollback();
    console.error("Prune failed:", e.message);
    if (e?.parent?.detail) console.error(e.parent.detail);
    process.exitCode = 1;
  }

  await sequelize.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
