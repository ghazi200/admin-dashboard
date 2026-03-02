/**
 * Fairness Rebalancing Controller
 * Handles API endpoints for fairness analysis and rebalancing
 */

const fairnessRebalancingService = require('../services/fairnessRebalancing.service');

/**
 * GET /api/admin/fairness-rebalancing/analyze
 * Analyze fairness distribution
 */
exports.analyze = async (req, res) => {
  try {
    const tenantId = req.query.tenantId || req.admin?.tenant_id;
    const { startDate, endDate, lookbackDays } = req.query;

    if (!tenantId) {
      return res.status(400).json({
        message: 'tenantId is required'
      });
    }

    const analysis = await fairnessRebalancingService.analyzeFairness(
      tenantId,
      {
        startDate,
        endDate,
        lookbackDays: lookbackDays ? parseInt(lookbackDays, 10) : 14
      },
      req.app.locals.models
    );

    return res.json({
      success: true,
      analysis
    });
  } catch (error) {
    console.error('analyze error:', error);
    return res.status(500).json({
      message: 'Failed to analyze fairness',
      error: error.message
    });
  }
};

/**
 * GET /api/admin/fairness-rebalancing/suggestions
 * Get rebalancing suggestions
 */
exports.getSuggestions = async (req, res) => {
  try {
    const tenantId = req.query.tenantId || req.admin?.tenant_id;
    const { startDate, endDate, lookbackDays, minScore } = req.query;

    if (!tenantId) {
      return res.status(400).json({
        message: 'tenantId is required'
      });
    }

    const suggestions = await fairnessRebalancingService.generateRebalancingSuggestions(
      tenantId,
      {
        startDate,
        endDate,
        lookbackDays: lookbackDays ? parseInt(lookbackDays, 10) : 14,
        minScore: minScore ? parseFloat(minScore) : 50
      },
      req.app.locals.models
    );

    return res.json({
      success: true,
      ...suggestions
    });
  } catch (error) {
    console.error('getSuggestions error:', error);
    return res.status(500).json({
      message: 'Failed to get rebalancing suggestions',
      error: error.message
    });
  }
};

/**
 * POST /api/admin/fairness-rebalancing/auto-rebalance
 * Automatically rebalance shifts
 */
exports.autoRebalance = async (req, res) => {
  try {
    const tenantId = req.body.tenantId || req.admin?.tenant_id;
    const {
      autoApply = false,
      minScore = 50,
      maxReassignments = 10,
      lookbackDays = 14
    } = req.body;

    if (!tenantId) {
      return res.status(400).json({
        message: 'tenantId is required'
      });
    }

    const results = await fairnessRebalancingService.autoRebalance(
      tenantId,
      {
        autoApply,
        minScore,
        maxReassignments,
        lookbackDays
      },
      req.app.locals.models
    );

    // Emit socket event
    const io = req.app.locals.io;
    if (io && results.results && results.results.totalApplied > 0) {
      io.to(`tenant:${tenantId}`).emit('shifts_rebalanced', {
        totalApplied: results.results.totalApplied,
        applied: results.results.applied.length,
        failed: results.results.failed.length
      });
    }

    return res.json({
      success: true,
      ...results
    });
  } catch (error) {
    console.error('autoRebalance error:', error);
    return res.status(500).json({
      message: 'Failed to rebalance shifts',
      error: error.message
    });
  }
};
