/**
 * Guard Readiness Service
 * 
 * Calculates guard readiness metrics:
 * - Reliability scores
 * - Fatigue tracking
 * - Availability status
 * - Performance metrics
 * - Callout rate analysis
 * - Late clock-in tracking
 */

const { Op } = require("sequelize");

/**
 * Calculate guard reliability score
 * @param {String} guardId - Guard ID
 * @param {Object} models - Sequelize models
 * @param {Object} options - { days = 30 }
 * @returns {Promise<Object>} Guard reliability data
 */
async function calculateGuardReliability(guardId, models, options = {}) {
  try {
    const { Guard, Shift, CallOut, OpEvent, sequelize } = models;
    const days = options.days || 30;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Get guard details
    const guard = await Guard.findByPk(guardId);
    if (!guard) {
      throw new Error("Guard not found");
    }

    // Convert guardId to string for UUID comparison
    const guardIdStr = String(guardId);

    // Get shifts assigned to guard
    // Handle UUID type conversion: shifts.guard_id is UUID, but Guard.id might be integer
    let totalShifts = 0;
    let completedShifts = 0;
    try {
      if (sequelize) {
        const [totalRows] = await sequelize.query(
          `SELECT COUNT(*) as count FROM shifts 
           WHERE guard_id::text = $1::text 
           AND shift_date >= $2`,
          { bind: [guardIdStr, startDate.toISOString().split("T")[0]] }
        );
        totalShifts = parseInt(totalRows[0]?.count || 0, 10);

        const [completedRows] = await sequelize.query(
          `SELECT COUNT(*) as count FROM shifts 
           WHERE guard_id::text = $1::text 
           AND status = 'CLOSED'
           AND shift_date >= $2`,
          { bind: [guardIdStr, startDate.toISOString().split("T")[0]] }
        );
        completedShifts = parseInt(completedRows[0]?.count || 0, 10);
      } else {
        // Fallback to Sequelize (may fail if type mismatch)
        totalShifts = await Shift.count({
          where: {
            guard_id: guardId,
            shift_date: {
              [Op.gte]: startDate.toISOString().split("T")[0],
            },
          },
        });

        completedShifts = await Shift.count({
          where: {
            guard_id: guardId,
            status: "CLOSED",
            shift_date: {
              [Op.gte]: startDate.toISOString().split("T")[0],
            },
          },
        });
      }
    } catch (err) {
      console.warn("⚠️ Error counting shifts for guard:", guardId, err.message);
      totalShifts = 0;
      completedShifts = 0;
    }

    // Get callouts by this guard (handle UUID type conversion)
    let callouts = 0;
    try {
      if (sequelize) {
        const [rows] = await sequelize.query(
          `SELECT COUNT(*) as count FROM callouts 
           WHERE guard_id::text = $1::text 
           AND created_at >= $2`,
          { bind: [guardIdStr, startDate] }
        );
        callouts = parseInt(rows[0]?.count || 0, 10);
      } else {
        callouts = await CallOut.count({
          where: {
            guard_id: guardId,
            created_at: {
              [Op.gte]: startDate,
            },
          },
        });
      }
    } catch (err) {
      console.warn("⚠️ Error counting callouts for guard:", guardId, err.message);
      callouts = 0;
    }

    // Calculate reliability score (0-100)
    let reliabilityScore = 100;

    // Deduct for callouts (10 points per callout, max 50)
    reliabilityScore -= Math.min(callouts * 10, 50);

    // Deduct for incomplete shifts (if shifts were assigned but not completed)
    const incompleteShifts = totalShifts - completedShifts;
    reliabilityScore -= Math.min(incompleteShifts * 5, 30);

    // Ensure score doesn't go below 0
    reliabilityScore = Math.max(reliabilityScore, 0);

    // Determine reliability level
    let reliabilityLevel = "EXCELLENT";
    if (reliabilityScore >= 90) reliabilityLevel = "EXCELLENT";
    else if (reliabilityScore >= 75) reliabilityLevel = "GOOD";
    else if (reliabilityScore >= 60) reliabilityLevel = "FAIR";
    else if (reliabilityScore >= 40) reliabilityLevel = "POOR";
    else reliabilityLevel = "CRITICAL";

    // Calculate callout rate
    const calloutRate = totalShifts > 0 ? callouts / totalShifts : 0;

    // Get recent late clock-ins from OpEvents
    const lateClockIns = await OpEvent.count({
      where: {
        tenant_id: guard.tenant_id || null,
        type: "CLOCKIN",
        entity_refs: { guard_id: guardId },
        severity: { [Op.in]: ["HIGH", "CRITICAL"] }, // Late clock-ins are marked as high severity
        created_at: {
          [Op.gte]: startDate,
        },
      },
    });

    return {
      guard: {
        id: guard.id,
        name: guard.name,
        email: guard.email,
        phone: guard.phone,
        active: guard.active,
        availability: guard.availability,
      },
      metrics: {
        reliabilityScore: Math.round(reliabilityScore),
        reliabilityLevel,
        totalShifts,
        completedShifts,
        incompleteShifts,
        callouts,
        calloutRate: Math.round(calloutRate * 100) / 100,
        lateClockIns,
        completionRate: totalShifts > 0 ? Math.round((completedShifts / totalShifts) * 100) : 0,
      },
      trends: {
        last7Days: {
          shifts: 0, // Can be calculated separately if needed
          callouts: 0,
        },
        last30Days: {
          shifts: totalShifts,
          callouts: callouts,
        },
      },
    };
  } catch (error) {
    console.error("❌ Error calculating guard reliability:", error);
    throw error;
  }
}

/**
 * Get guard readiness overview for all guards
 * @param {String} tenantId - Tenant ID
 * @param {Object} models - Sequelize models
 * @param {Object} options - { days = 30, minReliability = 0, limit = 50 }
 * @returns {Promise<Array>} Guard readiness data
 */
async function getGuardReadinessOverview(tenantId, models, options = {}) {
  try {
    const { Guard, Shift, CallOut } = models;
    const days = options.days || 30;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    const minReliability = options.minReliability || 0;
    const limit = options.limit || 50;

    // Get all active guards
    // Note: Guard model may not have tenant_id field
    const guards = await Guard.findAll({
      where: {
        active: true,
      },
      limit,
      order: [["name", "ASC"]],
    });

    // Calculate readiness for each guard
    const guardReadinessData = await Promise.all(
      guards.map(async (guard) => {
        try {
          const reliability = await calculateGuardReliability(guard.id, models, { days });
          return reliability;
        } catch (error) {
          // Skip guards with errors, log warning
          console.warn(`⚠️ Error calculating reliability for guard ${guard.id}:`, error.message);
          return null;
        }
      })
    );

    // Filter out nulls and apply minimum reliability filter
    const filtered = guardReadinessData
      .filter((g) => g !== null && g.metrics.reliabilityScore >= minReliability)
      .sort((a, b) => a.metrics.reliabilityScore - b.metrics.reliabilityScore); // Worst first

    return filtered;
  } catch (error) {
    console.error("❌ Error getting guard readiness overview:", error);
    // Return empty array instead of throwing
    return [];
  }
}

/**
 * Get detailed guard readiness for a specific guard
 * @param {String} guardId - Guard ID
 * @param {Object} models - Sequelize models
 * @param {Object} options - { days = 30 }
 * @returns {Promise<Object>} Detailed guard readiness data
 */
async function getGuardReadinessDetails(guardId, models, options = {}) {
  try {
    const { Guard, Shift, CallOut, OpEvent } = models;
    const days = options.days || 30;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Get guard details
    const guard = await Guard.findByPk(guardId);
    if (!guard) {
      throw new Error("Guard not found");
    }

    // Get recent shifts
    const recentShifts = await Shift.findAll({
      where: {
        guard_id: guardId,
        shift_date: {
          [Op.gte]: startDate.toISOString().split("T")[0],
        },
      },
      order: [["shift_date", "DESC"]],
      limit: 20,
    });

    // Get recent callouts (handle UUID type conversion)
    let recentCallouts = [];
    try {
      if (sequelize) {
        const [rows] = await sequelize.query(
          `SELECT id, reason, created_at, shift_id
           FROM callouts 
           WHERE guard_id::text = $1::text 
           AND created_at >= $2
           ORDER BY created_at DESC 
           LIMIT 10`,
          { bind: [guardIdStr, startDate] }
        );
        recentCallouts = rows || [];
      } else {
        recentCallouts = await CallOut.findAll({
          where: {
            guard_id: guardId,
            created_at: {
              [Op.gte]: startDate,
            },
          },
          order: [["created_at", "DESC"]],
          limit: 10,
        });
      }
    } catch (err) {
      console.warn("⚠️ Error fetching recent callouts for guard:", guardId, err.message);
      recentCallouts = [];
    }

    // Get recent operational events
    const recentEvents = await OpEvent.findAll({
      where: {
        entity_refs: { guard_id: guardId },
        created_at: {
          [Op.gte]: startDate,
        },
      },
      order: [["created_at", "DESC"]],
      limit: 20,
    });

    // Calculate trends (last 7 days vs last 30 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    // Count shifts for last 7 days (handle UUID type conversion)
    let shifts7d = 0;
    try {
      if (sequelize) {
        const [rows] = await sequelize.query(
          `SELECT COUNT(*) as count FROM shifts 
           WHERE guard_id::text = $1::text 
           AND shift_date >= $2`,
          { bind: [guardIdStr, sevenDaysAgo.toISOString().split("T")[0]] }
        );
        shifts7d = parseInt(rows[0]?.count || 0, 10);
      } else {
        shifts7d = await Shift.count({
          where: {
            guard_id: guardId,
            shift_date: {
              [Op.gte]: sevenDaysAgo.toISOString().split("T")[0],
            },
          },
        });
      }
    } catch (err) {
      console.warn("⚠️ Error counting shifts for last 7 days:", err.message);
      shifts7d = 0;
    }

    // Count callouts for last 7 days (handle UUID type conversion)
    let callouts7d = 0;
    try {
      if (sequelize) {
        const [rows] = await sequelize.query(
          `SELECT COUNT(*) as count FROM callouts 
           WHERE guard_id::text = $1::text 
           AND created_at >= $2`,
          { bind: [guardIdStr, sevenDaysAgo] }
        );
        callouts7d = parseInt(rows[0]?.count || 0, 10);
      } else {
        callouts7d = await CallOut.count({
          where: {
            guard_id: guardId,
            created_at: {
              [Op.gte]: sevenDaysAgo,
            },
          },
        });
      }
    } catch (err) {
      console.warn("⚠️ Error counting callouts for last 7 days:", err.message);
      callouts7d = 0;
    }

    const reliability = await calculateGuardReliability(guardId, models, { days });

    // Determine readiness status
    let readinessStatus = "READY";
    if (!guard.active) readinessStatus = "INACTIVE";
    else if (!guard.availability) readinessStatus = "UNAVAILABLE";
    else if (reliability.metrics.reliabilityScore < 50) readinessStatus = "AT_RISK";
    else if (reliability.metrics.reliabilityScore < 70) readinessStatus = "CONCERN";
    else readinessStatus = "READY";

    return {
      ...reliability,
      readinessStatus,
      recentShifts: recentShifts.map((s) => ({
        id: s.id,
        shift_date: s.shift_date,
        shift_start: s.shift_start,
        shift_end: s.shift_end,
        status: s.status,
        location: s.location,
      })),
      recentCallouts: recentCallouts.map((c) => ({
        id: c.id,
        reason: c.reason,
        created_at: c.created_at,
        shift_id: c.shift_id,
      })),
      recentEvents: recentEvents.slice(0, 10).map((e) => ({
        id: e.id,
        type: e.type,
        severity: e.severity,
        title: e.title,
        created_at: e.created_at,
      })),
      trends: {
        ...reliability.trends,
        last7Days: {
          shifts: shifts7d,
          callouts: callouts7d,
        },
        trend: callouts7d > (reliability.metrics.callouts / 4) 
          ? "INCREASING" 
          : callouts7d < (reliability.metrics.callouts / 6) 
          ? "DECREASING" 
          : "STABLE",
      },
    };
  } catch (error) {
    console.error("❌ Error getting guard readiness details:", error);
    throw error;
  }
}

module.exports = {
  calculateGuardReliability,
  getGuardReadinessOverview,
  getGuardReadinessDetails,
};
