#!/usr/bin/env node
/**
 * Fire a real callout (opens shift, ranks guards, DB rows, SMS/email/app notify).
 *
 * Usage (abe-guard-ai root, port 4000):
 *   node scripts/trigger-callout-test.js <shift-uuid>
 *
 * Remote:
 *   CALLOUT_BASE_URL=https://your-abe-guard-ai.up.railway.app node scripts/trigger-callout-test.js <shift-uuid>
 *
 * Optional env:
 *   CALLER_GUARD_UUID=...  — exclude this guard from ranking
 *   TENANT_UUID=...
 *   REASON=SICK|EMERGENCY|PERSONAL
 *
 * Note: POST /callouts/trigger is currently unauthenticated on abe-guard-ai — lock this down in production.
 */

const axios = require("axios");

async function main() {
  const shiftId = process.argv[2];
  if (!shiftId || !/^[0-9a-f-]{36}$/i.test(shiftId)) {
    console.error("Usage: node scripts/trigger-callout-test.js <shift-uuid>");
    process.exit(1);
  }

  const base = (process.env.CALLOUT_BASE_URL || "http://127.0.0.1:4000").replace(/\/+$/, "");
  const url = `${base}/callouts/trigger`;

  const body = {
    shiftId,
    reason: process.env.REASON || "SICK",
    ...(process.env.CALLER_GUARD_UUID ? { callerGuardId: process.env.CALLER_GUARD_UUID } : {}),
    ...(process.env.TENANT_UUID ? { tenantId: process.env.TENANT_UUID } : {}),
  };

  console.log("POST", url, JSON.stringify(body, null, 2));

  try {
    const { data, status } = await axios.post(url, body, {
      timeout: 120000,
      headers: { "Content-Type": "application/json" },
      validateStatus: () => true,
    });
    console.log("Status:", status);
    console.log(JSON.stringify(data, null, 2));
    if (status >= 400) process.exit(1);
  } catch (e) {
    console.error(e.response?.data || e.message);
    process.exit(1);
  }
}

main();
