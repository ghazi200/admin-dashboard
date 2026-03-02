const express = require("express");
const router = express.Router();
const calloutsTestController = require("../controllers/callouts.test.controller");

// Test endpoint to trigger AI callout
router.post("/trigger", calloutsTestController.triggerCalloutTest);

module.exports = router;
