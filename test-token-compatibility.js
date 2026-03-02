#!/usr/bin/env node
/**
 * Token compatibility test (Step 2).
 * 1. Login to abe-guard-ai (4000) as guard → get token
 * 2. Call admin-dashboard (5000) guard API with that token
 * 3. Report: 200 = compatible, 401 = not compatible (different JWT secret or payload)
 *
 * Requires both backends running. Env: GUARD_EMAIL, GUARD_PASSWORD (optional: GUARD_API_URL_4000, ADMIN_API_URL_5000)
 */

const GUARD_API = process.env.GUARD_API_URL_4000 || "http://localhost:4000";
const ADMIN_API = process.env.ADMIN_API_URL_5000 || "http://localhost:5000";
const EMAIL = process.env.GUARD_EMAIL || "";
const PASSWORD = process.env.GUARD_PASSWORD || "";

async function main() {
  console.log("Token compatibility test (4000 → 5000)\n");
  console.log("  Guard API (4000):", GUARD_API);
  console.log("  Admin API (5000):", ADMIN_API);

  if (!EMAIL || !PASSWORD) {
    console.log("\n  ⚠️  Set GUARD_EMAIL and GUARD_PASSWORD to run this test.");
    console.log("  Example: GUARD_EMAIL=guard@example.com GUARD_PASSWORD=secret node test-token-compatibility.js");
    process.exit(1);
  }

  let token;
  try {
    const loginRes = await fetch(`${GUARD_API}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
    });
    const loginData = await loginRes.json().catch(() => ({}));
    if (!loginRes.ok) {
      console.log("\n  ❌ Login to 4000 failed:", loginRes.status, loginData.message || loginData);
      if (loginRes.status === 401) {
        console.log("     Use a real guard account from abe-guard-ai (guards table). Example:");
        console.log("     GUARD_EMAIL=yourguard@example.com GUARD_PASSWORD=yourpass node test-token-compatibility.js");
      }
      process.exit(1);
    }
    token = loginData.token;
    if (!token) {
      console.log("\n  ❌ No token in login response");
      process.exit(1);
    }
    console.log("  ✅ Got token from 4000 (guard login)");
  } catch (e) {
    console.log("\n  ❌ Could not reach 4000:", e.message || e.code || e);
    console.log("     Make sure abe-guard-ai backend is running on port 4000.");
    process.exit(1);
  }

  try {
    const msgRes = await fetch(`${ADMIN_API}/api/guard/messages/conversations`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });
    if (msgRes.status === 200) {
      console.log("  ✅ 5000 accepted 4000 token (GET /api/guard/messages/conversations) → 200");
      console.log("\n  Result: TOKEN COMPATIBLE. Guard can use one token for both backends.");
      process.exit(0);
    }
    const errBody = await msgRes.json().catch(() => ({}));
    console.log("  ❌ 5000 rejected 4000 token:", msgRes.status, errBody.message || errBody);
    console.log("\n  Result: TOKEN NOT COMPATIBLE. 5000 uses a different JWT_SECRET or expects different payload.");
    console.log("  See GUARD_UI_COMPLETION_TASKS.md § 1 for fix options.");
    process.exit(1);
  } catch (e) {
    console.log("\n  ❌ Could not reach 5000:", e.message || e.code || e);
    console.log("     Make sure admin-dashboard backend is running on port 5000.");
    process.exit(1);
  }
}

main();
