const express = require("express");
const router = express.Router();

const authAdmin = require("../middleware/authAdmin");
const { requireAccess } = require("../middleware/requireAccess");

const schedule = require("../controllers/adminSchedule.controller");

// Get schedule
router.get(
  "/",
  authAdmin,
  requireAccess("schedule:read"),
  schedule.getSchedule
);

// Update schedule
router.put(
  "/",
  authAdmin,
  requireAccess("schedule:write"),
  schedule.updateSchedule
);

module.exports = router;
