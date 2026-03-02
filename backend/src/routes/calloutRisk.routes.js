const express = require("express");
const router = express.Router();

const authAdmin = require("../middleware/authAdmin");
const { requireAccess } = require("../middleware/requireAccess");

const calloutRiskController = require("../controllers/calloutRisk.controller");

// Get risk for a specific shift
router.get(
  "/shift/:shiftId",
  authAdmin,
  requireAccess("shifts:read"),
  calloutRiskController.getShiftRisk
);

// Get upcoming high-risk shifts
router.get(
  "/upcoming",
  authAdmin,
  requireAccess("shifts:read"),
  calloutRiskController.getUpcomingRisks
);

// Get guard risk profile
router.get(
  "/guard/:guardId",
  authAdmin,
  requireAccess("guards:read"),
  calloutRiskController.getGuardRiskProfile
);

module.exports = router;
