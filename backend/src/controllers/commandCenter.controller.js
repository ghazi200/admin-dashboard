/**
 * Command Center Controller
 * 
 * API endpoints for the AI Operations Command Center
 */

const opsEventService = require("../services/opsEvent.service");
const riskScoringService = require("../services/riskScoring.service");
const commandCenterAI = require("../services/commandCenterAI.service");
const operationalDataRag = require("../services/operationalDataRag.service");
const actionExecutionService = require("../services/actionExecution.service");
const historicalEventProcessor = require("../services/historicalEventProcessor.service");
const siteHealthService = require("../services/siteHealth.service");
const guardReadinessService = require("../services/guardReadiness.service");
const weeklyReportService = require("../services/weeklyReport.service");

/**
 * GET /api/admin/command-center/feed
 * Get operational events feed (Situation Room)
 */
exports.getFeed = async (req, res) => {
  try {
    const models = req.app.locals.models;
    const tenantId = req.admin?.tenant_id || req.query.tenantId;
    const isSuperAdmin = req.admin?.role === "super_admin";

    if (!isSuperAdmin && !tenantId) {
      return res.status(400).json({
        message: "Missing tenantId. Tenant admin must be assigned to a tenant.",
      });
    }

    const filters = {
      tenantId: isSuperAdmin ? req.query.tenantId : tenantId,
      siteId: req.query.siteId,
      type: req.query.type,
      severity: req.query.severity,
      limit: Number(req.query.limit || 50),
      offset: Number(req.query.offset || 0),
      startDate: req.query.startDate,
      endDate: req.query.endDate,
    };

    const events = await opsEventService.getOpEventsFeed(filters, models);

    return res.json({
      data: events,
      count: events.length,
      filters,
    });
  } catch (e) {
    console.error("❌ Error getting command center feed:", e);
    console.error("Stack:", e.stack);
    return res.status(500).json({ 
      message: e.message || "Failed to load feed",
      error: process.env.NODE_ENV === "development" ? e.stack : undefined,
    });
  }
};

/**
 * GET /api/admin/command-center/at-risk-shifts
 * Get shifts ranked by risk score
 */
exports.getAtRiskShifts = async (req, res) => {
  try {
    const models = req.app.locals.models;
    
    // Check if models are available
    if (!models || !models.Shift) {
      console.error("❌ Models not available");
      return res.status(500).json({ 
        message: "Database models not initialized. Please restart the server.",
      });
    }

    const tenantId = req.admin?.tenant_id || req.query.tenantId;
    const isSuperAdmin = req.admin?.role === "super_admin";

    // For non-super admins without tenant_id, return empty array instead of error
    if (!isSuperAdmin && !tenantId) {
      console.warn("⚠️ Non-super admin without tenant_id - returning empty shifts");
      return res.json({
        data: [],
        count: 0,
        options: { limit: Number(req.query.limit || 20), minRiskScore: Number(req.query.minRiskScore || 40) },
        message: "No tenant assigned. Please contact an administrator to assign you to a tenant.",
      });
    }

    const targetTenantId = isSuperAdmin ? req.query.tenantId : tenantId;
    
    // If super admin but no tenantId provided, return empty array
    if (isSuperAdmin && !targetTenantId) {
      return res.json({
        data: [],
        count: 0,
        options: { limit: Number(req.query.limit || 20), minRiskScore: Number(req.query.minRiskScore || 40) },
        message: "Please provide tenantId query parameter for super admin access.",
      });
    }

    const options = {
      limit: Number(req.query.limit || 20),
      minRiskScore: Number(req.query.minRiskScore || 40),
    };

    const atRiskShifts = await riskScoringService.getAtRiskShifts(
      targetTenantId,
      models,
      options
    );

    return res.json({
      data: atRiskShifts || [],
      count: (atRiskShifts || []).length,
      options,
    });
  } catch (e) {
    console.error("❌ Error getting at-risk shifts:", e);
    console.error("Stack:", e.stack);
    
    // Return empty array instead of 500 error to allow page to load
    return res.json({
      data: [],
      count: 0,
      error: e.message || "Failed to load at-risk shifts",
      stack: process.env.NODE_ENV === "development" ? e.stack : undefined,
    });
  }
};

/**
 * POST /api/admin/command-center/briefing
 * Generate AI briefing for a tenant
 */
exports.generateBriefing = async (req, res) => {
  try {
    const models = req.app.locals.models;
    const tenantId = req.admin?.tenant_id || req.body.tenantId;
    const isSuperAdmin = req.admin?.role === "super_admin";

    if (!isSuperAdmin && !tenantId) {
      return res.status(400).json({
        message: "Missing tenantId. Tenant admin must be assigned to a tenant.",
      });
    }

    const targetTenantId = isSuperAdmin ? req.body.tenantId : tenantId;
    if (!targetTenantId) {
      return res.status(400).json({ message: "tenantId is required" });
    }

    const timeRange = req.body.timeRange || "24h"; // 24h, 7d, 30d
    const focus = req.body.focus || "all"; // all, coverage, incidents, compliance

    // Calculate date range
    const endDate = new Date();
    const startDate = new Date();
    if (timeRange === "24h") {
      startDate.setHours(startDate.getHours() - 24);
    } else if (timeRange === "7d") {
      startDate.setDate(startDate.getDate() - 7);
    } else if (timeRange === "30d") {
      startDate.setDate(startDate.getDate() - 30);
    }

    // Get events for time range
    const events = await opsEventService.getOpEventsByTimeRange(
      targetTenantId,
      startDate,
      endDate,
      models
    );

    // Get at-risk shifts
    const atRiskShifts = await riskScoringService.getAtRiskShifts(
      targetTenantId,
      models,
      { limit: 10, minRiskScore: 50 }
    );

    // Aggregate statistics
    const stats = {
      totalEvents: events.length,
      byType: {},
      bySeverity: {},
      newIncidents: 0,
      newCallouts: 0,
      openShifts: 0,
      atRiskShifts: atRiskShifts.length,
    };

    events.forEach((event) => {
      stats.byType[event.type] = (stats.byType[event.type] || 0) + 1;
      stats.bySeverity[event.severity] = (stats.bySeverity[event.severity] || 0) + 1;

      if (event.type === "INCIDENT") stats.newIncidents++;
      if (event.type === "CALLOUT") stats.newCallouts++;
      if (event.type === "SHIFT" && event.title.includes("New")) stats.openShifts++;
    });

    // Prepare data for AI analysis
    const operationalData = {
      events: events.map(e => e.toJSON ? e.toJSON() : e),
      atRiskShifts: atRiskShifts.map(item => ({
        shift: item.shift,
        risk: item.risk,
      })),
      stats,
    };

    const context = {
      tenantId: targetTenantId,
      timeRange,
      focus,
    };

    // Phase 2: Generate AI-powered briefing
    const aiAnalysis = await commandCenterAI.generateOperationalBriefing(operationalData, context);

    // Store AI-recommended actions in database
    const { CommandCenterAction } = models;
    const storedActions = [];
    if (aiAnalysis.recommendedActions && aiAnalysis.recommendedActions.length > 0) {
      for (const action of aiAnalysis.recommendedActions) {
        try {
          const stored = await CommandCenterAction.create({
            tenant_id: targetTenantId,
            action_type: action.type,
            recommended_by_ai: true,
            recommendation_reason: action.title || action.description || action.reason || "AI recommended action",
            confidence_score: action.confidence || 0.7,
            status: "PENDING",
            context: action.context || {},
          });
          storedActions.push(stored.id);
        } catch (err) {
          console.warn("⚠️ Failed to store action:", err.message);
        }
      }
    }

    // What changed (compare to previous period - simplified for Phase 1)
    const whatChanged = {
      newIncidents: stats.newIncidents,
      newCallouts: stats.newCallouts,
      atRiskShifts: stats.atRiskShifts,
      highSeverityEvents: stats.bySeverity.HIGH || 0,
      criticalEvents: stats.bySeverity.CRITICAL || 0,
    };

    return res.json({
      tenantId: targetTenantId,
      timeRange,
      focus,
      summary: aiAnalysis.summary,
      topRisks: aiAnalysis.topRisks || [],
      insights: aiAnalysis.insights || [],
      recommendedActions: aiAnalysis.recommendedActions || [],
      storedActionIds: storedActions, // IDs of actions stored in DB
      trends: aiAnalysis.trends || {},
      whatChanged,
      stats,
      generatedAt: new Date().toISOString(),
      aiGenerated: !!process.env.OPENAI_API_KEY, // Indicate if AI was used
    });
  } catch (e) {
    console.error("❌ Error generating briefing:", e);
    return res.status(500).json({ message: e.message });
  }
};

/**
 * POST /api/admin/command-center/ask
 * Natural language query over operational data (RAG)
 */
exports.askCommandCenter = async (req, res) => {
  try {
    const models = req.app.locals.models;
    const tenantId = req.admin?.tenant_id || req.body.tenantId;
    const isSuperAdmin = req.admin?.role === "super_admin";

    if (!isSuperAdmin && !tenantId) {
      return res.status(400).json({
        message: "Missing tenantId. Tenant admin must be assigned to a tenant.",
      });
    }

    const targetTenantId = isSuperAdmin ? req.body.tenantId : tenantId;
    if (!targetTenantId) {
      return res.status(400).json({ message: "tenantId is required" });
    }

    const { question } = req.body;
    if (!question || typeof question !== "string" || question.trim().length === 0) {
      return res.status(400).json({ message: "Question is required" });
    }

    const options = {
      limit: Number(req.body.limit || 10),
      startDate: req.body.startDate ? new Date(req.body.startDate) : null,
    };

    // Query operational data using RAG
    console.log(`🤖 Querying Command Center: "${question.trim()}" for tenant: ${targetTenantId}`);
    const result = await operationalDataRag.queryOperationalData(
      question.trim(),
      targetTenantId,
      models,
      options
    );
    console.log(`✅ Query result: ${result.answer.substring(0, 100)}... (confidence: ${result.confidence})`);

    return res.json({
      question: question.trim(),
      answer: result.answer,
      citations: result.citations || [],
      confidence: result.confidence || 0.5,
      sources: result.sources || 0,
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    console.error("❌ Error querying command center:", e);
    console.error("Stack:", e.stack);
    return res.status(500).json({
      message: e.message || "Failed to query command center",
      error: process.env.NODE_ENV === "development" ? e.stack : undefined,
    });
  }
};

/**
 * POST /api/admin/command-center/actions/:id/approve
 * Approve and execute a recommended action
 */
exports.approveAction = async (req, res) => {
  try {
    const models = req.app.locals.models;
    const { CommandCenterAction } = models;
    const actionId = req.params.id;
    const adminId = req.admin?.id;

    if (!adminId) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const action = await CommandCenterAction.findByPk(actionId);
    if (!action) {
      return res.status(404).json({ message: "Action not found" });
    }

    if (action.status !== "PENDING") {
      return res.status(400).json({
        message: `Action is already ${action.status}`,
      });
    }

    // Update action to APPROVED
    await CommandCenterAction.update(
      {
        status: "APPROVED",
        approved_by_admin_id: adminId,
        approved_at: new Date(),
        updated_at: new Date(),
      },
      {
        where: { id: actionId },
      }
    );

    const executionResult = await actionExecutionService.executeAction(
      { ...action.toJSON(), id: actionId },
      models,
      req.app
    );

    return res.json({
      message: "Action approved and executed",
      action: {
        id: actionId,
        status: executionResult.success ? "EXECUTED" : "FAILED",
      },
      execution: executionResult,
    });
  } catch (e) {
    console.error("❌ Error approving action:", e);
    return res.status(500).json({
      message: e.message || "Failed to approve action",
    });
  }
};

/**
 * POST /api/admin/command-center/actions/:id/reject
 * Reject a recommended action
 */
exports.rejectAction = async (req, res) => {
  try {
    const models = req.app.locals.models;
    const { CommandCenterAction } = models;
    const actionId = req.params.id;
    const adminId = req.admin?.id;

    if (!adminId) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const action = await CommandCenterAction.findByPk(actionId);
    if (!action) {
      return res.status(404).json({ message: "Action not found" });
    }

    if (action.status !== "PENDING") {
      return res.status(400).json({
        message: `Action is already ${action.status}`,
      });
    }

    const rejectedReason = req.body.reason || "Rejected by admin";

    // Update action to REJECTED
    await CommandCenterAction.update(
      {
        status: "REJECTED",
        approved_by_admin_id: adminId,
        rejected_reason: rejectedReason,
        rejected_at: new Date(),
        updated_at: new Date(),
      },
      {
        where: { id: actionId },
      }
    );

    return res.json({
      message: "Action rejected",
      action: {
        id: actionId,
        status: "REJECTED",
        rejectedReason,
      },
    });
  } catch (e) {
    console.error("❌ Error rejecting action:", e);
    return res.status(500).json({
      message: e.message || "Failed to reject action",
    });
  }
};

/**
 * GET /api/admin/command-center/actions
 * Get all actions (pending, approved, rejected, executed)
 */
exports.getActions = async (req, res) => {
  try {
    const models = req.app.locals.models;
    
    if (!models || !models.CommandCenterAction) {
      console.error("❌ CommandCenterAction model not available");
      return res.status(500).json({
        message: "CommandCenterAction model not available. Please restart the server.",
      });
    }

    const { CommandCenterAction } = models;
    const tenantId = req.admin?.tenant_id;
    const isSuperAdmin = req.admin?.role === "super_admin";

    const where = {};
    if (!isSuperAdmin && tenantId) {
      where.tenant_id = tenantId;
    } else if (!isSuperAdmin && !tenantId) {
      // Return empty array if no tenant assigned
      return res.json({
        data: [],
        count: 0,
        message: "No tenant assigned. Please contact an administrator.",
      });
    }

    const status = req.query.status; // PENDING, APPROVED, REJECTED, EXECUTED, FAILED
    if (status && status !== "all") {
      where.status = status.toUpperCase();
    }

    try {
      const actions = await CommandCenterAction.findAll({
        where,
        order: [["created_at", "DESC"]],
        limit: Number(req.query.limit || 50),
      });

      return res.json({
        data: actions.map(a => a.toJSON ? a.toJSON() : a),
        count: actions.length,
      });
    } catch (dbError) {
      console.error("❌ Database error getting actions:", dbError);
      // Check if table doesn't exist
      if (dbError.message && dbError.message.includes("does not exist")) {
        return res.status(500).json({
          message: "CommandCenterAction table does not exist. Please run database migrations or restart the server to create tables.",
          error: process.env.NODE_ENV === "development" ? dbError.message : undefined,
        });
      }
      throw dbError;
    }
  } catch (e) {
    console.error("❌ Error getting actions:", e);
    console.error("Stack:", e.stack);
    return res.status(500).json({
      message: e.message || "Failed to get actions",
      error: process.env.NODE_ENV === "development" ? e.stack : undefined,
    });
  }
};

/**
 * POST /api/admin/command-center/actions
 * Create a new action (from AI recommendations or manual)
 */
exports.createAction = async (req, res) => {
  try {
    const models = req.app.locals.models;
    const { CommandCenterAction } = models;
    const tenantId = req.admin?.tenant_id || req.body.tenantId;
    const isSuperAdmin = req.admin?.role === "super_admin";

    if (!isSuperAdmin && !tenantId) {
      return res.status(400).json({
        message: "Missing tenantId. Tenant admin must be assigned to a tenant.",
      });
    }

    const targetTenantId = isSuperAdmin ? req.body.tenantId : tenantId;

    const action = await CommandCenterAction.create({
      tenant_id: targetTenantId,
      action_type: req.body.type || req.body.action_type,
      recommended_by_ai: req.body.recommended_by_ai || false,
      recommendation_reason: req.body.description || req.body.ai_reasoning || req.body.recommendation_reason || "Manual action",
      confidence_score: req.body.ai_confidence || req.body.confidence_score || 0.5,
      status: "PENDING",
      context: req.body.entity_refs || req.body.context || {},
    });

    return res.status(201).json({
      message: "Action created",
      action,
    });
  } catch (e) {
    console.error("❌ Error creating action:", e);
    return res.status(500).json({
      message: e.message || "Failed to create action",
    });
  }
};

/**
 * POST /api/admin/command-center/process-historical
 * Process historical data and create OpEvents retroactively
 * Body: { tenantId (optional), startDate, endDate, types: ["incidents", "callouts", "shifts"], limit, dryRun }
 */
exports.processHistoricalEvents = async (req, res) => {
  try {
    const models = req.app.locals.models;
    const tenantId = req.admin?.tenant_id || req.body.tenantId;
    const isSuperAdmin = req.admin?.role === "super_admin";

    if (!isSuperAdmin && !tenantId) {
      return res.status(400).json({
        message: "Missing tenantId. Tenant admin must be assigned to a tenant.",
      });
    }

    const targetTenantId = isSuperAdmin ? req.body.tenantId : tenantId;
    const types = req.body.types || ["incidents", "callouts", "shifts"];
    const options = {
      startDate: req.body.startDate ? new Date(req.body.startDate) : null,
      endDate: req.body.endDate ? new Date(req.body.endDate) : null,
      limit: Number(req.body.limit || 100),
      dryRun: req.body.dryRun === true,
      force: req.body.force === true,
      onlyOpen: req.body.onlyOpen === true,
    };

    const results = {
      incidents: null,
      callouts: null,
      shifts: null,
    };

    if (types.includes("incidents")) {
      results.incidents = await historicalEventProcessor.processHistoricalIncidents(
        targetTenantId,
        models,
        options
      );
    }

    if (types.includes("callouts")) {
      results.callouts = await historicalEventProcessor.processHistoricalCallouts(
        targetTenantId,
        models,
        options
      );
    }

    if (types.includes("shifts")) {
      results.shifts = await historicalEventProcessor.processHistoricalShifts(
        targetTenantId,
        models,
        options
      );
    }

    const total = {
      processed:
        (results.incidents?.processed || 0) +
        (results.callouts?.processed || 0) +
        (results.shifts?.processed || 0),
      skipped:
        (results.incidents?.skipped || 0) +
        (results.callouts?.skipped || 0) +
        (results.shifts?.skipped || 0),
      errors:
        (results.incidents?.errors || 0) +
        (results.callouts?.errors || 0) +
        (results.shifts?.errors || 0),
    };

    return res.json({
      message: options.dryRun ? "Dry run completed" : "Historical processing completed",
      results,
      total,
      options,
    });
  } catch (e) {
    console.error("❌ Error processing historical events:", e);
    return res.status(500).json({
      message: e.message || "Failed to process historical events",
      error: process.env.NODE_ENV === "development" ? e.stack : undefined,
    });
  }
};

/**
 * GET /api/admin/command-center/site-health
 * Get site health overview for all sites
 * Query params: tenantId (optional for super admin), days
 */
exports.getSiteHealth = async (req, res) => {
  try {
    const models = req.app.locals.models;
    const tenantId = req.admin?.tenant_id;
    const isSuperAdmin = req.admin?.role === "super_admin";

    const targetTenantId = isSuperAdmin ? req.query.tenantId : tenantId;
    
    // If no tenantId available, return empty data instead of error
    if (!targetTenantId) {
      const options = {
        days: Number(req.query.days || 30),
        includeRiskScores: req.query.includeRiskScores !== "false",
      };
      
      return res.json({
        data: [],
        count: 0,
        options,
        message: isSuperAdmin 
          ? "Please select a tenant to view site health data." 
          : "No tenant assigned. Please contact an administrator to assign you to a tenant.",
      });
    }

    const options = {
      days: Number(req.query.days || 30),
      includeRiskScores: req.query.includeRiskScores !== "false",
    };

    const siteHealth = await siteHealthService.getSiteHealthOverview(
      targetTenantId,
      models,
      options
    );

    // Always return success, even if empty
    return res.json({
      data: siteHealth || [],
      count: (siteHealth || []).length,
      options,
      message: (siteHealth || []).length === 0 ? "No site activity found. Data will appear as sites have incidents, events, or shifts." : undefined,
    });
  } catch (e) {
    console.error("❌ Error in getSiteHealth:", e);
    console.error("❌ Error stack:", e.stack);
    // Return empty data instead of error to prevent UI crashes
    return res.json({
      data: [],
      count: 0,
      options: { days: Number(req.query.days || 30) },
      message: "Error loading site health data. Please try again later.",
    });
    // Return empty array instead of error status
    return res.json({
      data: [],
      count: 0,
      message: "No site health data available. This is normal if no operational activity has occurred yet.",
      error: process.env.NODE_ENV === "development" ? e.message : undefined,
    });
  }
};

/**
 * GET /api/admin/command-center/site-health/:siteId
 * Get detailed site health for a specific site
 * Query params: tenantId (optional for super admin), days
 */
exports.getSiteHealthDetails = async (req, res) => {
  try {
    const models = req.app.locals.models;
    const siteId = req.params.siteId;
    const tenantId = req.admin?.tenant_id;
    const isSuperAdmin = req.admin?.role === "super_admin";

    if (!isSuperAdmin && !tenantId) {
      return res.status(400).json({
        message: "Missing tenantId. Tenant admin must be assigned to a tenant.",
      });
    }

    const targetTenantId = isSuperAdmin ? req.query.tenantId : tenantId;
    if (!targetTenantId) {
      return res.status(400).json({ message: "tenantId is required" });
    }

    const options = {
      days: Number(req.query.days || 30),
    };

    const siteHealth = await siteHealthService.getSiteHealthDetails(
      siteId,
      targetTenantId,
      models,
      options
    );

    return res.json({
      data: siteHealth,
    });
  } catch (e) {
    console.error("❌ Error getting site health details:", e);
    return res.status(500).json({
      message: e.message || "Failed to get site health details",
      error: process.env.NODE_ENV === "development" ? e.stack : undefined,
    });
  }
};

/**
 * GET /api/admin/command-center/guard-readiness
 * Get guard readiness overview for all guards
 * Query params: tenantId (optional for super admin), days, minReliability, limit
 */
exports.getGuardReadiness = async (req, res) => {
  try {
    const models = req.app.locals.models;
    const tenantId = req.admin?.tenant_id;
    const isSuperAdmin = req.admin?.role === "super_admin";

    if (!isSuperAdmin && !tenantId) {
      return res.status(400).json({
        message: "Missing tenantId. Tenant admin must be assigned to a tenant.",
      });
    }

    const targetTenantId = isSuperAdmin ? req.query.tenantId : tenantId;

    const options = {
      days: Number(req.query.days || 30),
      minReliability: Number(req.query.minReliability || 0),
      limit: Number(req.query.limit || 50),
    };

    const guardReadiness = await guardReadinessService.getGuardReadinessOverview(
      targetTenantId,
      models,
      options
    );

    // Always return success, even if empty
    return res.json({
      data: guardReadiness || [],
      count: (guardReadiness || []).length,
      options,
      message: (guardReadiness || []).length === 0 ? "No guard readiness data available. This is normal if no guards have shifts or activity yet." : undefined,
    });
  } catch (e) {
    console.error("❌ Error getting guard readiness:", e);
    // Return empty array instead of error status
    return res.json({
      data: [],
      count: 0,
      message: "No guard readiness data available. This is normal if no guards have shifts or activity yet.",
      error: process.env.NODE_ENV === "development" ? e.message : undefined,
    });
  }
};

/**
 * GET /api/admin/command-center/guard-readiness/:guardId
 * Get detailed guard readiness for a specific guard
 * Query params: tenantId (optional for super admin), days
 */
exports.getGuardReadinessDetails = async (req, res) => {
  try {
    const models = req.app.locals.models;
    const guardId = req.params.guardId;
    const tenantId = req.admin?.tenant_id;
    const isSuperAdmin = req.admin?.role === "super_admin";

    if (!isSuperAdmin && !tenantId) {
      return res.status(400).json({
        message: "Missing tenantId. Tenant admin must be assigned to a tenant.",
      });
    }

    const targetTenantId = isSuperAdmin ? req.query.tenantId : tenantId;

    const options = {
      days: Number(req.query.days || 30),
    };

    const guardReadiness = await guardReadinessService.getGuardReadinessDetails(
      guardId,
      models,
      options
    );

    return res.json({
      data: guardReadiness,
    });
  } catch (e) {
    console.error("❌ Error getting guard readiness details:", e);
    return res.status(500).json({
      message: e.message || "Failed to get guard readiness details",
      error: process.env.NODE_ENV === "development" ? e.stack : undefined,
    });
  }
};

/**
 * POST /api/admin/command-center/weekly-report
 * Generate a weekly operational report with AI summary
 * Body: { startDate?, endDate?, includeGuards?, includeSites? }
 */
exports.generateWeeklyReport = async (req, res) => {
  try {
    const models = req.app.locals.models;
    const tenantId = req.admin?.tenant_id;
    const isSuperAdmin = req.admin?.role === "super_admin";

    if (!isSuperAdmin && !tenantId) {
      return res.status(400).json({
        message: "Missing tenantId. Tenant admin must be assigned to a tenant.",
      });
    }

    const targetTenantId = isSuperAdmin ? req.body.tenantId : tenantId;

    const options = {
      startDate: req.body.startDate ? new Date(req.body.startDate) : null,
      endDate: req.body.endDate ? new Date(req.body.endDate) : null,
      includeGuards: req.body.includeGuards !== false,
      includeSites: req.body.includeSites !== false,
    };

    const report = await weeklyReportService.generateWeeklyReport(
      targetTenantId,
      models,
      options
    );

    return res.json({
      data: report,
    });
  } catch (e) {
    console.error("❌ Error generating weekly report:", e);
    return res.status(500).json({
      message: e.message || "Failed to generate weekly report",
      error: process.env.NODE_ENV === "development" ? e.stack : undefined,
    });
  }
};

/**
 * GET /api/admin/command-center/weekly-report/export
 * Export weekly report as CSV
 * Query params: startDate, endDate, tenantId (optional for super admin)
 */
exports.exportWeeklyReport = async (req, res) => {
  try {
    const models = req.app.locals.models;
    const tenantId = req.admin?.tenant_id;
    const isSuperAdmin = req.admin?.role === "super_admin";

    if (!isSuperAdmin && !tenantId) {
      return res.status(400).json({
        message: "Missing tenantId. Tenant admin must be assigned to a tenant.",
      });
    }

    const targetTenantId = isSuperAdmin ? req.query.tenantId : tenantId;

    const options = {
      startDate: req.query.startDate ? new Date(req.query.startDate) : null,
      endDate: req.query.endDate ? new Date(req.query.endDate) : null,
    };

    // Generate report
    const report = await weeklyReportService.generateWeeklyReport(
      targetTenantId,
      models,
      options
    );

    // Export to CSV
    const csv = weeklyReportService.exportToCSV(report);

    // Set response headers for CSV download
    const startDateStr = report.period.startDate.split("T")[0];
    const endDateStr = report.period.endDate.split("T")[0];
    const filename = `weekly-report-${startDateStr}-to-${endDateStr}.csv`;

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    return res.send(csv);
  } catch (e) {
    console.error("❌ Error exporting weekly report:", e);
    return res.status(500).json({
      message: e.message || "Failed to export weekly report",
      error: process.env.NODE_ENV === "development" ? e.stack : undefined,
    });
  }
};

/**
 * GET /api/admin/command-center/weekly-report/export-pdf
 * Export weekly report as PDF
 * Query params: startDate, endDate, tenantId (optional for super admin)
 */
exports.exportWeeklyReportPDF = async (req, res) => {
  try {
    const models = req.app.locals.models;
    const tenantId = req.admin?.tenant_id;
    const isSuperAdmin = req.admin?.role === "super_admin";

    if (!isSuperAdmin && !tenantId) {
      return res.status(400).json({
        message: "Missing tenantId. Tenant admin must be assigned to a tenant.",
      });
    }

    const targetTenantId = isSuperAdmin ? req.query.tenantId : tenantId;

    const options = {
      startDate: req.query.startDate ? new Date(req.query.startDate) : null,
      endDate: req.query.endDate ? new Date(req.query.endDate) : null,
    };

    // Generate report
    const report = await weeklyReportService.generateWeeklyReport(
      targetTenantId,
      models,
      options
    );

    // Export to PDF
    const pdfBuffer = await weeklyReportService.exportToPDF(report);

    // Set response headers for PDF download
    const startDateStr = report.period.startDate.split("T")[0];
    const endDateStr = report.period.endDate.split("T")[0];
    const filename = `weekly-report-${startDateStr}-to-${endDateStr}.pdf`;

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    return res.send(pdfBuffer);
  } catch (e) {
    console.error("❌ Error exporting weekly report as PDF:", e);
    return res.status(500).json({
      message: e.message || "Failed to export weekly report as PDF",
      error: process.env.NODE_ENV === "development" ? e.stack : undefined,
    });
  }
};
