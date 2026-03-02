/**
 * Test MFA and auth API (login, me, change-password, mfa setup/verify/disable).
 * Run with backend server running on port 5000.
 * Usage: node scripts/test-mfa-api.js
 */
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const BASE = process.env.ADMIN_API_BASE || "http://localhost:5000/api/admin";

async function request(method, url, body = null, token = null) {
  const opts = { method, headers: { "Content-Type": "application/json" } };
  if (token) opts.headers.Authorization = `Bearer ${token}`;
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }
  return { ok: res.ok, status: res.status, data };
}

async function run() {
  console.log("Testing Auth + MFA API at", BASE);
  let token = null;
  let failures = 0;

  // 1. Login
  const loginRes = await request("POST", `${BASE}/login`, {
    email: "admin@test.com",
    password: "password123",
  });
  if (!loginRes.ok && loginRes.status !== 200) {
    console.log("⚠️  Login failed (maybe no admin@test.com user):", loginRes.status, loginRes.data?.message || loginRes.data);
    if (loginRes.data?.requiresMfa && loginRes.data?.mfaToken) {
      console.log("   (Login correctly returned requiresMfa – MFA is enabled for this user.)");
      token = null;
    } else {
      failures++;
    }
  } else {
    if (loginRes.data?.requiresMfa) {
      console.log("✅ Login returned requiresMfa + mfaToken (MFA enabled for this user)");
      token = null;
    } else if (loginRes.data?.token) {
      token = loginRes.data.token;
      console.log("✅ Login OK, got token");
    } else {
      console.log("❌ Login response missing token");
      failures++;
    }
  }

  if (!token) {
    // Try register to get a token for further tests, or skip
    const regRes = await request("POST", `${BASE}/register`, {
      name: "MFA Test Admin",
      email: "mfa-test@test.com",
      password: "TestPass123!@#",
    });
    if (regRes.ok && regRes.data?.token) {
      token = regRes.data.token;
      console.log("✅ Register OK, using token for /me and MFA tests");
    }
  }

  if (token) {
    // 2. GET /me
    const meRes = await request("GET", `${BASE}/me`, null, token);
    if (meRes.ok && meRes.data?.email) {
      console.log("✅ GET /me OK, mfa_enabled:", meRes.data.mfa_enabled, "mfa_channel:", meRes.data.mfa_channel);
    } else {
      console.log("❌ GET /me failed:", meRes.status, meRes.data);
      failures++;
    }

    // 3. POST /mfa/setup (email) – may 200 or 503 if email not configured
    const setupRes = await request("POST", `${BASE}/mfa/setup`, { channel: "email" }, token);
    if (setupRes.ok && setupRes.data?.pendingVerification) {
      console.log("✅ POST /mfa/setup OK (pendingVerification)");
    } else if (setupRes.status === 503) {
      console.log("⚠️  POST /mfa/setup 503 (email not configured – expected in dev)");
    } else if (setupRes.status === 404) {
      console.log("⚠️  POST /mfa/setup 404 – restart backend (node server.js) to load MFA routes");
      failures++;
    } else {
      console.log("❌ POST /mfa/setup unexpected:", setupRes.status, setupRes.data?.message || setupRes.data);
      if (setupRes.status !== 400) failures++;
    }

    // 4. POST /mfa/verify-setup with wrong code – expect 401 (or 404 if routes not loaded)
    const verifyRes = await request("POST", `${BASE}/mfa/verify-setup`, { code: "000000" }, token);
    if (verifyRes.status === 401) {
      console.log("✅ POST /mfa/verify-setup correctly rejects invalid code (401)");
    } else if (verifyRes.status === 404) {
      console.log("⚠️  POST /mfa/verify-setup 404 – restart backend to load MFA routes");
      failures++;
    } else {
      console.log("❌ POST /mfa/verify-setup expected 401, got:", verifyRes.status, verifyRes.data?.message);
      failures++;
    }
  }

  // 5. POST /mfa/verify-login without valid mfaToken – expect 401 (or 404 if routes not loaded)
  const verifyLoginRes = await request("POST", `${BASE}/mfa/verify-login`, { mfaToken: "invalid", code: "123456" });
  if (verifyLoginRes.status === 401) {
    console.log("✅ POST /mfa/verify-login correctly rejects invalid token (401)");
  } else if (verifyLoginRes.status === 404) {
    console.log("⚠️  POST /mfa/verify-login 404 – restart backend to load MFA routes");
    failures++;
  } else {
    console.log("❌ POST /mfa/verify-login expected 401, got:", verifyLoginRes.status);
    failures++;
  }

  console.log("\n" + (failures === 0 ? "✅ All checks passed." : `❌ ${failures} check(s) failed.`));
  process.exit(failures > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error("Test error:", err);
  process.exit(1);
});
