#!/usr/bin/env node
/**
 * Test health, login, and rate limits. Run from backend/ with servers running:
 *   Admin: port 5000, Guard: port 4000
 * Usage: node scripts/test-health-login-ratelimit.js
 */
const http = require("http");

const ADMIN_BASE = "http://127.0.0.1:5000";
const GUARD_BASE = "http://127.0.0.1:4000";

function request(base, method, path, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, base);
    const opts = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method,
      headers: { "Content-Type": "application/json" },
      timeout: 8000,
    };
    if (body && (method === "POST" || method === "PUT")) {
      const data = JSON.stringify(body);
      opts.headers["Content-Length"] = Buffer.byteLength(data);
    }
    const req = http.request(opts, (res) => {
      let data = "";
      res.on("data", (ch) => (data += ch));
      res.on("end", () => {
        try {
          const json = data ? JSON.parse(data) : {};
          resolve({ status: res.statusCode, headers: res.headers, data: json });
        } catch {
          resolve({ status: res.statusCode, headers: res.headers, data });
        }
      });
    });
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("timeout"));
    });
    if (body && (method === "POST" || method === "PUT")) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function main() {
  console.log("=== Health, login, and rate-limit tests ===\n");

  // ---- Health (liveness) and readiness ----
  console.log("1. Health checks (liveness + readiness)");
  try {
    const adminHealth = await request(ADMIN_BASE, "GET", "/health");
    if (adminHealth.status === 200) {
      console.log("   Admin (5000) GET /health:", adminHealth.status, adminHealth.data);
    } else {
      console.log("   Admin (5000) GET /health:", adminHealth.status);
    }
    const adminReady = await request(ADMIN_BASE, "GET", "/health/ready");
    if (adminReady.status === 200) {
      console.log("   Admin (5000) GET /health/ready:", adminReady.status, adminReady.data);
    } else {
      console.log("   Admin (5000) GET /health/ready:", adminReady.status, adminReady.data?.error || adminReady.data);
    }
  } catch (e) {
    console.log("   Admin (5000): not reachable -", e.message);
  }
  try {
    const guardHealth = await request(GUARD_BASE, "GET", "/health");
    if (guardHealth.status === 200) {
      console.log("   Guard (4000) GET /health:", guardHealth.status, guardHealth.data);
    } else {
      console.log("   Guard (4000) GET /health:", guardHealth.status);
    }
    const guardReady = await request(GUARD_BASE, "GET", "/health/ready");
    if (guardReady.status === 200) {
      console.log("   Guard (4000) GET /health/ready:", guardReady.status, guardReady.data);
    } else {
      console.log("   Guard (4000) GET /health/ready:", guardReady.status, guardReady.data?.error || guardReady.data);
    }
  } catch (e) {
    console.log("   Guard (4000): not reachable -", e.message);
  }
  console.log("");

  // ---- Login validation (expect 400 for invalid/empty) ----
  console.log("2. Login validation");
  try {
    const emptyRes = await request(ADMIN_BASE, "POST", "/api/admin/login", {});
    if (emptyRes.status === 400) {
      console.log("   Admin login (empty body): 400 as expected:", emptyRes.data?.message || "");
    } else {
      console.log("   Admin login (empty body):", emptyRes.status, emptyRes.data?.message || emptyRes.data);
    }
    const badEmailRes = await request(ADMIN_BASE, "POST", "/api/admin/login", {
      email: "not-an-email",
      password: "anything",
    });
    if (badEmailRes.status === 400) {
      console.log("   Admin login (invalid email): 400 as expected:", badEmailRes.data?.message || "");
    } else {
      console.log("   Admin login (invalid email):", badEmailRes.status, badEmailRes.data?.message || "(validation or 401)");
    }
  } catch (e) {
    console.log("   Admin login request failed:", e.message);
  }
  try {
    const emptyRes = await request(GUARD_BASE, "POST", "/auth/login", {});
    if (emptyRes.status === 400) {
      console.log("   Guard login (empty body): 400 as expected:", emptyRes.data?.message || "");
    } else {
      console.log("   Guard login (empty body):", emptyRes.status, emptyRes.data?.message || emptyRes.data);
    }
  } catch (e) {
    console.log("   Guard login request failed:", e.message);
  }
  console.log("");

  // ---- Rate limit: send 12 login requests (default limit 10), expect 429 ----
  console.log("3. Rate limit (12 POST /api/admin/login from same IP, expect 429 after limit)");
  let lastStatus = 0;
  let rateLimited = false;
  try {
    for (let i = 0; i < 12; i++) {
      const res = await request(ADMIN_BASE, "POST", "/api/admin/login", {
        email: "rate-limit-test@test.com",
        password: "test",
      });
      lastStatus = res.status;
      if (res.status === 429) {
        rateLimited = true;
        console.log("   Request", i + 1, "-> 429 (rate limited). Message:", res.data?.message || res.data);
        break;
      }
    }
    if (rateLimited) {
      console.log("   Rate limit test PASSED (received 429).");
    } else {
      console.log("   Last status:", lastStatus, "- Rate limit may not have kicked in (limit is 10/15min).");
    }
  } catch (e) {
    console.log("   Rate limit test request failed:", e.message);
  }
  console.log("");

  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
