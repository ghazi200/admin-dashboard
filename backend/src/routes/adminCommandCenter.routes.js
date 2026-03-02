/**
 * Command Center Routes
 * 
 * API routes for the AI Operations Command Center
 */

const express = require("express");
const router = express.Router();

const authAdmin = require("../middleware/authAdmin");
const { requireAccess } = require("../middleware/requireAccess");
const commandCenterController = require("../controllers/commandCenter.controller");

// All routes require admin authentication and dashboard:read access
router.use(authAdmin);
router.use(requireAccess("dashboard:read"));

/**
 * GET /api/admin/command-center/feed
 * Get operational events feed (Situation Room)
 * Query params: tenantId (optional for super admin), siteId, type, severity, limit, offset
 */
router.get("/feed", commandCenterController.getFeed);

/**
 * GET /api/admin/command-center/at-risk-shifts
 * Get shifts ranked by risk score
 * Query params: tenantId (optional for super admin), limit, minRiskScore
 */
router.get("/at-risk-shifts", commandCenterController.getAtRiskShifts);

/**
 * POST /api/admin/command-center/briefing
 * Generate AI briefing for a tenant
 * Body: { tenantId (optional for super admin), timeRange: "24h"|"7d"|"30d", focus: "all"|"coverage"|"incidents"|"compliance" }
 */
router.post("/briefing", commandCenterController.generateBriefing);

/**
 * POST /api/admin/command-center/ask
 * Natural language query over operational data (RAG)
 * Body: { tenantId (optional for super admin), question: "Why did we miss coverage last week?" }
 */
router.post("/ask", commandCenterController.askCommandCenter);

/**
 * GET /api/admin/command-center/actions
 * Get all actions (pending, approved, rejected, executed)
 * Query params: status, limit
 */
router.get("/actions", commandCenterController.getActions);

/**
 * POST /api/admin/command-center/actions
 * Create a new action manually
 */
router.post("/actions", commandCenterController.createAction);

/**
 * POST /api/admin/command-center/actions/:id/approve
 * Approve and execute a recommended action
 */
router.post("/actions/:id/approve", commandCenterController.approveAction);

/**
 * POST /api/admin/command-center/actions/:id/reject
 * Reject a recommended action
 * Body: { reason: "Optional rejection reason" }
 */
router.post("/actions/:id/reject", commandCenterController.rejectAction);

/**
 * POST /api/admin/command-center/process-historical
 * Process historical data and create OpEvents retroactively
 * Body: { tenantId (optional), startDate, endDate, types: ["incidents", "callouts", "shifts"], limit, dryRun }
 */
router.post("/process-historical", commandCenterController.processHistoricalEvents);

/**
 * GET /api/admin/command-center/site-health
 * Get site health overview for all sites
 * Query params: tenantId (optional for super admin), days
 */
router.get("/site-health", commandCenterController.getSiteHealth);

/**
 * GET /api/admin/command-center/site-health/:siteId
 * Get detailed site health for a specific site
 * Query params: tenantId (optional for super admin), days
 */
router.get("/site-health/:siteId", commandCenterController.getSiteHealthDetails);

/**
 * GET /api/admin/command-center/guard-readiness
 * Get guard readiness overview for all guards
 * Query params: tenantId (optional for super admin), days, minReliability, limit
 */
router.get("/guard-readiness", commandCenterController.getGuardReadiness);

/**
 * GET /api/admin/command-center/guard-readiness/:guardId
 * Get detailed guard readiness for a specific guard
 * Query params: tenantId (optional for super admin), days
 */
router.get("/guard-readiness/:guardId", commandCenterController.getGuardReadinessDetails);

/**
 * POST /api/admin/command-center/weekly-report
 * Generate a weekly operational report with AI summary
 * Body: { startDate?, endDate?, includeGuards?, includeSites? }
 */
router.post("/weekly-report", commandCenterController.generateWeeklyReport);

/**
 * GET /api/admin/command-center/weekly-report/export
 * Export weekly report as CSV
 * Query params: startDate, endDate, tenantId (optional for super admin)
 */
router.get("/weekly-report/export", commandCenterController.exportWeeklyReport);

/**
 * GET /api/admin/command-center/weekly-report/export-pdf
 * Export weekly report as PDF
 * Query params: startDate, endDate, tenantId (optional for super admin)
 */
router.get("/weekly-report/export-pdf", commandCenterController.exportWeeklyReportPDF);

module.exports = router;
