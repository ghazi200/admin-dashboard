const express = require("express");
const router = express.Router();

const authAdmin = require("../middleware/authAdmin");
const { requireAccess } = require("../middleware/requireAccess");
const analyticsController = require("../controllers/analytics.controller");

// All analytics routes require authentication and dashboard:read access
router.get(
  "/kpis",
  authAdmin,
  requireAccess("dashboard:read"),
  analyticsController.getKPIs
);

router.get(
  "/trends",
  authAdmin,
  requireAccess("dashboard:read"),
  analyticsController.getTrends
);

router.get(
  "/performance",
  authAdmin,
  requireAccess("dashboard:read"),
  analyticsController.getPerformance
);

router.get(
  "/comparative",
  authAdmin,
  requireAccess("dashboard:read"),
  analyticsController.getComparative
);

router.get(
  "/overview",
  authAdmin,
  requireAccess("dashboard:read"),
  analyticsController.getOverview
);

module.exports = router;
