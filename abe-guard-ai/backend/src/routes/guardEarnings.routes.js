const express = require("express");
const router = express.Router();
const auth = require("../middleware/guardAuth");
const { getGuardEarnings } = require("../controllers/guardEarnings.controller");

/**
 * GET /api/guard/earnings
 * Returns comprehensive earnings tracker data for the authenticated guard
 */
router.get("/", auth, getGuardEarnings);

module.exports = router;
