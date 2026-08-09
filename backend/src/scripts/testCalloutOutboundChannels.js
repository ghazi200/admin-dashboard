#!/usr/bin/env node
/**
 * One-shot: email + SMS + voice callout outbound to a consented guard (default: Ghazi).
 *
 * Usage (from backend/):
 *   node src/scripts/testCalloutOutboundChannels.js
 *   node src/scripts/testCalloutOutboundChannels.js 3475307327
 *
 * Requires backend/.env Twilio + SMTP + DATABASE_URL.
 * Voice needs TWILIO_PHONE_NUMBER, PUBLIC_BASE_URL (https), CALLOUT_OUTBOUND_CALL=true.
 */
require("dotenv").config({ path: require("path").join(__dirname, "../../.env") });

const { Sequelize } = require("sequelize");
const {
  notifyRankedGuardsOutbound,
} = require("../services/guardCalloutOutbound.service");

async function main() {
  const phoneArg = process.argv[2];
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL missing");
    process.exit(1);
  }

  process.env.CALLOUT_OUTBOUND_EMAIL = process.env.CALLOUT_OUTBOUND_EMAIL || "true";
  process.env.CALLOUT_OUTBOUND_SMS = process.env.CALLOUT_OUTBOUND_SMS || "true";
  process.env.CALLOUT_OUTBOUND_CALL = "true";
  if (!process.env.TWILIO_PHONE_NUMBER && !process.env.TWILIO_FROM_NUMBER) {
    process.env.TWILIO_PHONE_NUMBER = "+18557942422";
  }
  if (!process.env.PUBLIC_BASE_URL) {
    process.env.PUBLIC_BASE_URL =
      "https://admin-dashboard-production-2596.up.railway.app";
  }

  console.log("--- Outbound channel config ---");
  console.log("EMAIL enabled:", process.env.CALLOUT_OUTBOUND_EMAIL !== "false");
  console.log("SMS enabled:", process.env.CALLOUT_OUTBOUND_SMS !== "false");
  console.log("CALL enabled:", process.env.CALLOUT_OUTBOUND_CALL === "true");
  console.log("TWILIO_PHONE_NUMBER:", process.env.TWILIO_PHONE_NUMBER || process.env.TWILIO_FROM_NUMBER);
  console.log("PUBLIC_BASE_URL:", process.env.PUBLIC_BASE_URL);
  console.log("SMTP_FROM:", process.env.SMTP_FROM || "(unset)");
  console.log("-------------------------------");

  const sequelize = new Sequelize(databaseUrl, {
    logging: false,
    dialectOptions: {
      ssl: { require: true, rejectUnauthorized: false },
    },
  });
  await sequelize.authenticate();

  const [guards] = await sequelize.query(
    `
    SELECT id, name, email, phone, communications_consent, is_active, tenant_id
    FROM guards
    WHERE is_active = true
      AND (
        lower(name) LIKE '%ghazi%'
        OR lower(email) LIKE '%techworldstarz%'
        OR lower(email) LIKE '%ghazi%'
      )
    LIMIT 1
    `
  );
  let guard = guards[0];
  if (!guard) {
    const [fallback] = await sequelize.query(
      `
      SELECT id, name, email, phone, communications_consent, is_active, tenant_id
      FROM guards
      WHERE is_active = true AND communications_consent = true AND coalesce(phone,'') <> ''
      ORDER BY name
      LIMIT 1
      `
    );
    guard = fallback[0];
  }
  if (!guard) {
    console.error("No active consented guard with a phone found.");
    process.exit(1);
  }

  if (phoneArg) {
    const digits = String(phoneArg).replace(/\D/g, "");
    const e164 =
      digits.length === 10
        ? `+1${digits}`
        : digits.length === 11 && digits.startsWith("1")
          ? `+${digits}`
          : `+${digits}`;
    await sequelize.query(`UPDATE guards SET phone = $1 WHERE id = $2`, {
      bind: [e164, guard.id],
    });
    guard.phone = e164;
  }

  if (!guard.communications_consent) {
    await sequelize.query(
      `UPDATE guards SET communications_consent = true, communications_consent_at = NOW() WHERE id = $1`,
      { bind: [guard.id] }
    );
    guard.communications_consent = true;
  }

  const [shifts] = await sequelize.query(
    `
    SELECT id, status, guard_id, location, shift_date, shift_start, shift_end, tenant_id
    FROM shifts
    WHERE tenant_id = $1 OR tenant_id IS NULL
    ORDER BY shift_date DESC NULLS LAST
    LIMIT 1
    `,
    { bind: [guard.tenant_id] }
  );
  const shift = shifts[0];
  if (!shift) {
    console.error("No shift found to attach callout metadata.");
    process.exit(1);
  }

  // Soft-open so voice press-1 can record pending accept; restore after window unless --keep-open
  const keepOpen = process.argv.includes("--keep-open");
  const prevStatus = shift.status;
  const prevGuard = shift.guard_id;
  await sequelize.query(
    `UPDATE shifts SET status = 'OPEN', guard_id = NULL, pending_guard_id = NULL, accept_pending_until = NULL WHERE id = $1`,
    { bind: [shift.id] }
  );

  console.log(`Target guard: ${guard.name} <${guard.email}> phone=${guard.phone}`);
  console.log(`Shift: ${shift.id} ${shift.location} ${shift.shift_date} ${shift.shift_start}-${shift.shift_end}`);

  const fakeApp = { locals: { models: { sequelize } } };
  const calloutId = require("crypto").randomUUID();

  // Persist callout row — /twilio/voice/gather looks this up on press 1/2
  await sequelize.query(
    `INSERT INTO callouts (id, tenant_id, shift_id, guard_id, reason, created_at)
     VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, NOW())
     ON CONFLICT (id) DO NOTHING`,
    {
      bind: [
        calloutId,
        guard.tenant_id,
        shift.id,
        guard.id,
        "TEST_OUTBOUND_CHANNELS",
      ],
    }
  );
  console.log(`Callout row: ${calloutId}`);

  const result = await notifyRankedGuardsOutbound(fakeApp, {
    shiftId: shift.id,
    reason: "TEST_OUTBOUND_CHANNELS",
    rankings: [
      {
        guardId: guard.id,
        guard_id: guard.id,
        rank: 1,
        reason: "Manual outbound channel test (email + SMS + voice)",
        calloutId,
      },
    ],
  });

  if (keepOpen) {
    console.log(
      "Shift left OPEN for voice accept test. Press 1 on the call, then check pending_guard_id."
    );
    console.log(`Restore later: status=${prevStatus} guard_id=${prevGuard || "null"}`);
  } else {
    // Delay restore so gather after press-1 can still see OPEN during a short call
    const restoreMs = Number(process.env.TEST_CALLOUT_RESTORE_MS || 90000);
    console.log(`Waiting ${restoreMs}ms before restoring shift (or use --keep-open)...`);
    await new Promise((r) => setTimeout(r, restoreMs));
    const [cur] = await sequelize.query(
      `SELECT status, pending_guard_id::text AS pending_guard_id, guard_id::text AS guard_id
       FROM shifts WHERE id = $1`,
      { bind: [shift.id] }
    );
    if (cur[0]?.pending_guard_id) {
      console.log(
        `Accept recorded pending_guard_id=${cur[0].pending_guard_id} — leaving shift as-is (not restoring).`
      );
    } else {
      await sequelize.query(
        `UPDATE shifts SET status = $1, guard_id = $2 WHERE id = $3`,
        { bind: [prevStatus, prevGuard, shift.id] }
      );
      console.log(`Restored shift status=${prevStatus} guard_id=${prevGuard || "null"}`);
    }
  }

  console.log("\n=== RESULT ===");
  console.log(
    JSON.stringify(
      {
        emailed: result.emailed,
        smsed: result.smsed,
        called: result.called,
        skipped: result.skipped,
        results: result.results,
      },
      null,
      2
    )
  );

  const entry = result.results?.[0] || {};
  const okEmail = entry.email?.success === true;
  const okSms = entry.sms?.sent === true;
  const okCall = entry.call?.placed === true;
  console.log("\nSummary:");
  console.log(`  Email: ${okEmail ? "OK" : "FAIL"} ${entry.email?.error || entry.email?.message || ""}`);
  console.log(`  SMS:   ${okSms ? "OK" : "FAIL"} ${entry.sms?.reason || entry.sms?.error || entry.sms?.sid || ""}`);
  console.log(`  Call:  ${okCall ? "OK" : "FAIL"} ${entry.call?.reason || entry.call?.error || entry.call?.sid || ""}`);

  await sequelize.close();
  if (!okEmail || !okSms || !okCall) process.exit(2);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
