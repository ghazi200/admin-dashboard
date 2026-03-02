const express = require("express");
const router = express.Router();

const authAdmin = require("../middleware/authAdmin");
const { requireAccess } = require("../middleware/requireAccess");

const shiftOptimizationController = require("../controllers/shiftOptimization.controller");

// Get recommendations for a shift
router.get(
  "/recommendations/:shiftId",
  authAdmin,
  requireAccess("shifts:read"),
  shiftOptimizationController.getRecommendations
);

// Auto-assign best guard to shift
router.post(
  "/auto-assign/:shiftId",
  authAdmin,
  requireAccess("shifts:write"),
  shiftOptimizationController.autoAssign
);

// Check conflicts before assignment
router.post(
  "/check-conflicts",
  authAdmin,
  requireAccess("shifts:read"),
  shiftOptimizationController.checkConflicts
);

// Get detailed score for guard-shift combination
router.get(
  "/score/:shiftId/:guardId",
  authAdmin,
  requireAccess("shifts:read"),
  shiftOptimizationController.getGuardScore
);

module.exports = router;
