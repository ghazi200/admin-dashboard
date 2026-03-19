/**
 * Guard dashboard router (optional). Primary registration is in server.js:
 *   app.get("/api/guard/dashboard", authGuard, getGuardDashboard);
 * so GET is never lost to the broad app.use("/api/guard", guardAuthRoutes) mount.
 */
const express = require("express");
const router = express.Router();
const authGuard = require("../middleware/authGuard");
const { getGuardDashboard } = require("../controllers/guardDashboard.controller");

router.get("/", authGuard, getGuardDashboard);

module.exports = router;
