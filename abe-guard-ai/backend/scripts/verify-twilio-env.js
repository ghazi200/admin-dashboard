#!/usr/bin/env node
/**
 * Check Twilio env shape + call Accounts API (does not print your auth token).
 * Run from: abe-guard-ai/backend
 *
 *   node scripts/verify-twilio-env.js
 */
require("../src/loadEnv");

const https = require("https");
const {
  normalizeAccountSid,
  normalizeAuthToken,
  normalizeMessagingServiceSid,
} = require("../src/utils/twilioEnvNormalize");

const sid = normalizeAccountSid(process.env.TWILIO_ACCOUNT_SID);
const token = normalizeAuthToken(process.env.TWILIO_AUTH_TOKEN);
const ms = normalizeMessagingServiceSid(process.env.TWILIO_MESSAGING_SERVICE_SID || "");

function bad(msg) {
  console.error("❌", msg);
  process.exit(1);
}

if (!sid) bad("TWILIO_ACCOUNT_SID is empty (check abe-guard-ai/backend/.env)");
if (!token) bad("TWILIO_AUTH_TOKEN is empty");

if (/^SK/i.test(sid)) {
  bad(
    "TWILIO_ACCOUNT_SID looks like an API Key SID (SK…). Use Account SID (AC…) from Twilio → Account → Account Info, not API Keys."
  );
}

if (!/^AC[a-f0-9]{32}$/i.test(sid)) {
  bad(
    `TWILIO_ACCOUNT_SID must be AC + 32 hex chars (length ${sid.length}). Got: "${sid.slice(0, 8)}…". Fix .env — no extra quotes/spaces.`
  );
}

if (token.length < 20) bad("TWILIO_AUTH_TOKEN looks too short — copy the full Primary Auth Token from Twilio Console");

// Twilio Console "Primary Auth Token" is always 32 characters (alphanumeric).
if (token.length !== 32) {
  console.warn(
    `⚠️  Auth token length is ${token.length}; Twilio's Primary Auth Token is exactly 32 characters.`
  );
  console.warn(
    "   You may have pasted two tokens, a curl snippet, or the wrong secret. Regenerate in Console → copy only the 32-char token."
  );
}

if (/\s/.test(token)) bad("TWILIO_AUTH_TOKEN contains whitespace — remove line breaks/spaces from .env");

const lower = token.toLowerCase();
if (lower.includes("your") || lower.includes("placeholder") || lower === "[authtoken]") {
  bad("TWILIO_AUTH_TOKEN still looks like a placeholder");
}

console.log("✅ SID format OK, token length OK");
console.log("   Using Account SID:", `${sid.slice(0, 6)}…${sid.slice(-4)}`, `(len ${sid.length})`);
console.log("   Auth token length:", token.length);
console.log("   Messaging Service SID:", ms || "(not set)");
const fromNum = process.env.TWILIO_PHONE_NUMBER || process.env.TWILIO_FROM_NUMBER || "";
const digits = fromNum.replace(/\D/g, "");
if (digits === "1234567890") {
  console.warn("⚠️  TWILIO_PHONE_NUMBER is placeholder +1234567890 — remove it or use a real Twilio number; prefer TWILIO_MESSAGING_SERVICE_SID=MG…");
} else {
  console.log("   From number:", fromNum || "(not set)");
}

const auth = Buffer.from(`${sid}:${token}`, "utf8").toString("base64");
const path = `/2010-04-01/Accounts/${sid}.json`;

const req = https.request(
  {
    hostname: "api.twilio.com",
    path,
    method: "GET",
    headers: { Authorization: `Basic ${auth}` },
  },
  (res) => {
    let body = "";
    res.on("data", (c) => (body += c));
    res.on("end", () => {
      if (res.statusCode === 200) {
        console.log("✅ Twilio accepted Account SID + Auth Token (GET Account 200)");
        try {
          const j = JSON.parse(body);
          console.log("   Friendly name:", j.friendly_name || "(n/a)");
        } catch (_) {}
        process.exit(0);
      }
      console.error("❌ Twilio returned HTTP", res.statusCode);
      console.error(body.slice(0, 500));
      console.error("\n→ Fix: Twilio Console → Account → copy Account SID + Auth Token again (or rotate token).");
      console.error("→ Use the SAME subaccount as your Messaging Service if you use subaccounts.");
      process.exit(1);
    });
  }
);
req.on("error", (e) => {
  console.error(e);
  process.exit(1);
});
req.end();
