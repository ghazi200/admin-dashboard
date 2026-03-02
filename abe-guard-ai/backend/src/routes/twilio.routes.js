// src/routes/twilio.routes.js
const express = require("express");
const router = express.Router();
const { Shift } = require("../models");

router.post("/sms", async (req, res) => {
  const incoming = req.body.Body.toLowerCase();
  const from = req.body.From;

  if (incoming === "yes") {
    const shift = await Shift.findOne({
      where: { status: "OPEN" }
    });

    if (!shift) {
      return res.send("<Response><Message>Shift already taken.</Message></Response>");
    }

    shift.status = "CLOSED";
    shift.assignedGuardId = from;
    await shift.save();

    return res.send("<Response><Message>✅ Shift assigned to you.</Message></Response>");
  }

  res.send("<Response><Message>Reply YES to accept shift.</Message></Response>");
});

module.exports = router;
