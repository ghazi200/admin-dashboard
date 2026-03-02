const express = require("express");
const router = express.Router();

const authAdmin = require("../middleware/authAdmin");
const {requireAccess} = require("../middleware/requireAccess");

const dashboardController = require("../controllers/adminDashboard.controllers");

// 🔍 TEMP SAFETY CHECK (leave this in for now)
if (!dashboardController.getStats) {
  throw new Error("getStats is undefined – controller export failed");
}

// Existing dashboard routes
router.get(
  "/live-callouts",
  authAdmin,
  requireAccess("dashboard:read"),
  dashboardController.getLiveCallouts
);

router.get(
  "/open-shifts",
  authAdmin,
  requireAccess("dashboard:read"),
  dashboardController.getOpenShifts
);

router.get(
  "/running-late",
  authAdmin,
  requireAccess("dashboard:read"),
  dashboardController.getRunningLate
);

router.get(
  "/guard-availability",
  authAdmin,
  requireAccess("dashboard:read"),
  dashboardController.getGuardAvailability
);

// ✅ Clock status route
router.get(
  "/clock-status",
  authAdmin,
  requireAccess("dashboard:read"),
  dashboardController.getClockStatus
);

// ✅ Stats route
router.get(
  "/stats",
  authAdmin,
  requireAccess("dashboard:read"),
  dashboardController.getStats
);

// ✅ Active emergencies route
router.get(
  "/active-emergencies",
  authAdmin,
  requireAccess("dashboard:read"),
  dashboardController.getActiveEmergencies
);

// ✅ Resolve emergency route
router.post(
  "/resolve-emergency/:id",
  authAdmin,
  requireAccess("dashboard:write"),
  dashboardController.resolveEmergency
);

module.exports = router;
