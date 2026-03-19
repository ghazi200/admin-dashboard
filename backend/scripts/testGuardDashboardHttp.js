#!/usr/bin/env node
/**
 * Integration check: POST /auth/login then GET /api/guard/dashboard
 *
 * Usage:
 *   cd backend && node scripts/testGuardDashboardHttp.js
 *   TEST_BASE=https://your-app.up.railway.app node scripts/testGuardDashboardHttp.js
 *
 * Requires: server running (local or TEST_BASE), DATABASE_URL + JWT_SECRET, guard bob@abe.com (or change creds below)
 */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const axios = require("axios");

const BASE = (process.env.TEST_BASE || "http://127.0.0.1:5000").replace(/\/+$/, "");
const EMAIL = process.env.TEST_GUARD_EMAIL || "bob@abe.com";
const PASSWORD = process.env.TEST_GUARD_PASSWORD || "password123";

async function main() {
  console.log("Base URL:", BASE);

  const loginRes = await axios.post(
    `${BASE}/auth/login`,
    { email: EMAIL, password: PASSWORD },
    { validateStatus: () => true, timeout: 60000 }
  );
  if (loginRes.status < 200 || loginRes.status >= 300 || !loginRes.data?.token) {
    console.error("Login failed:", loginRes.status, loginRes.data);
    process.exit(1);
  }
  const token = loginRes.data.token;
  console.log("Login OK, guard id:", loginRes.data.guard?.id || loginRes.data.user?.id);

  const dashRes = await axios.get(`${BASE}/api/guard/dashboard`, {
    headers: { Authorization: `Bearer ${token}` },
    validateStatus: () => true,
    timeout: 60000,
  });

  if (dashRes.status !== 200) {
    console.error("Dashboard failed:", dashRes.status, dashRes.data);
    process.exit(1);
  }

  const d = dashRes.data;
  const keys = ["upcomingShifts", "performance", "earnings", "achievements", "streaks"];
  const missing = keys.filter((k) => d[k] === undefined);
  if (missing.length) {
    console.error("Missing keys in response:", missing);
    process.exit(1);
  }

  console.log("Dashboard OK — keys:", keys.join(", "));
  console.log("  upcomingShifts:", Array.isArray(d.upcomingShifts) ? d.upcomingShifts.length : "?");
  console.log("  performance.overallScore:", d.performance?.overallScore);
  process.exit(0);
}

main().catch((e) => {
  console.error(e.response?.data || e.message);
  process.exit(1);
});
