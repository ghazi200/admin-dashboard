const express = require("express");
const router = express.Router();

const authAdmin = require("../middleware/authAdmin");
const { requireAccess } = require("../middleware/requireAccess");
const assistantController = require("../controllers/assistant.controller");

// POST /api/admin/assistant/chat - Chat with AI assistant
router.post(
  "/chat",
  authAdmin,
  requireAccess("dashboard:read"),
  assistantController.chat
);

// GET /api/admin/assistant/report/export-pdf - Export guard report as PDF
router.get(
  "/report/export-pdf",
  authAdmin,
  requireAccess("dashboard:read"),
  assistantController.exportGuardReportPDF
);

// ===== ADVANCED SEARCH & FILTERS (#31) =====
router.get("/search", authAdmin, requireAccess("dashboard:read"), assistantController.search);
router.get("/search/history", authAdmin, requireAccess("dashboard:read"), assistantController.searchHistory);
router.get("/saved-searches", authAdmin, requireAccess("dashboard:read"), assistantController.getSavedSearches);
router.post("/saved-searches", authAdmin, requireAccess("dashboard:read"), assistantController.createSavedSearch);
router.delete("/saved-searches/:id", authAdmin, requireAccess("dashboard:read"), assistantController.deleteSavedSearch);

module.exports = router;
