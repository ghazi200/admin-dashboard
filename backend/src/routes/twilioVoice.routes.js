/**
 * Twilio voice TwiML for callout offers.
 * Outbound calls preferably send TwiML inline (see guardCalloutOutbound.service).
 * This URL remains for Gather callbacks and fallback.
 */
const express = require("express");
const {
  xmlEscape,
  speakableWhen,
  normalizeVoiceChoice,
  buildCalloutOfferTwiml,
  buildGatherActionUrl,
} = require("../utils/calloutVoiceTwiml");

const router = express.Router();

router.all("/voice", async (req, res) => {
  try {
    const shiftId = String(req.query.shiftId || req.body?.shiftId || "").trim();
    const calloutId = String(req.query.calloutId || req.body?.calloutId || "").trim();
    const guardId = String(req.query.guardId || req.body?.guardId || "").trim();

    let location = "an open post";
    let when = "soon";
    const { sequelize } = req.app.locals.models || {};
    if (sequelize && shiftId) {
      const [rows] = await sequelize.query(
        `SELECT location, shift_date, shift_start, shift_end FROM shifts WHERE id = $1::uuid LIMIT 1`,
        { bind: [shiftId] }
      );
      if (rows[0]) {
        location = rows[0].location || location;
        when = speakableWhen(rows[0]);
      }
    }

    const base = String(process.env.PUBLIC_BASE_URL || process.env.BASE_URL || "")
      .trim()
      .replace(/\/+$/, "");
    const actionUrl = buildGatherActionUrl(base, { shiftId, calloutId, guardId });
    const twiml = buildCalloutOfferTwiml({ location, when, actionUrl });

    res.type("text/xml; charset=utf-8").send(twiml);
  } catch (e) {
    console.error("twilio /voice error:", e?.message || e);
    res.type("text/xml; charset=utf-8").send(`<?xml version="1.0" encoding="UTF-8"?>
<Response><Say voice="Polly.Joanna">This is Abe Guard. A shift callout is available. Please open the Guard app. Goodbye.</Say></Response>`);
  }
});

router.all("/voice/gather", async (req, res) => {
  const digit = normalizeVoiceChoice({
    digits: req.body?.Digits || req.query.Digits,
    speech: req.body?.SpeechResult || req.query.SpeechResult,
  });
  const calloutId = String(req.query.calloutId || req.body?.calloutId || "").trim();
  const guardId = String(req.query.guardId || req.body?.guardId || "").trim();
  const shiftId = String(req.query.shiftId || req.body?.shiftId || "").trim();

  const say = (msg) => {
    res.type("text/xml; charset=utf-8").send(`<?xml version="1.0" encoding="UTF-8"?>
<Response><Say voice="Polly.Joanna">${xmlEscape(msg)}</Say></Response>`);
  };

  try {
    if (digit !== "1" && digit !== "2") {
      const heard = String(req.body?.SpeechResult || req.body?.Digits || "").trim();
      console.log("twilio /voice/gather unrecognized", { heard, calloutId, guardId });
      return say("Invalid choice. Press 1 or say accept, or press 2 or say decline. Or use the Guard app. Goodbye.");
    }

    if (!calloutId) {
      return say(
        digit === "1"
          ? "We could not match this offer. Please accept in the Guard app. Goodbye."
          : "Thank you. Goodbye."
      );
    }

    const { sequelize } = req.app.locals.models || {};
    if (!sequelize) return say("System unavailable. Please use the Guard app. Goodbye.");

    const [calloutRows] = await sequelize.query(
      `SELECT id, guard_id::text AS guard_id, shift_id::text AS shift_id
       FROM callouts WHERE id = $1::uuid LIMIT 1`,
      { bind: [calloutId] }
    );
    const callout = calloutRows[0];
    if (!callout) return say("This offer is no longer available. Goodbye.");

    if (guardId && String(callout.guard_id) !== String(guardId)) {
      return say("This offer is not assigned to you. Goodbye.");
    }

    if (digit === "2") {
      return say("You have declined this shift offer. Thank you. Goodbye.");
    }

    const [shiftRows] = await sequelize.query(
      `SELECT id, status, guard_id::text AS guard_id FROM shifts WHERE id = $1::uuid LIMIT 1`,
      { bind: [callout.shift_id || shiftId] }
    );
    const shift = shiftRows[0];
    if (!shift) return say("Shift not found. Goodbye.");

    const statusUpper = String(shift.status || "").toUpperCase();
    if (shift.guard_id || statusUpper !== "OPEN") {
      return say("Sorry, this shift was already filled. Goodbye.");
    }

    try {
      const { beginPendingAccept, overrideWindowMinutes } = require("../services/shiftAcceptPending.service");
      const result = await beginPendingAccept(req.app, {
        shiftId: shift.id,
        guardId: callout.guard_id,
        source: "voice_accept",
        calloutId,
      });
      if (result.mode === "pending") {
        return say(
          `Thank you. Your accept is recorded. An administrator has about ${overrideWindowMinutes()} minutes to review before the shift is assigned to you. Goodbye.`
        );
      }
      return say("Thank you. You have accepted the shift. It is now assigned to you. Goodbye.");
    } catch (e) {
      if (e.status === 409) {
        return say("Sorry, this shift was already filled. Goodbye.");
      }
      throw e;
    }
  } catch (e) {
    console.error("twilio /voice/gather error:", e?.message || e);
    return say("Something went wrong. Please use the Guard app. Goodbye.");
  }
});

module.exports = router;
