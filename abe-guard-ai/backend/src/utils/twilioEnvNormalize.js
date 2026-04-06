/**
 * Fixes common .env mistakes: pasting "VAR=value" into the value side,
 * smart quotes, BOM, or wrapping the value in quotes.
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

module.exports = {
  normalizeAccountSid,
  normalizeAuthToken,
  normalizeMessagingServiceSid,
};
