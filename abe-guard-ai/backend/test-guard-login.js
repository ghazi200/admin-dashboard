#!/usr/bin/env node
/**
 * Test Guard API health and login. Run from abe-guard-ai/backend with server running:
 *   node test-guard-login.js
 * Uses guard bob@abe.com / password123 (create with CREATE_GUARD_USER.js if needed).
 */
const http = require("http");

const BASE = "http://127.0.0.1:4000";
const TEST_EMAIL = "bob@abe.com";
const TEST_PASSWORD = "password123";

function request(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE);
    const opts = {
      hostname: url.hostname,
      port: url.port || 4000,
      path: url.pathname,
      method,
      headers: { "Content-Type": "application/json" },
      timeout: 5000,
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
          resolve({ status: res.statusCode, data: json });
        } catch {
          resolve({ status: res.statusCode, data });
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
  console.log("Testing Guard API at", BASE);
  console.log("");

  try {
    const health = await request("GET", "/health");
    if (health.status !== 200) {
      console.log("FAIL /health status:", health.status);
      process.exit(1);
    }
    console.log("OK  GET /health ->", health.data);
  } catch (e) {
    console.log("FAIL GET /health:", e.message || e);
    console.log("   Ensure Guard API is running: cd abe-guard-ai/backend && node src/server.js");
    process.exit(1);
  }

  try {
    const login = await request("POST", "/auth/login", {
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
    });
    if (login.status !== 200) {
      console.log("FAIL POST /auth/login status:", login.status, login.data?.message || login.data);
      if (login.data?.message?.includes("not configured")) {
        console.log("   Create guard user: node CREATE_GUARD_USER.js (or similar script)");
      }
      process.exit(1);
    }
    const token = login.data?.token;
    if (!token) {
      console.log("FAIL POST /auth/login: no token in response");
      process.exit(1);
    }
    console.log("OK  POST /auth/login -> token received, length:", token.length);
  } catch (e) {
    console.log("FAIL POST /auth/login:", e.message || e);
    process.exit(1);
  }

  console.log("");
  console.log("All guard login tests passed.");
}

main();
