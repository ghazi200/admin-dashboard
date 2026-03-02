/**
 * Risk Scoring Service
 * 
 * Phase 1: Deterministic rule-based risk scoring (no ML required)
 * Calculates risk scores for shifts, sites, guards, and compliance.
 * 
 * Future: Upgrade to ML-based scoring in Phase 3
 */

const { Op } = require("sequelize");

/**
 * Calculate shift failure risk score (0-100)
 * @param {Object} shift - Shift data
 * @param {Object} context - Context data (guard history, site patterns, etc.)
 * @returns {Number} Risk score 0-100
 */
function calculateShiftRisk(shift, context = {}) {
  let riskScore = 0;
  const factors = {};

  // 1. Past callouts (weight: 25%)
  const calloutRate = context.guardCalloutRate || 0;
  const calloutScore = Math.min(calloutRate * 100, 25);
  riskScore += calloutScore;
  factors.calloutRate = { score: calloutScore, rate: calloutRate };

  // 2. Lateness frequency (weight: 20%)
  const latenessRate = context.guardLatenessRate || 0;
  const latenessScore = Math.min(latenessRate * 100, 20);
  riskScore += latenessScore;
  factors.latenessRate = { score: latenessScore, rate: latenessRate };

  // 3. Site incident frequency (weight: 20%)
  const siteIncidentRate = context.siteIncidentRate || 0;
  const siteIncidentScore = Math.min(siteIncidentRate * 20, 20);
  riskScore += siteIncidentScore;
  factors.siteIncidentRate = { score: siteIncidentScore, rate: siteIncidentRate };

  // 4. Distance to site (weight: 15%) - if geo available
  if (context.distanceMiles) {
    const distanceScore = Math.min(context.distanceMiles / 2, 15);
    riskScore += distanceScore;
    factors.distance = { score: distanceScore, miles: context.distanceMiles };
  }

  // 5. Consecutive hours worked (weight: 10%)
  if (context.consecutiveHours > 8) {
    const fatigueScore = Math.min((context.consecutiveHours - 8) * 2, 10);
    riskScore += fatigueScore;
    factors.fatigue = { score: fatigueScore, hours: context.consecutiveHours };
  }

  // 6. Time until shift start (weight: 10%)
  const hoursUntil = context.hoursUntilShiftStart || 24;
  if (hoursUntil < 2 && hoursUntil > 0) {
    const urgencyScore = Math.min((2 - hoursUntil) * 5, 10);
    riskScore += urgencyScore;
    factors.urgency = { score: urgencyScore, hoursUntil };
  }

  // Cap at 100
  riskScore = Math.min(riskScore, 100);

  return {
    riskScore: Math.round(riskScore * 100) / 100,
    factors,
    riskLevel: getRiskLevel(riskScore),
  };
}

/**
 * Get risk level from score
 * @param {Number} score
 * @returns {String} LOW, MEDIUM, HIGH, CRITICAL
 */
function getRiskLevel(score) {
  if (score >= 80) return "CRITICAL";
  if (score >= 60) return "HIGH";
  if (score >= 40) return "MEDIUM";
  return "LOW";
}

/**
 * Calculate guard reliability risk
 * @param {String} guardId
 * @param {Object} models - Sequelize models
 * @param {Object} options - { days = 30 }
 * @returns {Promise<Object>} Risk score and factors
 */
async function calculateGuardReliabilityRisk(guardId, models, options = {}) {
  try {
    if (!guardId) {
      return {
        riskScore: 50,
        riskLevel: "MEDIUM",
        factors: {},
        metadata: { totalShifts: 0, callouts: 0, calloutRate: 0, days: options.days || 30 },
      };
    }

    const { Shift, CallOut } = models;
    if (!Shift || !CallOut) {
      console.warn("⚠️ Shift or CallOut models not available");
      return {
        riskScore: 50,
        riskLevel: "MEDIUM",
        factors: {},
        metadata: { totalShifts: 0, callouts: 0, calloutRate: 0, days: options.days || 30 },
      };
    }

    const days = options.days || 30;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    // Get guard's shifts in period
    let shifts = [];
    try {
      shifts = await Shift.findAll({
        where: {
          guard_id: guardId,
          created_at: { [Op.gte]: cutoffDate },
        },
      });
    } catch (err) {
      console.warn("⚠️ Error fetching shifts for guard:", guardId, err.message);
      shifts = [];
    }

    // Count callouts - CallOut model uses 'created_at' field
    let callouts = 0;
    try {
      callouts = await CallOut.count({
        where: {
          guard_id: guardId,
          created_at: { [Op.gte]: cutoffDate },
        },
      });
    } catch (err) {
      // If CallOut query fails, try with different field name or skip
      console.warn("⚠️ Could not count callouts for guard:", guardId, err.message);
      callouts = 0;
    }

    const totalShifts = shifts.length;
    const calloutRate = totalShifts > 0 ? callouts / totalShifts : 0;

    // Calculate risk
    let riskScore = 0;
    const factors = {};

    // Callout rate contributes up to 70% of risk
    riskScore += Math.min(calloutRate * 70, 70);
    factors.calloutRate = { value: calloutRate, score: Math.min(calloutRate * 70, 70) };

    // Fewer shifts = higher uncertainty (30%)
    if (totalShifts < 5) {
      const uncertaintyScore = ((5 - totalShifts) / 5) * 30;
      riskScore += uncertaintyScore;
      factors.lowData = { shifts: totalShifts, score: uncertaintyScore };
    }

    riskScore = Math.min(riskScore, 100);

    return {
      riskScore: Math.round(riskScore * 100) / 100,
      riskLevel: getRiskLevel(riskScore),
      factors,
      metadata: {
        totalShifts,
        callouts,
        calloutRate,
        days,
      },
    };
  } catch (error) {
    // Return safe default if calculation fails
    console.error("❌ Error calculating guard reliability risk:", error);
    return {
      riskScore: 50, // Default medium risk
      riskLevel: "MEDIUM",
      factors: {},
      metadata: {
        totalShifts: 0,
        callouts: 0,
        calloutRate: 0,
        days: options.days || 30,
        error: error.message,
      },
    };
  }
}

/**
 * Calculate site risk level
 * @param {String} siteId - Site ID (optional, Shift model doesn't have site_id)
 * @param {Object} models - Sequelize models
 * @param {Object} options - { days = 30 }
 * @returns {Promise<Object>} Risk score and factors
 */
async function calculateSiteRisk(siteId, models, options = {}) {
  // Note: Shift model doesn't have site_id field, it has 'location' (string)
  // For now, return minimal risk if site_id is provided but can't be used
  // In the future, would need to join with sites table or use location field
  
  if (!siteId) {
    return {
      riskScore: 0,
      riskLevel: "LOW",
      factors: {},
      metadata: { openShifts: 0, days: options.days || 30 },
    };
  }

  // Since Shift model doesn't have site_id, we can't calculate site-specific risk
  // Return default low risk for now
  return {
    riskScore: 0,
    riskLevel: "LOW",
    factors: {},
    metadata: {
      openShifts: 0,
      days: options.days || 30,
      note: "Site risk calculation not available (Shift model uses 'location' field, not 'site_id')",
    },
  };
}

/**
 * Get at-risk shifts with calculated risk scores
 * @param {String} tenantId
 * @param {Object} models - Sequelize models
 * @param {Object} options - { limit = 20, minRiskScore = 40 }
 * @returns {Promise<Array>} Shifts with risk scores
 */
async function getAtRiskShifts(tenantId, models, options = {}) {
  try {
    // Validate inputs
    if (!tenantId) {
      console.warn("⚠️ getAtRiskShifts called without tenantId");
      return [];
    }

    if (!models || !models.Shift) {
      console.error("❌ Shift model not available in models");
      throw new Error("Shift model not available");
    }

    const { Shift } = models;
    const limit = options.limit || 20;
    const minRiskScore = options.minRiskScore || 40;

    // Get open shifts for tenant
    // For shift_date comparison, we compare date strings (DATEONLY field)
    const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD format
    
    let shifts = [];
    try {
      shifts = await Shift.findAll({
      where: {
        tenant_id: tenantId,
        status: "OPEN",
        shift_date: { [Op.gte]: today },
      },
        limit: 100, // Get more to calculate risk, then filter
        order: [["shift_date", "ASC"], ["shift_start", "ASC"]],
      });
    } catch (err) {
      console.error("❌ Error fetching shifts for tenant:", tenantId, err.message);
      throw new Error(`Failed to fetch shifts: ${err.message}`);
    }

    // If no shifts, return empty array
    if (!shifts || shifts.length === 0) {
      return [];
    }

    // Calculate risk for each shift (with error handling)
    const shiftsWithRisk = await Promise.all(
      shifts.map(async (shift) => {
        try {
          const context = {};

          if (shift.guard_id) {
            // Get guard reliability (with error handling)
            try {
              const guardRisk = await calculateGuardReliabilityRisk(shift.guard_id, models);
              context.guardCalloutRate = guardRisk.metadata?.calloutRate || 0;
              context.guardLatenessRate = 0; // Would calculate from TimeEntry
            } catch (err) {
              console.warn("⚠️ Error calculating guard risk for shift:", shift.id, err.message);
              context.guardCalloutRate = 0.3; // Default moderate risk
              context.guardLatenessRate = 0;
            }
          } else {
            // Unassigned shift = higher risk
            context.guardCalloutRate = 0.5; // 50% proxy for unassigned
          }

          // Calculate hours until shift
          if (shift.shift_date && shift.shift_start) {
            try {
              const shiftDateTime = new Date(`${shift.shift_date}T${shift.shift_start}`);
              const now = new Date();
              const hoursUntil = (shiftDateTime - now) / (1000 * 60 * 60);
              context.hoursUntilShiftStart = hoursUntil;
            } catch (err) {
              console.warn("⚠️ Error calculating hours until shift:", shift.id, err.message);
              context.hoursUntilShiftStart = 24; // Default to 24 hours
            }
          }

          // Default site incident rate to 0 (site_id not available in Shift model)
          context.siteIncidentRate = 0;

          const riskResult = calculateShiftRisk(shift.toJSON(), context);

          return {
            shift: shift.toJSON(),
            risk: riskResult,
          };
        } catch (err) {
          console.error("❌ Error processing shift:", shift.id, err);
          // Return shift with default risk if calculation fails
          return {
            shift: shift.toJSON(),
            risk: {
              riskScore: 50,
              riskLevel: "MEDIUM",
              factors: { error: "Calculation failed" },
            },
          };
        }
      })
    );

    // Filter by min risk score and sort
    const atRiskShifts = shiftsWithRisk
      .filter((item) => item?.risk?.riskScore >= minRiskScore)
      .sort((a, b) => (b?.risk?.riskScore || 0) - (a?.risk?.riskScore || 0))
      .slice(0, limit);

    return atRiskShifts;
  } catch (error) {
    console.error("❌ Error in getAtRiskShifts:", error);
    throw error; // Re-throw to be caught by controller
  }
}

module.exports = {
  calculateShiftRisk,
  calculateGuardReliabilityRisk,
  calculateSiteRisk,
  getAtRiskShifts,
  getRiskLevel,
};
