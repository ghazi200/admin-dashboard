/**
 * Fairness Rebalancing Service
 * 
 * Automatically redistributes shifts to ensure fair workload distribution:
 * - Detects over/under-utilized guards
 * - Suggests shift reassignments
 * - Automatically rebalances shifts (optional)
 */

const shiftOptimizationService = require('./shiftOptimization.service');

/**
 * Analyze fairness distribution for guards
 * @param {String} tenantId - Tenant ID
 * @param {Object} options - { startDate, endDate, lookbackDays = 14 }
 * @param {Object} models - Sequelize models
 * @returns {Promise<Object>} Fairness analysis
 */
async function analyzeFairness(tenantId, options, models) {
  const { sequelize } = models;
  const { startDate, endDate, lookbackDays = 14 } = options;

  // Get all guards
  const [guards] = await sequelize.query(`
    SELECT id, name, email, active
    FROM guards
    WHERE tenant_id = $1 AND active = true
  `, {
    bind: [tenantId]
  });

  if (guards.length === 0) {
    throw new Error('No active guards found');
  }

  // Calculate shift counts per guard
  const dateFilter = startDate && endDate
    ? `AND shift_date >= $2::date AND shift_date <= $3::date`
    : `AND shift_date >= NOW() - INTERVAL '${lookbackDays} days'`;

  const bindParams = [tenantId];
  if (startDate && endDate) {
    bindParams.push(startDate, endDate);
  }

  const [shiftCounts] = await sequelize.query(`
    SELECT 
      guard_id,
      COUNT(*) as shift_count,
      COUNT(CASE WHEN status = 'CLOSED' THEN 1 END) as completed_shifts,
      COUNT(CASE WHEN status = 'OPEN' THEN 1 END) as open_shifts
    FROM shifts
    WHERE tenant_id = $1
      ${dateFilter}
      AND guard_id IS NOT NULL
    GROUP BY guard_id
  `, {
    bind: bindParams
  });

  // Calculate average
  const totalShifts = shiftCounts.reduce((sum, g) => sum + parseInt(g.shift_count || 0), 0);
  const avgShifts = guards.length > 0 ? totalShifts / guards.length : 0;

  // Build guard analysis
  const guardAnalysis = guards.map(guard => {
    const guardShifts = shiftCounts.find(s => s.guard_id === guard.id);
    const shiftCount = parseInt(guardShifts?.shift_count || 0);
    const completedShifts = parseInt(guardShifts?.completed_shifts || 0);
    const openShifts = parseInt(guardShifts?.open_shifts || 0);

    const deviation = shiftCount - avgShifts;
    const deviationPercent = avgShifts > 0 ? (deviation / avgShifts) * 100 : 0;

    let status = 'BALANCED';
    if (deviationPercent < -30) {
      status = 'UNDERUTILIZED';
    } else if (deviationPercent > 30) {
      status = 'OVERUTILIZED';
    }

    return {
      guardId: guard.id,
      guardName: guard.name || guard.email,
      shiftCount,
      completedShifts,
      openShifts,
      avgShifts: Math.round(avgShifts * 100) / 100,
      deviation: Math.round(deviation * 100) / 100,
      deviationPercent: Math.round(deviationPercent * 100) / 100,
      status,
      needsMoreShifts: status === 'UNDERUTILIZED',
      needsFewerShifts: status === 'OVERUTILIZED'
    };
  });

  // Sort by deviation (most overutilized first, then most underutilized)
  guardAnalysis.sort((a, b) => {
    if (a.status === 'OVERUTILIZED' && b.status !== 'OVERUTILIZED') return -1;
    if (b.status === 'OVERUTILIZED' && a.status !== 'OVERUTILIZED') return 1;
    return Math.abs(b.deviation) - Math.abs(a.deviation);
  });

  return {
    tenantId,
    period: {
      startDate: startDate || `Last ${lookbackDays} days`,
      endDate: endDate || 'Today'
    },
    totalGuards: guards.length,
    totalShifts,
    avgShifts: Math.round(avgShifts * 100) / 100,
    guards: guardAnalysis,
    summary: {
      overutilized: guardAnalysis.filter(g => g.status === 'OVERUTILIZED').length,
      underutilized: guardAnalysis.filter(g => g.status === 'UNDERUTILIZED').length,
      balanced: guardAnalysis.filter(g => g.status === 'BALANCED').length
    }
  };
}

/**
 * Generate rebalancing suggestions
 * @param {String} tenantId - Tenant ID
 * @param {Object} options - Analysis options
 * @param {Object} models - Sequelize models
 * @returns {Promise<Object>} Rebalancing suggestions
 */
async function generateRebalancingSuggestions(tenantId, options, models) {
  const analysis = await analyzeFairness(tenantId, options, models);

  const suggestions = [];
  const { sequelize } = models;

  // Find shifts that can be reassigned
  const overutilized = analysis.guards.filter(g => g.status === 'OVERUTILIZED');
  const underutilized = analysis.guards.filter(g => g.status === 'UNDERUTILIZED');

  if (overutilized.length === 0 || underutilized.length === 0) {
    return {
      analysis,
      suggestions: [],
      message: 'No rebalancing needed - guards are fairly distributed'
    };
  }

  // For each overutilized guard, find shifts that can be reassigned
  for (const overGuard of overutilized) {
    const dateFilter = options.startDate && options.endDate
      ? `AND shift_date >= $2::date AND shift_date <= $3::date`
      : `AND shift_date >= NOW() - INTERVAL '${options.lookbackDays || 14} days'`;

    const bindParams = [overGuard.guardId, tenantId];
    if (options.startDate && options.endDate) {
      bindParams.push(options.startDate, options.endDate);
    }

    // Get OPEN shifts assigned to overutilized guard
    const [openShifts] = await sequelize.query(`
      SELECT 
        id,
        shift_date,
        shift_start,
        shift_end,
        location,
        status
      FROM shifts
      WHERE guard_id = $1
        AND tenant_id = $2
        AND status = 'OPEN'
        ${dateFilter}
      ORDER BY shift_date ASC
      LIMIT 5
    `, {
      bind: bindParams
    });

    // For each open shift, find best alternative guard
    for (const shift of openShifts) {
      // Try to find a good match among underutilized guards
      for (const underGuard of underutilized) {
        try {
          // Check if this guard can take the shift
          const conflicts = await shiftOptimizationService.detectConflicts(
            shift,
            underGuard.guardId,
            models
          );

          if (!conflicts.hasConflicts) {
            // Calculate score for this guard
            const [guardData] = await sequelize.query(`
              SELECT id, name, email
              FROM guards
              WHERE id = $1
            `, {
              bind: [underGuard.guardId]
            });

            if (guardData.length > 0) {
              const score = await shiftOptimizationService.calculateGuardScore(
                guardData[0],
                shift,
                models
              );

              if (score.totalScore >= (options.minScore || 50)) {
                suggestions.push({
                  shiftId: shift.id,
                  shiftDate: shift.shift_date,
                  shiftTime: `${shift.shift_start} - ${shift.shift_end}`,
                  location: shift.location,
                  fromGuard: {
                    id: overGuard.guardId,
                    name: overGuard.guardName,
                    currentShifts: overGuard.shiftCount
                  },
                  toGuard: {
                    id: underGuard.guardId,
                    name: underGuard.guardName,
                    currentShifts: underGuard.shiftCount,
                    score: score.totalScore
                  },
                  reason: `Rebalance: ${overGuard.guardName} has ${overGuard.shiftCount} shifts (${overGuard.deviationPercent.toFixed(1)}% above average), ${underGuard.guardName} has ${underGuard.shiftCount} shifts (${underGuard.deviationPercent.toFixed(1)}% below average)`,
                  priority: Math.abs(overGuard.deviationPercent) + Math.abs(underGuard.deviationPercent)
                });
                break; // Found a match, move to next shift
              }
            }
          }
        } catch (error) {
          console.warn(`Error checking rebalancing for shift ${shift.id}:`, error.message);
        }
      }
    }
  }

  // Sort by priority (highest deviation differences first)
  suggestions.sort((a, b) => b.priority - a.priority);

  return {
    analysis,
    suggestions: suggestions.slice(0, 20), // Limit to top 20 suggestions
    totalSuggestions: suggestions.length
  };
}

/**
 * Execute rebalancing (apply suggestions)
 * @param {Array} suggestionIds - Array of suggestion IDs to apply
 * @param {Object} models - Sequelize models
 * @returns {Promise<Object>} Rebalancing results
 */
async function executeRebalancing(suggestionIds, models) {
  const { sequelize } = models;
  const results = {
    applied: [],
    failed: [],
    totalApplied: 0
  };

  // Get suggestions (in a real implementation, these would be stored)
  // For now, we'll need to regenerate them or pass them in
  // This is a simplified version - in production, you'd store suggestions in DB

  return results;
}

/**
 * Auto-rebalance shifts
 * @param {String} tenantId - Tenant ID
 * @param {Object} options - { autoApply: boolean, minScore: number, maxReassignments: number }
 * @param {Object} models - Sequelize models
 * @returns {Promise<Object>} Rebalancing results
 */
async function autoRebalance(tenantId, options, models) {
  const { sequelize } = models;
  const {
    autoApply = false,
    minScore = 50,
    maxReassignments = 10,
    lookbackDays = 14
  } = options;

  // Get suggestions
  const suggestionsData = await generateRebalancingSuggestions(
    tenantId,
    { lookbackDays, minScore },
    models
  );

  if (suggestionsData.suggestions.length === 0) {
    return {
      message: 'No rebalancing needed',
      suggestions: suggestionsData
    };
  }

  const results = {
    applied: [],
    failed: [],
    totalApplied: 0,
    suggestions: suggestionsData.suggestions.slice(0, maxReassignments)
  };

  if (!autoApply) {
    return {
      message: 'Rebalancing suggestions generated (not applied)',
      suggestions: suggestionsData,
      results
    };
  }

  // Apply top suggestions
  for (const suggestion of results.suggestions) {
    try {
      // Get shift details
      const [shifts] = await sequelize.query(`
        SELECT id, guard_id, ai_decision
        FROM shifts
        WHERE id = $1
      `, {
        bind: [suggestion.shiftId]
      });

      if (shifts.length === 0) {
        results.failed.push({
          shiftId: suggestion.shiftId,
          reason: 'Shift not found'
        });
        continue;
      }

      const shift = shifts[0];

      // Double-check conflicts
      const conflicts = await shiftOptimizationService.detectConflicts(
        {
          shift_date: suggestion.shiftDate,
          shift_start: suggestion.shiftTime.split(' - ')[0],
          shift_end: suggestion.shiftTime.split(' - ')[1],
          location: suggestion.location,
          id: suggestion.shiftId
        },
        suggestion.toGuard.id,
        models
      );

      if (conflicts.hasConflicts) {
        results.failed.push({
          shiftId: suggestion.shiftId,
          reason: 'Conflicts detected',
          conflicts: conflicts.details
        });
        continue;
      }

      // Update shift assignment
      const newAiDecision = {
        previous_guard_id: suggestion.fromGuard.id,
        previous_guard_name: suggestion.fromGuard.name,
        reassigned_to: suggestion.toGuard.id,
        reassigned_to_name: suggestion.toGuard.name,
        reason: suggestion.reason,
        reassigned_at: new Date().toISOString(),
        reassignment_type: 'fairness_rebalancing'
      };

      await sequelize.query(`
        UPDATE shifts
        SET guard_id = $1, ai_decision = $2
        WHERE id = $3
      `, {
        bind: [
          suggestion.toGuard.id,
          JSON.stringify(newAiDecision),
          suggestion.shiftId
        ]
      });

      results.applied.push({
        shiftId: suggestion.shiftId,
        fromGuard: suggestion.fromGuard,
        toGuard: suggestion.toGuard,
        score: suggestion.toGuard.score
      });

      results.totalApplied++;
    } catch (error) {
      results.failed.push({
        shiftId: suggestion.shiftId,
        reason: error.message
      });
    }
  }

  return {
    message: `Rebalancing complete: ${results.totalApplied} shifts reassigned`,
    results
  };
}

module.exports = {
  analyzeFairness,
  generateRebalancingSuggestions,
  executeRebalancing,
  autoRebalance
};
