// src/routes/adminAIRanking.routes.js
const express = require("express");
const router = express.Router();

const authAdmin = require("../middleware/authAdmin");
const { requireAccess } = require("../middleware/requireAccess");
const aiRankingController = require("../controllers/adminAIRanking.controller");

// GET /api/admin/ai-ranking - Get AI rankings
router.get(
  "/",
  authAdmin,
  requireAccess("dashboard:read"),
  aiRankingController.getAIRankings
);

// POST /api/admin/ai-ranking/:shiftId/override - Override AI decision
router.post(
  "/:shiftId/override",
  authAdmin,
  requireAccess("shifts:write"),
  aiRankingController.overrideAIDecision
);

module.exports = router;
