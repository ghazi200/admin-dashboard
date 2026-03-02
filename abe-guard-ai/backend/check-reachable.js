#!/usr/bin/env node
/**
 * Run from abe-guard-ai/backend. Prints your Mac IP and tests if Guard API is reachable on the network.
 * Use the printed IP in the phone app's "Server URL" field (http://IP:4000).
 */
const http = require("http");
const { execSync } = require("child_process");

function getLocalIP() {
  try {
    const en0 = execSync("ipconfig getifaddr en0 2>/dev/null", { encoding: "utf8" }).trim();
    if (en0) return en0;
  } catch (_) {}
  try {
    const en1 = execSync("ipconfig getifaddr en1 2>/dev/null", { encoding: "utf8" }).trim();
    if (en1) return en1;
  } catch (_) {}
  return null;
}

const ip = getLocalIP();
console.log("Mac IP (use this in phone Server URL):", ip || "could not detect");
console.log("Server URL to enter on phone:", ip ? `http://${ip}:4000` : "http://YOUR_MAC_IP:4000");
console.log("");

function test(url) {
  return new Promise((resolve) => {
    const req = http.get(url, { timeout: 3000 }, (res) => {
      let data = "";
      res.on("data", (ch) => (data += ch));
      res.on("end", () => resolve({ ok: res.statusCode === 200, status: res.statusCode }));
    });
    req.on("error", (e) => resolve({ ok: false, error: e.code || e.message }));
    req.on("timeout", () => { req.destroy(); resolve({ ok: false, error: "timeout" }); });
  });
}

(async () => {
  const local = await test("http://127.0.0.1:4000/health");
  console.log("localhost:4000/health:", local.ok ? "OK" : local.error || local.status);

  if (ip) {
    const lan = await test(`http://${ip}:4000/health`);
    console.log(`${ip}:4000/health (from network):`, lan.ok ? "OK" : lan.error || lan.status);
    if (!lan.ok) {
      console.log("");
      console.log("If localhost is OK but " + ip + " fails:");
      console.log("  - Mac firewall may be blocking. Try: System Settings → Network → Firewall → turn off, or allow Node.");
      console.log("  - Phone must be on the same Wi-Fi as this Mac.");
    }
  }
})();
