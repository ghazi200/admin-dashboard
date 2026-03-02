const express = require("express");
const router = express.Router();
const authAdmin = require("../middleware/authAdmin");
const { requireAccess } = require("../middleware/requireAccess");
const clockReportController = require("../controllers/clockReport.controller");

router.get(
  "/",
  authAdmin,
  requireAccess("dashboard:read"),
  clockReportController.getReport
);

router.get(
  "/export",
  authAdmin,
  requireAccess("dashboard:read"),
  clockReportController.exportReport
);

module.exports = router;
