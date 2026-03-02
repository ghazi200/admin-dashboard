// backend/src/routes/timeEntries.routes.js
const express = require("express");
const router = express.Router();
const auth = require("../middleware/guardAuth");

const {
  clockIn,
  clockOut,
  breakStart,
  breakEnd,
  getMyShiftState,
  runningLate, // ✅ ADD THIS
} = require("../controllers/timeEntries.controller");

// Guard time actions (require authentication)
router.post("/shifts/:shiftId/clock-in", auth, clockIn);
router.post("/shifts/:shiftId/clock-out", auth, clockOut);
router.post("/shifts/:shiftId/break-start", auth, breakStart);
router.post("/shifts/:shiftId/break-end", auth, breakEnd);

// guard running late notification (require authentication)
router.post("/shifts/:shiftId/running-late", auth, runningLate);

// Optional: fetch current state + history (for UI) (require authentication)
router.get("/shifts/:shiftId/state", auth, getMyShiftState);

module.exports = router;
