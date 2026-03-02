// backend/src/routes/callouts.routes.js
const express = require("express");
const router = express.Router();

console.log("✅ LOADED: callouts.routes.js");

const { triggerCallout, respondToCallout } = require("../controllers/callouts.controller");

// POST /callouts/trigger  (because app.js mounts: app.use('/callouts', calloutRoutes))
router.post("/trigger", triggerCallout);

// POST /callouts/:calloutId/respond
router.post("/:calloutId/respond", respondToCallout);

module.exports = router;
