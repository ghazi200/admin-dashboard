/**
 * GET /api/guard/dashboard — guard-ui personal dashboard (same DB as admin-dashboard).
 */
const { getGuardTenantSqlFilter } = require("../utils/guardTenantFilter");
const {
  calculatePerformanceMetrics,
  calculateEarnings,
  getUpcomingShifts,
  calculateAchievements,
  calculateStreaks,
} = require("../services/guardDashboardData");

exports.getGuardDashboard = async (req, res) => {
  try {
    const guardId = req.guard?.id;
    if (!guardId) {
      return res.status(401).json({ error: "Unauthorized - missing guardId" });
    }

    const sequelize = req.app.locals.models?.sequelize;
    if (!sequelize) {
      return res.status(500).json({ message: "Database not available" });
    }

    const user = {
      id: guardId,
      guardId,
      tenant_id: req.guard?.tenant_id || null,
    };

    const params = [guardId];
    const tenantFilter = getGuardTenantSqlFilter(user, params);
    const tenantWhere = tenantFilter ? `AND ${tenantFilter}` : "";

    async function safeSelect(sql, label) {
      try {
        const result = await sequelize.query(sql, { bind: params });
        const rows = result?.[0];
        return Array.isArray(rows) ? rows : [];
      } catch (e) {
        console.warn(`[guard dashboard] ${label}:`, e.message);
        return [];
      }
    }

    const shiftsSql = `
      SELECT id, shift_date, shift_start, shift_end, status, location, created_at, guard_id
      FROM public.shifts
      WHERE guard_id = $1 ${tenantWhere}
      ORDER BY shift_date DESC NULLS LAST, shift_start DESC NULLS LAST`;

    const timeEntriesSql = `
      SELECT id, shift_id, clock_in_at, clock_out_at, lunch_start_at, lunch_end_at
      FROM public.time_entries
      WHERE guard_id = $1 ${tenantWhere}
      ORDER BY clock_in_at DESC NULLS LAST`;

    const calloutsSql = `
      SELECT id, shift_id, reason, created_at
      FROM public.callouts
      WHERE guard_id = $1 ${tenantWhere}
      ORDER BY created_at DESC NULLS LAST`;

    const reputationSql = `
      SELECT trust_score, score, comment, created_at
      FROM public.guard_reputation
      WHERE guard_id = $1 ${tenantWhere}
      ORDER BY created_at DESC NULLS LAST
      LIMIT 1`;

    const [shifts, timeEntries, callouts, reputationRows] = await Promise.all([
      safeSelect(shiftsSql, "shifts"),
      safeSelect(timeEntriesSql, "time_entries"),
      safeSelect(calloutsSql, "callouts"),
      safeSelect(reputationSql, "guard_reputation"),
    ]);

    const reputation = reputationRows?.[0] || null;
    const performance = calculatePerformanceMetrics(shifts, timeEntries, callouts);
    const earnings = calculateEarnings(timeEntries, shifts);
    const upcomingShifts = getUpcomingShifts(shifts);
    const achievements = calculateAchievements(shifts, timeEntries, callouts, performance);
    const streaks = calculateStreaks(shifts, timeEntries, callouts);

    return res.json({
      upcomingShifts,
      performance,
      earnings,
      achievements,
      streaks,
      reputation: reputation
        ? {
            trustScore: reputation.trust_score,
            latestScore: reputation.score,
            latestComment: reputation.comment,
          }
        : null,
    });
  } catch (err) {
    console.error("Get guard dashboard error:", err);
    return res.status(500).json({
      error: "Server error",
      message: err.message,
    });
  }
};
