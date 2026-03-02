/**
 * Schedule Email Routes
 */

const express = require("express");
const router = express.Router();
const authAdmin = require("../middleware/authAdmin");
const { requireAccess } = require("../middleware/requireAccess");
const scheduleEmailController = require("../controllers/scheduleEmail.controller");

// Get all preferences
router.get(
  "/preferences",
  authAdmin,
  requireAccess("guards:read"),
  scheduleEmailController.getPreferences
);

// Get preference for specific guard
router.get(
  "/preferences/:guardId",
  authAdmin,
  requireAccess("guards:read"),
  scheduleEmailController.getGuardPreference
);

// Update preference
router.put(
  "/preferences/:guardId",
  authAdmin,
  requireAccess("guards:write"),
  scheduleEmailController.updatePreference
);

// Send email now (manual)
router.post(
  "/send-now/:guardId",
  authAdmin,
  requireAccess("guards:write"),
  scheduleEmailController.sendNow
);

// Bulk send emails
router.post(
  "/bulk-send",
  authAdmin,
  requireAccess("guards:write"),
  scheduleEmailController.bulkSend
);

// Get email logs
router.get(
  "/logs",
  authAdmin,
  requireAccess("guards:read"),
  scheduleEmailController.getLogs
);

// Process scheduled emails (manual trigger)
router.post(
  "/process",
  authAdmin,
  requireAccess("guards:write"),
  scheduleEmailController.processScheduled
);

module.exports = router;
