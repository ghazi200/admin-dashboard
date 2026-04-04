/**
 * TwiML for Twilio outbound calls (callouts).
 * Twilio GET/POSTs this URL when the call connects.
 */
const express = require("express");

const router = express.Router();

function twimlSay(message) {
  const escaped = String(message)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">${escaped}</Say>
  <Pause length="1"/>
  <Say voice="alice">Please check the A B E Guard mobile app to accept or decline. Goodbye.</Say>
</Response>`;
}

router.all("/voice", (req, res) => {
  const shiftId = req.query.shiftId || req.body?.shiftId || "";
  const short = shiftId ? String(shiftId).slice(0, 8) : "";
  const msg = short
    ? `This is A B E Security. A shift needs coverage. Reference ${short}.`
    : "This is A B E Security. A shift needs coverage.";
  res.type("text/xml; charset=utf-8").send(twimlSay(msg));
});

module.exports = router;
