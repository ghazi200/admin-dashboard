const express = require("express");
const router = express.Router();

const authAdmin = require("../middleware/authAdmin");
const { requireAccess } = require("../middleware/requireAccess");

const schedule = require("../controllers/adminSchedule.controller");
const scheduleAck = require("../controllers/scheduleAcknowledgment.controller");

// Get schedule
router.get(
  "/",
  authAdmin,
  requireAccess("schedule:read"),
  schedule.getSchedule
);

// Guard acknowledgments for a week (Mon–Sun)
router.get(
  "/acknowledgments",
  authAdmin,
  requireAccess("schedule:read"),
  scheduleAck.listScheduleAcknowledgments
);

// Update schedule
router.put(
  "/",
  authAdmin,
  requireAccess("schedule:write"),
  schedule.updateSchedule
);

module.exports = router;
