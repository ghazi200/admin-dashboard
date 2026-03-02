const express = require("express");
const router = express.Router();
const { Shift } = require("../models");

router.post("/voice-response", async (req, res) => {
  const digit = req.body.Digits;
  const shiftId = req.query.shiftId;

  if (digit === "1") {
    const shift = await Shift.findByPk(shiftId);

    if (!shift || shift.status !== "OPEN") {
      res.type("text/xml");
      return res.send("<Response><Say>Shift already taken.</Say></Response>");
    }

    shift.status = "CLOSED";
    await shift.save();

    res.type("text/xml");
    return res.send("<Response><Say>You have been assigned the shift.</Say></Response>");
  }

  res.type("text/xml");
  res.send("<Response><Say>Thank you. Goodbye.</Say></Response>");
});

module.exports = router;
