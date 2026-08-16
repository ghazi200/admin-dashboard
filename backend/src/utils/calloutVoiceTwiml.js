/**
 * Shared TwiML builder for callout voice offers.
 * Keep ASCII-only speech text — special chars / invalid Say attrs can hang up trial calls.
 */

function xmlEscape(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function ordinal(n) {
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

function speakableTime(hhmm) {
  const m = String(hhmm || "").match(/(\d{1,2}):(\d{2})/);
  if (!m) return "";
  let h = parseInt(m[1], 10);
  const min = m[2];
  if (Number.isNaN(h)) return "";
  const ampm = h >= 12 ? "P M" : "A M";
  h = h % 12;
  if (h === 0) h = 12;
  if (min === "00") return `${h} ${ampm}`;
  return `${h} ${min} ${ampm}`;
}

function speakableDate(iso) {
  const raw = String(iso || "").slice(0, 10);
  const parts = raw.split("-").map((x) => parseInt(x, 10));
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return raw || "soon";
  const [, mo, d] = parts;
  if (mo < 1 || mo > 12 || d < 1) return raw;
  return `${MONTHS[mo - 1]} ${ordinal(d)}`;
}

function speakableWhen(shift) {
  if (!shift) return "soon";
  const date = speakableDate(shift.shift_date);
  const start = speakableTime(shift.shift_start);
  const end = speakableTime(shift.shift_end);
  if (date && start && end) return `${date}, from ${start} to ${end}`;
  if (date) return date;
  return "soon";
}

/**
 * Normalize keypad Digits or spoken SpeechResult to "1" | "2" | "".
 */
function normalizeVoiceChoice({ digits, speech } = {}) {
  const d = String(digits || "").trim();
  if (d === "1" || d === "2") return d;

  const s = String(speech || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!s) return "";

  if (/\b(accept|one|won|number one)\b/.test(s) || s === "1") return "1";
  if (/\b(decline|two|number two)\b/.test(s) || s === "2") return "2";
  return "";
}

/**
 * Build offer TwiML.
 * The shift details play in a <Say> outside <Gather> so speech or noise on answer
 * cannot barge in and register an accept before the guard has heard the offer.
 * Only the prompt that follows collects keypad/speech input.
 */
function buildCalloutOfferTwiml({
  location = "an open post",
  when = "soon",
  actionUrl,
}) {
  const place = xmlEscape(String(location || "an open post").replace(/[^\x20-\x7E]/g, " "));
  const whenSafe = xmlEscape(String(when || "soon").replace(/[^\x20-\x7E]/g, " "));
  const action = xmlEscape(actionUrl || "");

  const offer =
    `Hello. I am Agent 24 from Abe Guard. ` +
    `An open shift needs coverage. ` +
    `Location: ${place}. ` +
    `When: ${whenSafe}. ` +
    `Again: ${place}, ${whenSafe}.`;

  const prompt =
    `Press 1 or say accept to take this shift. ` +
    `Press 2 or say decline to pass.`;

  const retry =
    `I did not catch that. Press 1 or say accept. Press 2 or say decline.`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">${offer}</Say>
  <Gather input="dtmf speech" language="en-US" numDigits="1" timeout="8" speechTimeout="auto" hints="one, two, accept, decline" action="${action}" method="POST">
    <Say voice="Polly.Joanna">${prompt}</Say>
  </Gather>
  <Gather input="dtmf speech" language="en-US" numDigits="1" timeout="8" speechTimeout="auto" hints="one, two, accept, decline" action="${action}" method="POST">
    <Say voice="Polly.Joanna">${retry}</Say>
  </Gather>
  <Say voice="Polly.Joanna">We did not receive a response. Please open the Abe Guard app to accept or decline this open shift. Goodbye.</Say>
</Response>`;
}

function buildGatherActionUrl(base, { shiftId, calloutId, guardId } = {}) {
  const root = String(base || "")
    .trim()
    .replace(/\/+$/, "");
  const qs = new URLSearchParams({
    ...(shiftId ? { shiftId: String(shiftId) } : {}),
    ...(calloutId ? { calloutId: String(calloutId) } : {}),
    ...(guardId ? { guardId: String(guardId) } : {}),
  }).toString();
  if (root) return `${root}/twilio/voice/gather?${qs}`;
  return `/twilio/voice/gather?${qs}`;
}

module.exports = {
  xmlEscape,
  speakableWhen,
  speakableDate,
  speakableTime,
  normalizeVoiceChoice,
  buildCalloutOfferTwiml,
  buildGatherActionUrl,
};
