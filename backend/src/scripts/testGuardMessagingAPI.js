/**
 * Test Guard Messaging API (GET conversations, GET messages, POST message)
 * Requires: backend server running on port 5000, at least one guard in DB.
 *
 * Usage: node src/scripts/testGuardMessagingAPI.js
 * Optional: GUARD_EMAIL=bob@abe.com node src/scripts/testGuardMessagingAPI.js
 *
 * To see ADMIN messages as this guard: In Admin Messages create a group and ADD this
 * guard (select them in "Add participants" or when creating the group). Then send a
 * message from Admin Messages. This guard will see it when opening that conversation
 * in Guard view (polling every 3s).
 */

const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../../.env") });
const http = require("http");
const jwt = require("jsonwebtoken");

const API_BASE_URL = process.env.API_URL || "http://localhost:5000";
const GUARD_EMAIL = process.env.GUARD_EMAIL || null;

const colors = { reset: "\x1b[0m", green: "\x1b[32m", red: "\x1b[31m", yellow: "\x1b[33m", cyan: "\x1b[36m", blue: "\x1b[34m" };
function log(msg, c = "reset") {
  console.log(`${colors[c]}${msg}${colors.reset}`);
}

function makeRequest(method, pathName, data = null, token = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(pathName, API_BASE_URL);
    const options = { method, headers: { "Content-Type": "application/json" } };
    if (token) options.headers["Authorization"] = `Bearer ${token}`;
    if (data) options.body = JSON.stringify(data);

    const req = http.request(
      url,
      options,
      (res) => {
        let body = "";
        res.on("data", (chunk) => { body += chunk; });
        res.on("end", () => {
          try {
            resolve({ status: res.statusCode, body: body ? JSON.parse(body) : {} });
          } catch {
            resolve({ status: res.statusCode, body });
          }
        });
      }
    );
    req.on("error", reject);
    if (data) req.write(JSON.stringify(data));
    req.end();
  });
}

async function getGuardToken() {
  const models = require("../models");
  const { Guard } = models;
  const where = GUARD_EMAIL ? { email: GUARD_EMAIL } : {};
  const guard = await Guard.findOne({ where, attributes: ["id", "email", "name", "tenant_id"] });
  if (!guard) {
    log("No guard found in database. Create a guard or set GUARD_EMAIL.", "red");
    process.exit(1);
  }
  const token = jwt.sign(
    { guardId: guard.id, tenant_id: guard.tenant_id || null, role: "guard" },
    process.env.JWT_SECRET,
    { expiresIn: "1h" }
  );
  return { token, guard };
}

async function main() {
  log("\n═══════════════════════════════════════════════════════", "blue");
  log("🧪 Guard Messaging API Test", "blue");
  log("═══════════════════════════════════════════════════════\n", "blue");

  let passed = 0;
  let failed = 0;

  try {
    const health = await makeRequest("GET", "/health");
    if (health.status !== 200) {
      log("Server not responding at " + API_BASE_URL, "red");
      log("Start the backend with: npm run dev (or node server.js) from the backend folder.", "yellow");
      process.exit(1);
    }
    log("✅ Server connection OK", "green");
    passed++;

    log("Checking database for guards…", "cyan");
    let token;
    let guard;
    try {
      const result = await getGuardToken();
      token = result.token;
      guard = result.guard;
    } catch (err) {
      log("❌ Failed to get guard token: " + err.message, "red");
      log("Ensure the database has at least one guard (create one from Admin Dashboard → Guards).", "yellow");
      process.exit(1);
    }
    log(`✅ Guard token created for: ${guard.email}  (id: ${guard.id}, name: ${guard.name || "(none)"})`, "green");
    log(`   To see admin→guard messages: In Admin Messages, create a group and ADD this guard, then send.`, "cyan");
    log(`   To use Guard view in admin dashboard: open /messages/guard, then in browser console run:`, "yellow");
    log(`   localStorage.setItem('guardToken', '${token}');`, "yellow");
    passed++;

    const convRes = await makeRequest("GET", "/api/guard/messages/conversations", null, token);
    if (convRes.status !== 200) {
      log(`❌ GET conversations failed: ${convRes.status} - ${convRes.body?.message || ""}`, "red");
      failed++;
    } else {
      const list = convRes.body?.conversations || [];
      log(`✅ GET conversations: ${list.length} conversation(s)`, "green");
      if (list.length > 0) {
        log(`   Conversation IDs for this guard: ${list.map((c) => c.id).join(", ")}`, "cyan");
        list.forEach((c, i) => log(`   [${i}] ${c.name || c.displayName || "Unnamed"} (${c.id})`, "cyan"));
      }
      passed++;

      if (list.length > 0) {
        const convId = list[0].id;
        const msgRes = await makeRequest("GET", `/api/guard/messages/conversations/${convId}/messages?page=1&limit=20`, null, token);
        if (msgRes.status !== 200) {
          log(`❌ GET messages failed: ${msgRes.status}`, "red");
          failed++;
        } else {
          const messages = msgRes.body?.messages || [];
          log(`✅ GET messages: ${messages.length} message(s)`, "green");
          passed++;
          const hasValidTs = messages.every((m) => {
            const ts = m.created_at ?? m.createdAt;
            return ts && !Number.isNaN(new Date(ts).getTime());
          });
          if (messages.length > 0) {
            if (hasValidTs) log("✅ All message timestamps are valid ISO", "green");
            else log("⚠️ Some message timestamps missing or invalid", "yellow");
          }

          const sendRes = await makeRequest(
            "POST",
            `/api/guard/messages/conversations/${convId}/messages`,
            { content: "Guard API test message " + Date.now(), messageType: "text" },
            token
          );
          if (sendRes.status !== 201) {
            log(`❌ POST message failed: ${sendRes.status} - ${sendRes.body?.message || ""}`, "red");
            failed++;
          } else {
            log("✅ POST message (send) OK", "green");
            passed++;
            const created = sendRes.body?.message?.created_at ?? sendRes.body?.message?.createdAt;
            if (created && !Number.isNaN(new Date(created).getTime())) {
              log("✅ Send response has valid created_at ISO", "green");
            }
          }
        }
      } else {
        log("ℹ️ No conversations for this guard (add guard to a group from admin Messages)", "cyan");
      }
    }
  } catch (e) {
    log("❌ Error: " + e.message, "red");
    failed++;
  }

  log("\n═══════════════════════════════════════════════════════", "blue");
  log(`📊 Result: ${passed} passed, ${failed} failed`, failed ? "red" : "green");
  log("═══════════════════════════════════════════════════════\n", "blue");
  process.exit(failed > 0 ? 1 : 0);
}

main();
