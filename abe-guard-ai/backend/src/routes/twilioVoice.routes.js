/**
 * TwiML for Twilio outbound calls (callouts) on Guard AI.
 * Prefer admin PUBLIC_BASE_URL /twilio/voice when calls are placed from the unified backend.
 * This route remains for direct Guard AI callouts.
 */
const express = require("express");
const { Callout, Shift } = require("../models");

const router = express.Router();

function xmlEscape(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

router.all("/voice", (req, res) => {
  const shiftId = String(req.query.shiftId || req.body?.shiftId || "").trim();
  const calloutId = String(req.query.calloutId || req.body?.calloutId || "").trim();
  const guardId = String(req.query.guardId || req.body?.guardId || "").trim();
  const base = String(process.env.PUBLIC_BASE_URL || process.env.BASE_URL || "")
    .trim()
    .replace(/\/+$/, "");
  const q = new URLSearchParams({
    ...(shiftId ? { shiftId } : {}),
    ...(calloutId ? { calloutId } : {}),
    ...(guardId ? { guardId } : {}),
  }).toString();
  const action = base ? `${base}/twilio/voice/gather?${q}` : `/twilio/voice/gather?${q}`;

  const short = shiftId ? String(shiftId).slice(0, 8) : "";
  const msg = xmlEscape(
    short
      ? `I am Agent 24 from A B E Security. A shift needs coverage. Reference ${short}. Press 1 to accept, or 2 to decline.`
      : "I am Agent 24 from A B E Security. A shift needs coverage. Press 1 to accept, or 2 to decline."
  );

  res.type("text/xml; charset=utf-8").send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather numDigits="1" timeout="8" action="${xmlEscape(action)}" method="POST">
    <Say voice="alice">${msg}</Say>
  </Gather>
  <Say voice="alice">Please check the A B E Guard mobile app to accept or decline. Goodbye.</Say>
</Response>`);
});

router.all("/voice/gather", async (req, res) => {
  const digit = String(req.body?.Digits || "").trim();
  const calloutId = String(req.query.calloutId || req.body?.calloutId || "").trim();
  const guardId = String(req.query.guardId || req.body?.guardId || "").trim();

  const say = (msg) => {
    res.type("text/xml; charset=utf-8").send(`<?xml version="1.0" encoding="UTF-8"?>
<Response><Say voice="alice">${xmlEscape(msg)}</Say></Response>`);
  };

  try {
    if (digit === "2") return say("You have declined this offer. Thank you. Goodbye.");
    if (digit !== "1") return say("Invalid choice. Please use the Guard app. Goodbye.");
    if (!calloutId) return say("Please accept in the Guard app. Goodbye.");

    const callout = await Callout.findByPk(calloutId);
    if (!callout) return say("This offer is no longer available. Goodbye.");
    if (guardId && String(callout.guard_id) !== String(guardId)) {
      return say("This offer is not assigned to you. Goodbye.");
    }

    const shift = await Shift.findByPk(callout.shift_id);
    if (!shift) return say("Shift not found. Goodbye.");
    const statusUpper = String(shift.status || "").toUpperCase();
    if (shift.guard_id && statusUpper !== "OPEN") {
      return say("Sorry, this shift was already filled. Goodbye.");
    }

    shift.guard_id = callout.guard_id;
    shift.status = "CLOSED";
    await shift.save();

    return say("Thank you. You have accepted the shift. Goodbye.");
  } catch (e) {
    console.error("twilio voice gather:", e?.message || e);
    return say("Something went wrong. Please use the Guard app. Goodbye.");
  }
});

module.exports = router;
