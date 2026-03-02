const express = require("express");
const router = express.Router();

const auth = require("../middleware/guardAuth");
const schedule = require("../controllers/schedule.controller");

// Get schedule (requires guard authentication)
router.get("/", auth, schedule.getSchedule);

module.exports = router;
