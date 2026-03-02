#!/usr/bin/env node
/**
 * Start backend on PORT 5001, run test-mfa-api.js against it, then exit.
 * Use when you want to test MFA routes without restarting your main server on 5000.
 * Usage: node scripts/run-test-with-server.js
 */
const { spawn } = require("child_process");
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const PORT = 5001;
const BASE = `http://localhost:${PORT}/api/admin`;
const server = spawn("node", ["server.js"], {
  cwd: path.resolve(__dirname, ".."),
  env: { ...process.env, PORT: String(PORT) },
  stdio: ["ignore", "pipe", "pipe"],
});

let serverReady = false;
server.stdout.on("data", (chunk) => {
  const s = chunk.toString();
  if (s.includes("running on port") || s.includes("listening")) serverReady = true;
});
server.stderr.on("data", (chunk) => {
  const s = chunk.toString();
  if (s.includes("running on port") || s.includes("listening")) serverReady = true;
});

function waitForServer(ms) {
  return new Promise((resolve) => {
    const t = setInterval(() => {
      if (serverReady) {
        clearInterval(t);
        resolve();
      }
    }, 200);
    setTimeout(() => {
      clearInterval(t);
      resolve();
    }, ms);
  });
}

async function main() {
  await waitForServer(12000);
  const test = spawn("node", ["scripts/test-mfa-api.js"], {
    cwd: path.resolve(__dirname, ".."),
    env: { ...process.env, ADMIN_API_BASE: BASE },
    stdio: "inherit",
  });
  const code = await new Promise((resolve) => test.on("close", resolve));
  server.kill("SIGTERM");
  process.exit(code);
}

main().catch((err) => {
  console.error(err);
  server.kill("SIGTERM");
  process.exit(1);
});
