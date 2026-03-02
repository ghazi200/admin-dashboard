const express = require("express");
const router = express.Router();

const authAdmin = require("../middleware/authAdmin");
const { requireAccess } = require("../middleware/requireAccess");

const emailSchedulerSettings = require("../controllers/emailSchedulerSettings.controller");

// Get settings
router.get(
  "/",
  authAdmin,
  requireAccess("users:write"), // Only admins can configure email settings
  emailSchedulerSettings.getSettings
);

// Update settings
router.put(
  "/",
  authAdmin,
  requireAccess("users:write"),
  emailSchedulerSettings.updateSettings
);

module.exports = router;
