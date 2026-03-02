const express = require("express");
const router = express.Router();

const authAdmin = require("../middleware/authAdmin");
const { requireAccess } = require("../middleware/requireAccess");

const reportBuilderController = require("../controllers/reportBuilder.controller");

// Template management
router.get(
  "/templates",
  authAdmin,
  requireAccess("reports:read"),
  reportBuilderController.listTemplates
);

router.get(
  "/templates/:id",
  authAdmin,
  requireAccess("reports:read"),
  reportBuilderController.getTemplate
);

router.post(
  "/templates",
  authAdmin,
  requireAccess("reports:write"),
  reportBuilderController.createTemplate
);

router.put(
  "/templates/:id",
  authAdmin,
  requireAccess("reports:write"),
  reportBuilderController.updateTemplate
);

router.delete(
  "/templates/:id",
  authAdmin,
  requireAccess("reports:delete"),
  reportBuilderController.deleteTemplate
);

// Report generation
router.post(
  "/generate",
  authAdmin,
  requireAccess("reports:write"),
  reportBuilderController.generateReport
);

// Report history
router.get(
  "/runs",
  authAdmin,
  requireAccess("reports:read"),
  reportBuilderController.listReportRuns
);

router.get(
  "/runs/:id",
  authAdmin,
  requireAccess("reports:read"),
  reportBuilderController.getReportRun
);

router.get(
  "/runs/:id/export",
  authAdmin,
  requireAccess("reports:read"),
  reportBuilderController.exportReport
);

module.exports = router;
