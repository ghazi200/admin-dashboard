/**
 * Analytics Controller
 * Handles analytics API endpoints
 */

const analyticsService = require("../services/analytics.service");

/**
 * GET /api/admin/analytics/kpis
 * Get real-time KPIs
 */
exports.getKPIs = async (req, res) => {
  try {
    const models = req.app.locals.models;
    const kpis = await analyticsService.getRealTimeKPIs(models);
    return res.json(kpis);
  } catch (error) {
    console.error("Error getting KPIs:", error);
    return res.status(500).json({
      message: "Failed to load KPIs",
      error: error.message,
    });
  }
};

/**
 * GET /api/admin/analytics/trends?days=30
 * Get trend analysis
 */
exports.getTrends = async (req, res) => {
  try {
    const models = req.app.locals.models;
    const days = Math.max(7, Math.min(90, Number(req.query.days || 30)));
    const trends = await analyticsService.getTrendAnalysis(models, days);
    return res.json(trends);
  } catch (error) {
    console.error("Error getting trends:", error);
    return res.status(500).json({
      message: "Failed to load trend analysis",
      error: error.message,
    });
  }
};

/**
 * GET /api/admin/analytics/performance?days=30
 * Get performance metrics
 */
exports.getPerformance = async (req, res) => {
  try {
    const models = req.app.locals.models;
    const days = Math.max(7, Math.min(90, Number(req.query.days || 30)));
    const performance = await analyticsService.getPerformanceMetrics(
      models,
      days
    );
    return res.json(performance);
  } catch (error) {
    console.error("Error getting performance:", error);
    return res.status(500).json({
      message: "Failed to load performance metrics",
      error: error.message,
    });
  }
};

/**
 * GET /api/admin/analytics/comparative
 * Get comparative analytics (week-over-week, month-over-month)
 */
exports.getComparative = async (req, res) => {
  try {
    const models = req.app.locals.models;
    const comparative = await analyticsService.getComparativeAnalytics(models);
    return res.json(comparative);
  } catch (error) {
    console.error("Error getting comparative analytics:", error);
    return res.status(500).json({
      message: "Failed to load comparative analytics",
      error: error.message,
    });
  }
};

/**
 * GET /api/admin/analytics/overview
 * Get all analytics data in one call
 */
exports.getOverview = async (req, res) => {
  try {
    const models = req.app.locals.models;
    const days = Math.max(7, Math.min(90, Number(req.query.days || 30)));

    const [kpis, trends, performance, comparative] = await Promise.all([
      analyticsService.getRealTimeKPIs(models),
      analyticsService.getTrendAnalysis(models, days),
      analyticsService.getPerformanceMetrics(models, days),
      analyticsService.getComparativeAnalytics(models),
    ]);

    return res.json({
      kpis,
      trends,
      performance,
      comparative,
    });
  } catch (error) {
    console.error("Error getting analytics overview:", error);
    return res.status(500).json({
      message: "Failed to load analytics overview",
      error: error.message,
    });
  }
};
