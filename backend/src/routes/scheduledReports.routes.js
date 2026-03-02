const express = require("express");
const router = express.Router();
const authAdmin = require("../middleware/authAdmin");
const { requireAccess } = require("../middleware/requireAccess");
const scheduledReportsController = require("../controllers/scheduledReports.controller");

// List scheduled reports
router.get(
  "/",
  authAdmin,
  requireAccess("reports:read"),
  scheduledReportsController.listScheduledReports
);

// Create scheduled report
router.post(
  "/",
  authAdmin,
  requireAccess("reports:write"),
  scheduledReportsController.createScheduledReport
);

// Update scheduled report
router.put(
  "/:id",
  authAdmin,
  requireAccess("reports:write"),
  scheduledReportsController.updateScheduledReport
);

// Delete scheduled report
router.delete(
  "/:id",
  authAdmin,
  requireAccess("reports:write"),
  scheduledReportsController.deleteScheduledReport
);

// Run scheduled report now (manual trigger)
router.post(
  "/:id/run-now",
  authAdmin,
  requireAccess("reports:write"),
  scheduledReportsController.runScheduledReportNow
);

module.exports = router;
