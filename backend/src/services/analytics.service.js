/**
 * Analytics Service
 * Provides comprehensive analytics, KPIs, and trend analysis
 */

const { Op } = require("sequelize");

// Date helpers
function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function formatDate(d) {
  return d.toISOString().split("T")[0];
}

function formatDay(d) {
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${days[d.getDay()]} ${months[d.getMonth()]} ${d.getDate()}`;
}

/**
 * Get Real-Time KPIs
 */
async function getRealTimeKPIs(models) {
  const { Shift, CallOut, Guard, AvailabilityLog, Notification } = models;
  const crypto = require("crypto");

  try {
    const now = new Date();
    const today = startOfDay(now);
    const yesterday = addDays(today, -1);
    const last7Days = addDays(today, -7);

    const totalGuards = await Guard.count({ where: { active: true } }).catch(() => 0);
    const activeGuards = await Guard.findAll({
      where: { active: true },
      attributes: ["id"],
    }).catch(() => []);

    // Open Shifts
    const openShiftsToday = await Shift.count({
      where: { status: "OPEN", shift_date: { [Op.gte]: formatDate(today) } },
    }).catch(() => 0);
    const openShiftsTotal = await Shift.count({ where: { status: "OPEN" } }).catch(() => 0);
    const calloutsToday = await CallOut.count({
      where: { created_at: { [Op.gte]: today } },
    }).catch(() => 0);
    const calloutsLast7Days = await CallOut.count({
      where: { created_at: { [Op.gte]: last7Days } },
    }).catch(() => 0);
    const filledShiftsToday = await Shift.count({
      where: { status: "CLOSED", shift_date: { [Op.gte]: formatDate(today) } },
    }).catch(() => 0);
    const filledShiftsLast7Days = await Shift.count({
      where: { status: "CLOSED", shift_date: { [Op.gte]: formatDate(last7Days) } },
    }).catch(() => 0);

    // Coverage Rate
    const totalShiftsToday = openShiftsToday + filledShiftsToday;
    const coverageRateToday =
      totalShiftsToday > 0
        ? Math.round((filledShiftsToday / totalShiftsToday) * 100)
        : 0;

    // Callout Rate (callouts per shift)
    const totalShiftsLast7Days = await Shift.count({
      where: { shift_date: { [Op.gte]: formatDate(last7Days) } },
    }).catch(() => 0);
    const calloutRate =
      totalShiftsLast7Days > 0
        ? Math.round((calloutsLast7Days / totalShiftsLast7Days) * 100)
        : 0;

    const availabilityChanges = await AvailabilityLog.count({
      where: { createdAt: { [Op.gte]: yesterday } },
    }).catch(() => 0);

    let availableGuards = totalGuards;
    if (activeGuards.length === 0) {
      availableGuards = 0;
    } else {
      try {
        const guardIdInts = activeGuards.map((guard) => {
          const hash = crypto.createHash("md5").update(String(guard.id)).digest("hex");
          return parseInt(hash.substring(0, 8), 16) % 2147483647;
        });
        const [recentLogs] = await models.sequelize.query(
          `
          SELECT DISTINCT ON ("guardId")
            "guardId",
            "to"::boolean as is_available,
            "createdAt"
          FROM availability_logs
          WHERE "guardId" = ANY($1::int[])
            AND "guardId" > 1000
          ORDER BY "guardId", "createdAt" DESC
        `,
          { bind: [guardIdInts] }
        );
        const availabilityByIntId = new Map();
        (recentLogs || []).forEach((log) => {
          if (log.guardId > 1000) availabilityByIntId.set(log.guardId, Boolean(log.is_available));
        });
        availableGuards = 0;
        activeGuards.forEach((guard) => {
          const hash = crypto.createHash("md5").update(String(guard.id)).digest("hex");
          const guardIdInt = parseInt(hash.substring(0, 8), 16) % 2147483647;
          const availability = availabilityByIntId.get(guardIdInt);
          if (availability === true || availability === undefined) availableGuards++;
        });
      } catch (e) {
        console.warn("getRealTimeKPIs: availability_logs optional query failed:", e.message);
        availableGuards = totalGuards;
      }
    }

    const unreadNotificationsSafe = await Notification.count({
      where: { createdAt: { [Op.gte]: last7Days } },
    }).catch(() => 0);

    return {
      guards: {
        total: totalGuards,
        available: availableGuards,
        unavailable: totalGuards - availableGuards,
        availabilityRate:
          totalGuards > 0
            ? Math.round((availableGuards / totalGuards) * 100)
            : 0,
      },
      shifts: {
        openToday: openShiftsToday,
        openTotal: openShiftsTotal,
        filledToday: filledShiftsToday,
        filledLast7Days: filledShiftsLast7Days,
        coverageRate: coverageRateToday,
      },
      callouts: {
        today: calloutsToday,
        last7Days: calloutsLast7Days,
        calloutRate: calloutRate,
      },
      notifications: {
        unread: unreadNotificationsSafe,
      },
      activity: {
        availabilityChanges24h: availabilityChanges,
      },
    };
  } catch (error) {
    console.error("Error getting real-time KPIs:", error);
    throw error;
  }
}

/**
 * Get Trend Analysis
 */
async function getTrendAnalysis(models, days = 30) {
  const { Shift, CallOut, Guard, AvailabilityLog } = models;

  try {
    const today = startOfDay(new Date());
    const start = addDays(today, -(days - 1));
    const end = addDays(today, 1);

    const labels = [];
    const data = {
      openShifts: [],
      filledShifts: [],
      callouts: [],
      availableGuards: [],
      coverageRate: [],
    };

    // Generate labels
    for (let i = 0; i < days; i++) {
      const date = addDays(start, i);
      labels.push(formatDay(date));
    }

    const indexFor = (date) => {
      const d0 = startOfDay(new Date(date));
      return Math.floor((d0 - start) / (24 * 60 * 60 * 1000));
    };

    const shifts = await Shift.findAll({
      where: {
        shift_date: { [Op.gte]: formatDate(start), [Op.lt]: formatDate(end) },
      },
      attributes: ["shift_date", "status", "created_at"],
    }).catch(() => []);

    const openShiftsByDay = Array(days).fill(0);
    const filledShiftsByDay = Array(days).fill(0);

    shifts.forEach((shift) => {
      // shift_date is a DATEONLY string (YYYY-MM-DD), convert to Date for indexFor
      const shiftDate = shift.shift_date ? new Date(shift.shift_date) : null;
      if (shiftDate) {
        const idx = indexFor(shiftDate);
        if (idx >= 0 && idx < days) {
          if (shift.status === "OPEN") {
            openShiftsByDay[idx] += 1;
          } else if (shift.status === "CLOSED") {
            filledShiftsByDay[idx] += 1;
          }
        }
      }
    });

    const callouts = await CallOut.findAll({
      where: { created_at: { [Op.gte]: start, [Op.lt]: end } },
      attributes: ["created_at"],
    }).catch(() => []);

    const calloutsByDay = Array(days).fill(0);
    callouts.forEach((callout) => {
      const idx = indexFor(callout.created_at);
      if (idx >= 0 && idx < days) {
        calloutsByDay[idx] += 1;
      }
    });

    // Get available guards snapshot (daily average)
    // For simplicity, we'll use current count, but in production you'd want historical snapshots
    // Note: availability is not a column in guards table, need to query AvailabilityLog
    const crypto = require('crypto');
    const activeGuardsForTrend = await Guard.findAll({
      where: { active: true },
      attributes: ["id"],
    }).catch(() => []);
    
    let availableNow = 0;
    if (activeGuardsForTrend.length > 0) {
      try {
        const guardIdInts = activeGuardsForTrend.map((guard) => {
          const hash = crypto.createHash("md5").update(String(guard.id)).digest("hex");
          return parseInt(hash.substring(0, 8), 16) % 2147483647;
        });
        const [recentLogs] = await models.sequelize.query(
          `
          SELECT DISTINCT ON ("guardId")
            "guardId", "to"::boolean as is_available, "createdAt"
          FROM availability_logs
          WHERE "guardId" = ANY($1::int[]) AND "guardId" > 1000
          ORDER BY "guardId", "createdAt" DESC
        `,
          { bind: [guardIdInts] }
        );
        const availabilityByIntId = new Map();
        (recentLogs || []).forEach((log) => {
          if (log.guardId > 1000) availabilityByIntId.set(log.guardId, Boolean(log.is_available));
        });
        activeGuardsForTrend.forEach((guard) => {
          const hash = crypto.createHash("md5").update(String(guard.id)).digest("hex");
          const guardIdInt = parseInt(hash.substring(0, 8), 16) % 2147483647;
          const availability = availabilityByIntId.get(guardIdInt);
          if (availability === true || availability === undefined) availableNow++;
        });
      } catch (e) {
        console.warn("getTrendAnalysis: availability_logs skipped:", e.message);
        availableNow = activeGuardsForTrend.length;
      }
    }
    
    const availableGuardsByDay = Array(days).fill(availableNow);

    // Calculate coverage rate by day
    const coverageRateByDay = Array(days).fill(0);
    for (let i = 0; i < days; i++) {
      const total = openShiftsByDay[i] + filledShiftsByDay[i];
      if (total > 0) {
        coverageRateByDay[i] = Math.round(
          (filledShiftsByDay[i] / total) * 100
        );
      }
    }

    return {
      labels,
      data: {
        openShifts: openShiftsByDay,
        filledShifts: filledShiftsByDay,
        callouts: calloutsByDay,
        availableGuards: availableGuardsByDay,
        coverageRate: coverageRateByDay,
      },
      summary: {
        avgOpenShifts: Math.round(
          openShiftsByDay.reduce((a, b) => a + b, 0) / days
        ),
        avgFilledShifts: Math.round(
          filledShiftsByDay.reduce((a, b) => a + b, 0) / days
        ),
        avgCallouts: Math.round(
          calloutsByDay.reduce((a, b) => a + b, 0) / days
        ),
        avgCoverageRate: Math.round(
          coverageRateByDay.reduce((a, b) => a + b, 0) / days
        ),
      },
    };
  } catch (error) {
    console.error("Error getting trend analysis:", error);
    throw error;
  }
}

/**
 * Get Performance Metrics
 */
async function getPerformanceMetrics(models, days = 30) {
  const { Shift, CallOut, Guard, sequelize } = models;

  try {
    const today = startOfDay(new Date());
    const start = addDays(today, -(days - 1));
    const startDateStr = formatDate(start);

    // Guard Performance
    const guards = await Guard.findAll({
      where: { active: true },
      attributes: ["id", "name"], // Removed "availability" - it's not a column in guards table
    });

    const guardPerformance = await Promise.all(
      guards.map(async (guard) => {
        const guardIdStr = String(guard.id);
        let shifts = 0;
        let callouts = 0;

        try {
          // Use raw SQL for UUID comparison
          if (sequelize) {
            const [shiftRows] = await sequelize.query(
              `SELECT COUNT(*) as count FROM shifts 
               WHERE guard_id::text = $1::text 
               AND shift_date >= $2
               AND status = 'CLOSED'`,
              { bind: [guardIdStr, startDateStr] }
            );
            shifts = parseInt(shiftRows[0]?.count || 0, 10);

            const [calloutRows] = await sequelize.query(
              `SELECT COUNT(*) as count FROM callouts 
               WHERE guard_id::text = $1::text 
               AND created_at >= $2`,
              { bind: [guardIdStr, start] }
            );
            callouts = parseInt(calloutRows[0]?.count || 0, 10);
          } else {
            // Fallback to Sequelize
            shifts = await Shift.count({
              where: {
                guard_id: guard.id,
                shift_date: { [Op.gte]: startDateStr },
                status: "CLOSED",
              },
            });

            callouts = await CallOut.count({
              where: {
                guard_id: guard.id,
                created_at: { [Op.gte]: start },
              },
            });
          }
        } catch (err) {
          console.warn(`⚠️ Error getting performance for guard ${guard.id}:`, err.message);
          shifts = 0;
          callouts = 0;
        }

        const reliability =
          shifts + callouts > 0
            ? Math.round((shifts / (shifts + callouts)) * 100)
            : 100;

        return {
          guardId: guard.id,
          guardName: guard.name,
          shiftsCompleted: shifts,
          callouts: callouts,
          reliability: reliability,
        };
      })
    );

    // Sort by reliability
    guardPerformance.sort((a, b) => b.reliability - a.reliability);

    return {
      topPerformers: guardPerformance.slice(0, 10),
      bottomPerformers: guardPerformance.slice(-10).reverse(),
      averageReliability: Math.round(
        guardPerformance.reduce((sum, g) => sum + g.reliability, 0) /
          guardPerformance.length
      ),
    };
  } catch (error) {
    console.error("Error getting performance metrics:", error);
    throw error;
  }
}

/**
 * Get Comparative Analytics
 */
async function getComparativeAnalytics(models) {
  const { Shift, CallOut } = models;

  try {
    const now = new Date();
    const today = startOfDay(now);

    // Current week (last 7 days)
    const currentWeekStart = addDays(today, -6);
    const currentWeekEnd = addDays(today, 1);

    // Previous week
    const previousWeekStart = addDays(today, -13);
    const previousWeekEnd = addDays(today, -6);

    // Current month
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const currentMonthEnd = addDays(today, 1);

    // Previous month
    const previousMonthStart = new Date(
      now.getFullYear(),
      now.getMonth() - 1,
      1
    );
    const previousMonthEnd = new Date(now.getFullYear(), now.getMonth(), 1);

    // Week-over-week
    const currentWeekShifts = await Shift.count({
      where: {
        shift_date: {
          [Op.gte]: formatDate(currentWeekStart),
          [Op.lt]: formatDate(currentWeekEnd),
        },
      },
    });

    const previousWeekShifts = await Shift.count({
      where: {
        shift_date: {
          [Op.gte]: formatDate(previousWeekStart),
          [Op.lt]: formatDate(previousWeekEnd),
        },
      },
    });

    const currentWeekCallouts = await CallOut.count({
      where: {
        created_at: { [Op.gte]: currentWeekStart, [Op.lt]: currentWeekEnd },
      },
    });

    const previousWeekCallouts = await CallOut.count({
      where: {
        created_at: {
          [Op.gte]: previousWeekStart,
          [Op.lt]: previousWeekEnd,
        },
      },
    });

    // Month-over-month
    const currentMonthShifts = await Shift.count({
      where: {
        shift_date: {
          [Op.gte]: formatDate(currentMonthStart),
          [Op.lt]: formatDate(currentMonthEnd),
        },
      },
    });

    const previousMonthShifts = await Shift.count({
      where: {
        shift_date: {
          [Op.gte]: formatDate(previousMonthStart),
          [Op.lt]: formatDate(previousMonthEnd),
        },
      },
    });

    const currentMonthCallouts = await CallOut.count({
      where: {
        created_at: { [Op.gte]: currentMonthStart, [Op.lt]: currentMonthEnd },
      },
    });

    const previousMonthCallouts = await CallOut.count({
      where: {
        created_at: {
          [Op.gte]: previousMonthStart,
          [Op.lt]: previousMonthEnd,
        },
      },
    });

    const calculateChange = (current, previous) => {
      if (previous === 0) return current > 0 ? 100 : 0;
      return Math.round(((current - previous) / previous) * 100);
    };

    return {
      weekOverWeek: {
        shifts: {
          current: currentWeekShifts,
          previous: previousWeekShifts,
          change: calculateChange(currentWeekShifts, previousWeekShifts),
        },
        callouts: {
          current: currentWeekCallouts,
          previous: previousWeekCallouts,
          change: calculateChange(currentWeekCallouts, previousWeekCallouts),
        },
      },
      monthOverMonth: {
        shifts: {
          current: currentMonthShifts,
          previous: previousMonthShifts,
          change: calculateChange(currentMonthShifts, previousMonthShifts),
        },
        callouts: {
          current: currentMonthCallouts,
          previous: previousMonthCallouts,
          change: calculateChange(currentMonthCallouts, previousMonthCallouts),
        },
      },
    };
  } catch (error) {
    console.error("Error getting comparative analytics:", error);
    throw error;
  }
}

module.exports = {
  getRealTimeKPIs,
  getTrendAnalysis,
  getPerformanceMetrics,
  getComparativeAnalytics,
};
