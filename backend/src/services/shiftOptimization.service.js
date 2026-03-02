/**
 * Shift Optimization Service
 * 
 * AI-powered shift assignment optimization:
 * - Scores guards based on availability, skills, performance, cost, fairness
 * - Detects conflicts (double-booking, overtime, breaks)
 * - Provides ranked recommendations
 * - Auto-assigns best match (with admin override capability)
 */

const guardReadinessService = require('./guardReadiness.service');

/**
 * Calculate guard score for a specific shift
 * @param {Object} guard - Guard object
 * @param {Object} shift - Shift object (date, time, location, etc.)
 * @param {Object} models - Sequelize models
 * @returns {Promise<Object>} Guard score and reasoning
 */
async function calculateGuardScore(guard, shift, models) {
  const { sequelize } = models;
  const guardId = guard.id;
  const guardIdStr = String(guardId); // Convert to string for UUID handling
  const shiftDate = shift.shift_date;
  const shiftStart = shift.shift_start;
  const shiftEnd = shift.shift_end;
  const location = shift.location;

  const scores = {
    availability: 0,
    experience: 0,
    performance: 0,
    cost: 0,
    fairness: 0,
  };

  const reasons = {
    availability: [],
    experience: [],
    performance: [],
    cost: [],
    fairness: [],
  };

  // ============================================
  // 1. AVAILABILITY SCORE (30% weight)
  // ============================================
  let availabilityScore = 0;
  
  // Check if guard has conflicting shift
  // Handle UUID properly - use text comparison
  const shiftIdStr = shift.id ? String(shift.id) : '00000000-0000-0000-0000-000000000000';
  
  const [conflicts] = await sequelize.query(`
    SELECT COUNT(*) as count
    FROM shifts
    WHERE guard_id::text = $1::text
      AND shift_date = $2::date
      AND status IN ('OPEN', 'CLOSED')
      AND id::text != $3::text
      AND (
        (shift_start::time <= $4::time AND shift_end::time > $4::time)
        OR (shift_start::time < $5::time AND shift_end::time >= $5::time)
        OR (shift_start::time >= $4::time AND shift_end::time <= $5::time)
      )
  `, {
    bind: [guardIdStr, shiftDate, shiftIdStr, shiftStart, shiftEnd]
  });

  const conflictCount = parseInt(conflicts[0]?.count || 0);
  if (conflictCount > 0) {
    availabilityScore = 0;
    reasons.availability.push('Has conflicting shift');
  } else {
    availabilityScore = 100; // No conflicts = available
    reasons.availability.push('No conflicting shifts');
  }

  // Check recent availability (if guard marked unavailable recently, reduce score)
  // Note: availability_logs might use different column names, handle gracefully
  try {
    const [recentUnavailable] = await sequelize.query(`
      SELECT COUNT(*) as count
      FROM availability_logs
      WHERE "guardId"::text = $1::text
        AND "createdAt" >= NOW() - INTERVAL '7 days'
        AND "to" = false
    `, {
      bind: [guardIdStr]
    });
    const recentUnavailableCount = parseInt(recentUnavailable[0]?.count || 0);
    if (recentUnavailableCount > 0) {
      availabilityScore = Math.max(0, availabilityScore - (recentUnavailableCount * 10));
      reasons.availability.push(`${recentUnavailableCount} recent unavailability mark(s)`);
    }
  } catch (err) {
    // Table might not exist or have different schema - ignore
    console.warn("⚠️ Could not check availability logs:", err.message);
  }

  scores.availability = availabilityScore;

  // ============================================
  // 2. EXPERIENCE SCORE (25% weight)
  // ============================================
  let experienceScore = 0;

  // Check location experience
  const [locationExperience] = await sequelize.query(`
    SELECT COUNT(*) as count
    FROM shifts
    WHERE guard_id::text = $1::text
      AND location = $2
      AND status = 'CLOSED'
  `, {
    bind: [guardIdStr, location || '']
  });

  const locationCount = parseInt(locationExperience[0]?.count || 0);
  if (locationCount > 0) {
    experienceScore += Math.min(50, locationCount * 10); // Up to 50 points for location experience
    reasons.experience.push(`${locationCount} previous shift(s) at this location`);
  } else {
    reasons.experience.push('No previous experience at this location');
  }

  // Check shift time experience (morning/afternoon/night)
  const [hours] = shiftStart.split(':').map(Number);
  let shiftType = 'day';
  if (hours >= 22 || hours <= 6) {
    shiftType = 'night';
  } else if (hours >= 14) {
    shiftType = 'afternoon';
  } else {
    shiftType = 'morning';
  }

  const [shiftTypeExperience] = await sequelize.query(`
    SELECT COUNT(*) as count
    FROM shifts
    WHERE guard_id::text = $1::text
      AND status = 'CLOSED'
      AND (
        ($2 = 'morning' AND shift_start::time >= '06:00:00' AND shift_start::time < '12:00:00')
        OR ($2 = 'afternoon' AND shift_start::time >= '12:00:00' AND shift_start::time < '18:00:00')
        OR ($2 = 'night' AND (shift_start::time >= '18:00:00' OR shift_start::time < '06:00:00'))
      )
  `, {
    bind: [guardIdStr, shiftType]
  });

  const shiftTypeCount = parseInt(shiftTypeExperience[0]?.count || 0);
  if (shiftTypeCount > 0) {
    experienceScore += Math.min(30, shiftTypeCount * 5); // Up to 30 points for shift type experience
    reasons.experience.push(`${shiftTypeCount} ${shiftType} shift(s) completed`);
  }

  // Overall shift experience
  const [totalShifts] = await sequelize.query(`
    SELECT COUNT(*) as count
    FROM shifts
    WHERE guard_id::text = $1::text
      AND status = 'CLOSED'
  `, {
    bind: [guardIdStr]
  });

  const totalShiftCount = parseInt(totalShifts[0]?.count || 0);
  experienceScore += Math.min(20, totalShiftCount); // Up to 20 points for overall experience
  if (totalShiftCount > 0) {
    reasons.experience.push(`${totalShiftCount} total completed shifts`);
  }

  scores.experience = Math.min(100, experienceScore);

  // ============================================
  // 3. PERFORMANCE SCORE (20% weight)
  // ============================================
  let performanceScore = 50; // Default baseline

  try {
    // Ensure guardId is a string for UUID handling
    const guardIdStr = String(guardId);
    const reliability = await guardReadinessService.calculateGuardReliability(
      guardIdStr,
      models,
      { days: 30 }
    );

    // Reliability score (0-100) - use metrics.reliabilityScore
    const reliabilityScore = reliability?.metrics?.reliabilityScore || 50;
    performanceScore = reliabilityScore;

    // Adjust based on callout rate
    const calloutRate = reliability?.metrics?.calloutRate || 0;
    if (calloutRate < 0.05) { // Less than 5% callout rate
      performanceScore += 20;
      reasons.performance.push('Excellent reliability (low callout rate)');
    } else if (calloutRate < 0.10) { // Less than 10%
      performanceScore += 10;
      reasons.performance.push('Good reliability');
    } else {
      performanceScore -= 20;
      reasons.performance.push(`Higher callout rate (${(calloutRate * 100).toFixed(1)}%)`);
    }

    // Punctuality (completion rate as proxy)
    const completionRate = reliability?.metrics?.completionRate || 0;
    const onTimeRate = completionRate / 100; // Convert to 0-1 scale
    if (onTimeRate > 0.95) {
      performanceScore += 10;
      reasons.performance.push('Excellent punctuality');
    } else if (onTimeRate < 0.80) {
      performanceScore -= 15;
      reasons.performance.push('Lower punctuality rate');
    }

    scores.performance = Math.max(0, Math.min(100, performanceScore));
  } catch (err) {
    console.warn(`Failed to calculate performance for guard ${guardId}:`, err.message);
    scores.performance = 50; // Default if calculation fails
    reasons.performance.push('Performance data unavailable');
  }

  // ============================================
  // 4. COST SCORE (15% weight)
  // ============================================
  let costScore = 100; // Higher is better (lower cost)

  // Check for overtime risk
  const [weeklyHours] = await sequelize.query(`
    SELECT COALESCE(SUM(
      EXTRACT(EPOCH FROM (shift_end::time - shift_start::time)) / 3600
    ), 0) as hours
    FROM shifts
    WHERE guard_id::text = $1::text
      AND shift_date >= DATE_TRUNC('week', $2::date)
      AND shift_date < DATE_TRUNC('week', $2::date) + INTERVAL '7 days'
      AND status IN ('OPEN', 'CLOSED')
  `, {
    bind: [guardIdStr, shiftDate]
  });

  const currentWeekHours = parseFloat(weeklyHours[0]?.hours || 0);
  const shiftHours = calculateShiftHours(shiftStart, shiftEnd);
  const totalWeekHours = currentWeekHours + shiftHours;

  if (totalWeekHours > 40) {
    costScore -= 30; // Overtime penalty
    reasons.cost.push(`Would result in overtime (${totalWeekHours.toFixed(1)} hours/week)`);
  } else if (totalWeekHours > 35) {
    costScore -= 10; // Approaching overtime
    reasons.cost.push(`Approaching overtime threshold`);
  } else {
    reasons.cost.push(`Regular hours (${totalWeekHours.toFixed(1)} hours/week)`);
  }

  scores.cost = Math.max(0, costScore);

  // ============================================
  // 5. FAIRNESS SCORE (10% weight)
  // ============================================
  let fairnessScore = 100;

  // Check recent shift count (balance workload)
  const [recentShifts] = await sequelize.query(`
    SELECT COUNT(*) as count
    FROM shifts
    WHERE guard_id::text = $1::text
      AND shift_date >= NOW() - INTERVAL '14 days'
      AND status IN ('OPEN', 'CLOSED')
  `, {
    bind: [guardIdStr]
  });

  const recentShiftCount = parseInt(recentShifts[0]?.count || 0);
  
  // Get average shifts per guard for comparison
  const [avgShifts] = await sequelize.query(`
    SELECT AVG(shift_count) as avg
    FROM (
      SELECT guard_id, COUNT(*) as shift_count
      FROM shifts
      WHERE shift_date >= NOW() - INTERVAL '14 days'
        AND status IN ('OPEN', 'CLOSED')
        AND guard_id IS NOT NULL
      GROUP BY guard_id
    ) subq
  `);

  const avgShiftCount = parseFloat(avgShifts[0]?.avg || 0);
  
  if (recentShiftCount < avgShiftCount * 0.7) {
    fairnessScore += 20; // Underutilized guard - bonus
    reasons.fairness.push('Underutilized (below average shifts)');
  } else if (recentShiftCount > avgShiftCount * 1.3) {
    fairnessScore -= 20; // Overutilized guard - penalty
    reasons.fairness.push('Overutilized (above average shifts)');
  } else {
    reasons.fairness.push('Balanced workload');
  }

  scores.fairness = Math.max(0, Math.min(100, fairnessScore));

  // ============================================
  // CALCULATE TOTAL SCORE
  // ============================================
  const totalScore = Math.round(
    scores.availability * 0.30 +
    scores.experience * 0.25 +
    scores.performance * 0.20 +
    scores.cost * 0.15 +
    scores.fairness * 0.10
  );

  return {
    guardId: guard.id,
    guardName: guard.name || guard.email || 'Guard',
    totalScore: Math.max(0, Math.min(100, totalScore)),
    scores,
    reasons,
    conflicts: conflictCount > 0,
    wouldCauseOvertime: totalWeekHours > 40,
    estimatedCost: calculateEstimatedCost(shiftHours, totalWeekHours > 40),
    confidence: totalScore >= 80 ? 'HIGH' : totalScore >= 60 ? 'MEDIUM' : 'LOW'
  };
}

/**
 * Calculate shift hours
 */
function calculateShiftHours(start, end) {
  const [startHours, startMins] = start.split(':').map(Number);
  const [endHours, endMins] = end.split(':').map(Number);
  
  let startTotal = startHours * 60 + startMins;
  let endTotal = endHours * 60 + endMins;
  
  // Handle overnight shifts
  if (endTotal < startTotal) {
    endTotal += 24 * 60;
  }
  
  return (endTotal - startTotal) / 60;
}

/**
 * Calculate estimated cost
 */
function calculateEstimatedCost(hours, isOvertime) {
  const regularRate = 15; // $15/hour (configurable)
  const overtimeRate = regularRate * 1.5;
  
  if (isOvertime) {
    return hours * overtimeRate;
  }
  return hours * regularRate;
}

/**
 * Get optimized guard recommendations for a shift
 * @param {Object} shift - Shift object
 * @param {Object} models - Sequelize models
 * @param {Object} options - { limit = 5, excludeGuardId = null }
 * @returns {Promise<Array>} Ranked guard recommendations
 */
async function getOptimizedRecommendations(shift, models, options = {}) {
  const { sequelize } = models;
  const limit = options.limit || 5;
  const excludeGuardId = options.excludeGuardId || null;

  // Get all guards (excluding the one to exclude)
  // Handle UUID properly - use text comparison for UUIDs
  let guardsQuery = `
    SELECT id, name, email
    FROM guards
    WHERE is_active = true
  `;
  const bindParams = [];

  if (excludeGuardId) {
    guardsQuery += ` AND id::text != $1::text`;
    bindParams.push(String(excludeGuardId));
  }

  const [guards] = await sequelize.query(guardsQuery, {
    bind: bindParams
  });

  // Calculate scores for all guards
  const guardScores = [];
  for (const guard of guards) {
    try {
      const score = await calculateGuardScore(guard, shift, models);
      
      // Skip guards with conflicts or very low scores
      if (!score.conflicts && score.totalScore > 0) {
        guardScores.push(score);
      }
    } catch (err) {
      console.warn(`Failed to score guard ${guard.id}:`, err.message);
    }
  }

  // Sort by total score (highest first)
  guardScores.sort((a, b) => b.totalScore - a.totalScore);

  // Return top N recommendations
  return guardScores.slice(0, limit).map((score, index) => ({
    rank: index + 1,
    ...score,
    recommendation: index === 0 ? 'RECOMMENDED' : 'ALTERNATIVE',
    matchQuality: score.totalScore >= 80 ? 'Excellent' : 
                  score.totalScore >= 60 ? 'Good' : 
                  score.totalScore >= 40 ? 'Fair' : 'Poor'
  }));
}

/**
 * Auto-assign best guard to shift
 * @param {Object} shift - Shift object
 * @param {Object} models - Sequelize models
 * @param {Object} options - { autoAssign = true, minScore = 60 }
 * @returns {Promise<Object>} Assignment result
 */
async function autoAssignGuard(shift, models, options = {}) {
  const autoAssign = options.autoAssign !== false;
  const minScore = options.minScore || 60;

  const recommendations = await getOptimizedRecommendations(shift, models, {
    limit: 1,
    excludeGuardId: shift.guard_id
  });

  if (recommendations.length === 0) {
    return {
      success: false,
      message: 'No suitable guards found',
      recommendations: []
    };
  }

  const topRecommendation = recommendations[0];

  if (topRecommendation.totalScore < minScore) {
    return {
      success: false,
      message: `Best match score (${topRecommendation.totalScore}%) below minimum (${minScore}%)`,
      recommendations: recommendations,
      topCandidate: topRecommendation
    };
  }

  // Store AI decision
  const aiDecision = {
    ranking: 1,
    confidence: topRecommendation.totalScore / 100,
    suggested_guard_id: topRecommendation.guardId,
    suggested_guard_name: topRecommendation.guardName,
    total_score: topRecommendation.totalScore,
    scores: topRecommendation.scores,
    reasons: topRecommendation.reasons,
    match_quality: topRecommendation.matchQuality,
    assignment_reason: `Auto-assigned: ${topRecommendation.totalScore}% match. ${topRecommendation.reasons.experience.join('; ')}`,
    decision_made_at: new Date().toISOString(),
    decision_type: 'auto_assignment'
  };

  return {
    success: true,
    assignedGuard: topRecommendation,
    aiDecision,
    recommendations: recommendations,
    message: `Auto-assigned ${topRecommendation.guardName} (${topRecommendation.totalScore}% match)`
  };
}

/**
 * Detect conflicts for a shift assignment
 * @param {Object} shift - Shift object
 * @param {String} guardId - Guard ID to check
 * @param {Object} models - Sequelize models
 * @returns {Promise<Object>} Conflict detection results
 */
async function detectConflicts(shift, guardId, models) {
  const { sequelize } = models;
  const conflicts = {
    hasConflicts: false,
    doubleBooking: false,
    overtime: false,
    insufficientRest: false,
    details: []
  };

  // Check double-booking
  const guardIdStr = String(guardId);
  const shiftIdStr = shift.id ? String(shift.id) : '00000000-0000-0000-0000-000000000000';
  
  const [doubleBookings] = await sequelize.query(`
    SELECT id, shift_date, shift_start, shift_end, location
    FROM shifts
    WHERE guard_id::text = $1::text
      AND shift_date = $2::date
      AND status IN ('OPEN', 'CLOSED')
      AND id::text != $3::text
      AND (
        (shift_start::time <= $4::time AND shift_end::time > $4::time)
        OR (shift_start::time < $5::time AND shift_end::time >= $5::time)
        OR (shift_start::time >= $4::time AND shift_end::time <= $5::time)
      )
  `, {
    bind: [
      guardIdStr,
      shift.shift_date,
      shiftIdStr,
      shift.shift_start,
      shift.shift_end
    ]
  });

  if (doubleBookings.length > 0) {
    conflicts.hasConflicts = true;
    conflicts.doubleBooking = true;
    conflicts.details.push({
      type: 'DOUBLE_BOOKING',
      message: `Guard already assigned to shift on ${doubleBookings[0].shift_date} ${doubleBookings[0].shift_start}-${doubleBookings[0].shift_end}`,
      conflictingShift: doubleBookings[0]
    });
  }

  // Check overtime
  const [weeklyHours] = await sequelize.query(`
    SELECT COALESCE(SUM(
      EXTRACT(EPOCH FROM (shift_end::time - shift_start::time)) / 3600
    ), 0) as hours
    FROM shifts
    WHERE guard_id::text = $1::text
      AND shift_date >= DATE_TRUNC('week', $2::date)
      AND shift_date < DATE_TRUNC('week', $2::date) + INTERVAL '7 days'
      AND status IN ('OPEN', 'CLOSED')
      AND id::text != $3::text
  `, {
    bind: [guardIdStr, shift.shift_date, shiftIdStr]
  });

  const currentWeekHours = parseFloat(weeklyHours[0]?.hours || 0);
  const shiftHours = calculateShiftHours(shift.shift_start, shift.shift_end);
  const totalWeekHours = currentWeekHours + shiftHours;

  if (totalWeekHours > 40) {
    conflicts.hasConflicts = true;
    conflicts.overtime = true;
    conflicts.details.push({
      type: 'OVERTIME',
      message: `Assignment would result in ${totalWeekHours.toFixed(1)} hours/week (overtime)`,
      currentHours: currentWeekHours,
      additionalHours: shiftHours,
      totalHours: totalWeekHours
    });
  }

  // Check minimum rest between shifts (8 hours)
  const [previousShift] = await sequelize.query(`
    SELECT shift_date, shift_end
    FROM shifts
    WHERE guard_id::text = $1::text
      AND (
        (shift_date = $2::date - INTERVAL '1 day' AND shift_end::time > '16:00:00')
        OR (shift_date = $2::date AND shift_start::time < $3::time)
      )
      AND status IN ('OPEN', 'CLOSED')
      AND id::text != $4::text
    ORDER BY shift_date DESC, shift_end DESC
    LIMIT 1
  `, {
    bind: [
      guardIdStr,
      shift.shift_date,
      shift.shift_start,
      shiftIdStr
    ]
  });

  if (previousShift.length > 0) {
    const prevEnd = new Date(`${previousShift[0].shift_date}T${previousShift[0].shift_end}`);
    const currentStart = new Date(`${shift.shift_date}T${shift.shift_start}`);
    const hoursBetween = (currentStart - prevEnd) / (1000 * 60 * 60);

    if (hoursBetween < 8 && hoursBetween > 0) {
      conflicts.hasConflicts = true;
      conflicts.insufficientRest = true;
      conflicts.details.push({
        type: 'INSUFFICIENT_REST',
        message: `Only ${hoursBetween.toFixed(1)} hours between shifts (minimum 8 hours required)`,
        hoursBetween: hoursBetween
      });
    }
  }

  return conflicts;
}

module.exports = {
  calculateGuardScore,
  getOptimizedRecommendations,
  autoAssignGuard,
  detectConflicts,
  calculateShiftHours,
  calculateEstimatedCost
};
