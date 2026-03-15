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
    return res.status(200).json({
      guards: { total: 0, available: 0, unavailable: 0, availabilityRate: 0 },
      shifts: { openToday: 0, openTotal: 0, filledToday: 0, filledLast7Days: 0, coverageRate: 0 },
      callouts: { today: 0, last7Days: 0, calloutRate: 0 },
      notifications: { unread: 0 },
      activity: { availabilityChanges24h: 0 },
      _fallback: true,
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
    const days = Math.max(7, Math.min(90, Number(req.query.days || 30)));
    const empty = Array(days).fill(0);
    const labels = [];
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    for (let i = days - 1; i >= 0; i--) {
      const x = new Date(d);
      x.setDate(x.getDate() - i);
      labels.push(x.toISOString().split("T")[0]);
    }
    return res.status(200).json({
      labels,
      data: {
        openShifts: empty,
        filledShifts: empty,
        callouts: empty,
        availableGuards: empty,
        coverageRate: empty,
      },
      summary: { avgOpenShifts: 0, avgFilledShifts: 0, avgCallouts: 0, avgCoverageRate: 0 },
      _fallback: true,
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
