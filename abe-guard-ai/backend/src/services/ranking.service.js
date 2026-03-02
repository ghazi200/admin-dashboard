/**
 * Enhanced Ranking Service
 * 
 * Features:
 * 1. Reliability decay over time
 * 2. Site-specific success rates
 * 3. Enhanced guard scoring with multiple factors
 */

const { Op } = require("sequelize");

/**
 * Calculate reliability decay based on days since last shift
 * @param {Date|string|null} lastShiftDate - Last shift date
 * @param {number} baseScore - Base reliability score (default 0.8)
 * @param {number} decayFactor - Decay per day (default 0.98 = 2% per day)
 * @returns {number} Decayed reliability score (0-1)
 */
function calculateReliabilityDecay(lastShiftDate, baseScore = 0.8, decayFactor = 0.98) {
  if (!lastShiftDate) {
    // If no last shift date, assume 30 days ago (decayed)
    const daysSince = 30;
    return baseScore * Math.pow(decayFactor, daysSince);
  }

  const lastShift = new Date(lastShiftDate);
  const now = new Date();
  const daysSince = Math.floor((now - lastShift) / (1000 * 60 * 60 * 24));
  
  // Apply decay (e.g., 0.98^days means 2% decay per day)
  const decayedScore = baseScore * Math.pow(decayFactor, Math.max(0, daysSince));
  
  return Math.max(0.1, Math.min(1.0, decayedScore)); // Clamp between 0.1 and 1.0
}

/**
 * Calculate site-specific success rate for a guard
 * @param {string} guardId - Guard ID
 * @param {string} location - Shift location
 * @param {Object} models - Sequelize models
 * @returns {Promise<Object>} { successRate: number, shiftCount: number, onTimeRate: number }
 */
async function calculateSiteSuccessRate(guardId, location, models) {
  const { Shift } = models;
  
  if (!location) {
    return { successRate: 0.5, shiftCount: 0, onTimeRate: 0.5 }; // Default neutral
  }

  try {
    // Find all shifts for this guard at this location
    const shifts = await Shift.findAll({
      where: {
        guard_id: guardId,
        location: location,
        status: "CLOSED",
      },
      order: [["shift_date", "DESC"]],
      limit: 100, // Last 100 shifts at this location
    });

    if (shifts.length === 0) {
      return { successRate: 0.5, shiftCount: 0, onTimeRate: 0.5 }; // No history = neutral
    }

    // Calculate success rate (completed shifts / total shifts at this location)
    const completedShifts = shifts.length;
    
    // For on-time rate, we'd need actual_start_time vs shift_start (not currently tracked)
    // For now, we'll use a simple completion-based success rate
    const successRate = Math.min(1.0, completedShifts / 10); // Cap at 100% after 10 shifts

    return {
      successRate: Math.max(0.1, Math.min(1.0, successRate)), // Clamp 0.1-1.0
      shiftCount: completedShifts,
      onTimeRate: 0.5, // Placeholder (would need actual_start_time tracking)
    };
  } catch (error) {
    console.error("Error calculating site success rate:", error);
    return { successRate: 0.5, shiftCount: 0, onTimeRate: 0.5 }; // Fallback to neutral
  }
}

/**
 * Enhanced guard scoring with multiple factors
 * @param {Object} guard - Guard object
 * @param {Object} shift - Shift object
 * @param {Object} siteStats - Site-specific statistics
 * @param {number} decayedReliability - Decayed reliability score
 * @param {number} trustScore - Reputation/trust score (0.0 to 1.0)
 * @returns {Object} { score: number, factors: Object }
 */
function calculateGuardScore(guard, shift, siteStats, decayedReliability, trustScore = null) {
  let score = 0;
  const factors = {};

  // 1. Acceptance Rate (35% weight, reduced from 40%)
  const acceptanceWeight = 0.35;
  const acceptanceContribution = (guard.acceptance_rate || 0.85) * acceptanceWeight;
  score += acceptanceContribution;
  factors.acceptanceRate = guard.acceptance_rate || 0.85;
  factors.acceptanceWeight = acceptanceWeight;

  // 2. Decayed Reliability Score (25% weight, reduced from 30%)
  const reliabilityWeight = 0.25;
  const reliabilityContribution = decayedReliability * reliabilityWeight;
  score += reliabilityContribution;
  factors.reliabilityScore = decayedReliability;
  factors.reliabilityWeight = reliabilityWeight;
  factors.reliabilityDecayed = true;

  // 3. Trust Score / Reputation (15% weight) - NEW
  if (trustScore !== null && trustScore !== undefined) {
    const trustWeight = 0.15;
    const trustContribution = parseFloat(trustScore) * trustWeight;
    score += trustContribution;
    factors.trustScore = parseFloat(trustScore);
    factors.trustWeight = trustWeight;
  }

  // 4. Site-Specific Success Rate (15% weight)
  const siteWeight = 0.15;
  const siteContribution = siteStats.successRate * siteWeight;
  score += siteContribution;
  factors.siteSuccessRate = siteStats.successRate;
  factors.siteShiftCount = siteStats.shiftCount;
  factors.siteWeight = siteWeight;

  // 4. Fatigue Penalty (if weekly hours > 40)
  const fatiguePenalty = (guard.weekly_hours || 0) > 40 ? 0.15 : 0;
  score -= fatiguePenalty;
  factors.fatiguePenalty = fatiguePenalty;
  factors.weeklyHours = guard.weekly_hours || 0;

  // 5. Low Hours Bonus (if weekly hours < 20)
  const lowHoursBonus = (guard.weekly_hours || 0) < 20 ? 0.05 : 0;
  score += lowHoursBonus;
  factors.lowHoursBonus = lowHoursBonus;

  // Clamp final score
  const finalScore = Math.max(0, Math.min(1, score));
  factors.finalScore = finalScore;

  return { score: finalScore, factors };
}

/**
 * Enhanced ranking function with reliability decay and site-specific rates
 * @param {Array} guards - Array of guard objects
 * @param {Object} shift - Shift object
 * @param {Object} models - Sequelize models (optional, for site stats)
 * @returns {Promise<Array>} Ranked guards with enhanced data
 */
async function rankGuards(guards, shift = null, models = null) {
  if (!guards || guards.length === 0) return [];

  // If no shift or models provided, use simple ranking
  if (!shift || !models) {
    return guards.sort((a, b) => {
      return (a.weekly_hours || 0) - (b.weekly_hours || 0);
    });
  }

  // Enhanced ranking with site stats and decay
  const guardsWithScores = await Promise.all(
    guards.map(async (guard) => {
      // Calculate decayed reliability
      // Note: We need last_shift_date from guard or calculate from shifts
      // For now, we'll calculate it from the database
      let lastShiftDate = null;
      try {
        const { Shift } = models;
        const lastShift = await Shift.findOne({
          where: {
            guard_id: guard.id,
            status: "CLOSED",
          },
          order: [["shift_date", "DESC"]],
          limit: 1,
        });
        if (lastShift) {
          lastShiftDate = lastShift.shift_date;
        }
      } catch (error) {
        console.error("Error fetching last shift:", error);
      }

      const baseReliability = guard.reliability_score || 0.8;
      const decayedReliability = calculateReliabilityDecay(lastShiftDate, baseReliability);

      // Calculate site-specific success rate
      const location = shift.location || null;
      const siteStats = await calculateSiteSuccessRate(guard.id, location, models);

      // Get reputation/trust score
      let trustScore = null;
      try {
        const guardReputationService = require("./guardReputation.service");
        const tenantId = shift.tenant_id || guard.tenant_id;
        if (tenantId) {
          trustScore = await guardReputationService.calculateTrustScore(
            models,
            guard.id,
            tenantId
          );
        }
      } catch (error) {
        // Trust score service may not be available or guard has no reviews yet
        // Continue without trust score (it's optional)
      }

      // Calculate enhanced score (including trust score)
      const scoreData = calculateGuardScore(guard, shift, siteStats, decayedReliability, trustScore);

      return {
        ...guard,
        _rankScore: scoreData.score,
        _rankFactors: scoreData.factors,
        _lastShiftDate: lastShiftDate,
        _decayedReliability: decayedReliability,
        _siteStats: siteStats,
      };
    })
  );

  // Sort by score (highest first)
  return guardsWithScores.sort((a, b) => {
    return (b._rankScore || 0) - (a._rankScore || 0);
  });
}

// Export both the enhanced async function and simple fallback
module.exports = rankGuards;
module.exports.calculateReliabilityDecay = calculateReliabilityDecay;
module.exports.calculateSiteSuccessRate = calculateSiteSuccessRate;
module.exports.calculateGuardScore = calculateGuardScore;
