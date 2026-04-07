/**
 * Twilio env normalization + lazy REST client.
 * Kept in one module so production deploys cannot miss a separate utils file.
 */

function stripBom(s) {
  return String(s).replace(/^\uFEFF/, "");
}

function stripOuterQuotes(s) {
  const t = String(s).trim();
  if (t.length >= 2) {
    const a = t[0];
    const b = t[t.length - 1];
    if ((a === '"' && b === '"') || (a === "'" && b === "'") || (a === "\u201c" && b === "\u201d")) {
      return t.slice(1, -1).trim();
    }
  }
  return t;
}

function normalizeAccountSid(raw) {
  if (!raw) return "";
  let s = stripBom(stripOuterQuotes(String(raw).trim())).replace(/^TWILIO_ACCOUNT_SID=/i, "");
  const m = s.match(/AC[a-f0-9]{32}/i);
  return m ? m[0] : s.trim();
}

function normalizeAuthToken(raw) {
  if (!raw) return "";
  let s = stripBom(stripOuterQuotes(String(raw).trim()));
  if (/^TWILIO_AUTH_TOKEN=/i.test(s)) s = s.replace(/^TWILIO_AUTH_TOKEN=/i, "");
  return s.trim();
}

function normalizeMessagingServiceSid(raw) {
  if (!raw) return "";
  const s = stripBom(stripOuterQuotes(String(raw).trim())).replace(/^TWILIO_MESSAGING_SERVICE_SID=/i, "");
  const m = s.match(/MG[a-f0-9]{32}/i);
  return m ? m[0] : s.trim();
}

// Lazy Twilio REST client — avoids crashing when package or env is missing.
function getTwilioClient() {
  const sid = normalizeAccountSid(process.env.TWILIO_ACCOUNT_SID);
  const token = normalizeAuthToken(process.env.TWILIO_AUTH_TOKEN);
  if (!sid || !token) return null;
  try {
    // eslint-disable-next-line import/no-extraneous-dependencies, global-require
    return require("twilio")(sid, token);
  } catch (e) {
    console.warn("Twilio package not installed; run: npm install twilio");
    return null;
  }
}

module.exports = {
  getTwilioClient,
  normalizeAccountSid,
  normalizeAuthToken,
  normalizeMessagingServiceSid,
};
