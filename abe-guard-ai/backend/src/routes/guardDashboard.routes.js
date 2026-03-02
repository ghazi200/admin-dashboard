const express = require("express");
const router = express.Router();
const auth = require("../middleware/guardAuth");
const { getGuardDashboard } = require("../controllers/guardDashboard.controller");

/**
 * GET /api/guard/dashboard
 * Returns comprehensive dashboard data for the authenticated guard
 */
router.get("/", auth, getGuardDashboard);

module.exports = router;
