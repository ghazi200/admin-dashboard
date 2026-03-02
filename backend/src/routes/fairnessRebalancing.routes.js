const express = require('express');
const router = express.Router();

const authAdmin = require('../middleware/authAdmin');
const { requireAccess } = require('../middleware/requireAccess');
const fairnessRebalancingController = require('../controllers/fairnessRebalancing.controller');

// Analyze fairness
router.get(
  '/analyze',
  authAdmin,
  requireAccess('shifts:read'),
  fairnessRebalancingController.analyze
);

// Get rebalancing suggestions
router.get(
  '/suggestions',
  authAdmin,
  requireAccess('shifts:read'),
  fairnessRebalancingController.getSuggestions
);

// Auto-rebalance shifts
router.post(
  '/auto-rebalance',
  authAdmin,
  requireAccess('shifts:write'),
  fairnessRebalancingController.autoRebalance
);

module.exports = router;
