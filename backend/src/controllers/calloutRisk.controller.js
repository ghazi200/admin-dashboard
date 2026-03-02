/**
 * Callout Risk Prediction Controller
 * Handles API endpoints for callout risk prediction
 */

const calloutRiskService = require("../services/calloutRiskPrediction.service");
const { notify } = require("../utils/notify");
const { Op } = require("sequelize");

/**
 * GET /api/admin/callout-risk/shift/:shiftId
 * Get risk score for a specific shift
 */
exports.getShiftRisk = async (req, res) => {
  try {
    const { sequelize } = req.app.locals.models;
    const shiftId = req.params.shiftId;

    // Get shift details
    const [shifts] = await sequelize.query(`
      SELECT 
        id,
        guard_id,
        shift_date,
        shift_start,
        shift_end,
        location,
        tenant_id,
        status
      FROM shifts
      WHERE id = $1
      LIMIT 1
    `, {
      bind: [shiftId]
    });

    if (shifts.length === 0) {
      return res.status(404).json({ message: "Shift not found" });
    }

    const shift = shifts[0];

    if (!shift.guard_id) {
      return res.json({
        shiftId: shift.id,
        risk: {
          score: 0,
          recommendation: 'NO_GUARD',
          message: 'No guard assigned to shift'
        }
      });
    }

    // Calculate risk
    const risk = await calloutRiskService.calculateCalloutRisk(shift, req.app.locals.models);

    // Get backup suggestions if high/medium risk
    let backupSuggestions = [];
    if (risk.recommendation === 'HIGH_RISK' || risk.recommendation === 'MEDIUM_RISK') {
      backupSuggestions = await calloutRiskService.getBackupSuggestions(shift, req.app.locals.models, 3);
    }

    return res.json({
      shiftId: shift.id,
      shiftDate: shift.shift_date,
      shiftTime: `${shift.shift_start} - ${shift.shift_end}`,
      location: shift.location,
      risk,
      backupSuggestions
    });
  } catch (e) {
    console.error("getShiftRisk error:", e);
    return res.status(500).json({
      message: "Failed to calculate callout risk",
      error: e.message
    });
  }
};

/**
 * GET /api/admin/callout-risk/upcoming
 * Get risk scores for all upcoming shifts (next 7 days by default)
 */
exports.getUpcomingRisks = async (req, res) => {
  try {
    const daysAhead = parseInt(req.query.days || 7, 10);
    const minRiskScore = parseInt(req.query.minRisk || 40, 10); // Only return shifts with risk >= 40

    const risks = await calloutRiskService.batchCalculateRisks(
      req.app.locals.models,
      daysAhead
    );

    // Filter by minimum risk score if specified
    const filteredRisks = risks.filter(item => item.risk.score >= minRiskScore);

    // Sort by risk score (highest first)
    filteredRisks.sort((a, b) => b.risk.score - a.risk.score);

    // Get backup suggestions for high-risk shifts (optional - don't fail if this errors)
    // Also create notifications for HIGH_RISK shifts
    for (const item of filteredRisks) {
      if (item.risk.recommendation === 'HIGH_RISK' || item.risk.recommendation === 'MEDIUM_RISK') {
        try {
          item.backupSuggestions = await calloutRiskService.getBackupSuggestions(
            item.shift,
            req.app.locals.models,
            3
          );
        } catch (err) {
          // Silently fail - backup suggestions are optional
          // Only log if it's not a column error (which we know about)
          if (!err.message?.includes('availability') && !err.message?.includes('does not exist')) {
            console.warn(`Failed to get backup suggestions for shift ${item.shift.id}:`, err.message);
          }
          item.backupSuggestions = [];
        }
      }

      // Create notification for HIGH_RISK shifts
      if (item.risk.recommendation === 'HIGH_RISK') {
        try {
          // Check if notification already exists for this shift (avoid duplicates)
          // Note: entityId is INTEGER, but shifts use UUID, so we check meta.shiftId instead
          const { Notification, sequelize } = req.app.locals.models;
          
          // Query for existing notification using JSON field query
          const [existingNotifications] = await sequelize.query(`
            SELECT id FROM notifications
            WHERE type = 'HIGH_RISK_SHIFT'
              AND entity_type = 'shift'
              AND meta->>'shiftId' = $1
              AND created_at >= NOW() - INTERVAL '24 hours'
            LIMIT 1
          `, {
            bind: [item.shift.id],
            type: sequelize.QueryTypes.SELECT
          });
          
          const existingNotification = existingNotifications && existingNotifications.length > 0 ? existingNotifications[0] : null;

          if (!existingNotification) {
            const guardName = item.risk.guardName || 'Unknown Guard';
            const location = item.shift.location || 'Unknown Location';
            const shiftDate = new Date(item.shift.shift_date).toLocaleDateString();
            const shiftTime = `${item.shift.shift_start} - ${item.shift.shift_end}`;
            
            // Build risk factors summary
            const riskFactors = item.risk.factors || {};
            const factorDetails = [];
            if (riskFactors.externalFactors > 0) {
              const externalRisk = item.risk.externalRiskData;
              if (externalRisk?.riskLevel === 'HIGH') {
                factorDetails.push(`Severe weather/transit issues: ${externalRisk.summary || 'High external risk'}`);
              }
            }
            if (riskFactors.calloutFrequency > 0) {
              factorDetails.push(`${Math.round(riskFactors.calloutFrequency / 15)} callout(s) in last 30 days`);
            }
            if (riskFactors.recentAvailabilityChanges > 0) {
              factorDetails.push('Recent availability changes');
            }

            const riskSummary = factorDetails.length > 0 
              ? `Risk factors: ${factorDetails.join('; ')}`
              : `Risk score: ${Math.round(item.risk.score)}%`;

            await notify(req.app, {
              type: 'HIGH_RISK_SHIFT',
              title: `🚨 High-Risk Shift Alert`,
              message: `${guardName} has a HIGH-RISK shift on ${shiftDate} at ${shiftTime} (${location}). ${riskSummary}`,
              entityType: 'shift',
              entityId: null, // Using UUID, so storing in meta
              audience: 'all',
              meta: {
                shiftId: item.shift.id,
                guardId: item.shift.guard_id,
                guardName: guardName,
                shiftDate: item.shift.shift_date,
                shiftTime: shiftTime,
                location: location,
                riskScore: Math.round(item.risk.score),
                riskFactors: riskFactors,
                externalRiskData: item.risk.externalRiskData || null,
                backupSuggestions: item.backupSuggestions || []
              }
            });

            console.log(`✅ Created HIGH_RISK_SHIFT notification for shift ${item.shift.id}`);
          }
        } catch (err) {
          // Don't fail the request if notification creation fails
          console.warn(`Failed to create notification for high-risk shift ${item.shift.id}:`, err.message);
        }
      }
    }

    return res.json({
      totalShifts: risks.length,
      highRiskShifts: filteredRisks.length,
      shifts: filteredRisks.map(item => ({
        shiftId: item.shift.id,
        shiftDate: item.shift.shift_date,
        shiftTime: `${item.shift.shift_start} - ${item.shift.shift_end}`,
        location: item.shift.location,
        guardId: item.shift.guard_id,
        guardName: item.risk.guardName,
        risk: item.risk,
        backupSuggestions: item.backupSuggestions || []
      }))
    });
  } catch (e) {
    console.error("getUpcomingRisks error:", e);
    return res.status(500).json({
      message: "Failed to calculate upcoming risks",
      error: e.message
    });
  }
};

/**
 * GET /api/admin/callout-risk/guard/:guardId
 * Get callout risk profile for a specific guard
 */
exports.getGuardRiskProfile = async (req, res) => {
  try {
    const { sequelize } = req.app.locals.models;
    const guardId = req.params.guardId;

    // Get guard info
    const [guards] = await sequelize.query(`
      SELECT id, name, email
      FROM guards
      WHERE id = $1
      LIMIT 1
    `, {
      bind: [guardId]
    });

    if (guards.length === 0) {
      return res.status(404).json({ message: "Guard not found" });
    }

    const guard = guards[0];

    // Get callout history
    const [calloutHistory] = await sequelize.query(`
      SELECT 
        COUNT(*) as total_callouts,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days') as callouts_30d,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '90 days') as callouts_90d,
        STRING_AGG(DISTINCT reason, ', ') as reasons
      FROM callouts
      WHERE guard_id = $1
    `, {
      bind: [guardId]
    });

    // Get recent availability changes
    const [availabilityChanges] = await sequelize.query(`
      SELECT COUNT(*) as count
      FROM availability_logs
      WHERE "guardId" = $1
        AND "createdAt" >= NOW() - INTERVAL '30 days'
        AND "to" = false
    `, {
      bind: [guardId]
    });

    // Get upcoming shifts
    const [upcomingShifts] = await sequelize.query(`
      SELECT 
        id,
        shift_date,
        shift_start,
        shift_end,
        location,
        status
      FROM shifts
      WHERE guard_id = $1
        AND shift_date >= CURRENT_DATE
        AND status IN ('OPEN', 'CLOSED')
      ORDER BY shift_date, shift_start
      LIMIT 10
    `, {
      bind: [guardId]
    });

    // Calculate risk for upcoming shifts
    const shiftRisks = [];
    for (const shift of upcomingShifts) {
      try {
        const risk = await calloutRiskService.calculateCalloutRisk(shift, req.app.locals.models);
        shiftRisks.push({
          shiftId: shift.id,
          shiftDate: shift.shift_date,
          shiftTime: `${shift.shift_start} - ${shift.shift_end}`,
          location: shift.location,
          riskScore: risk.score,
          recommendation: risk.recommendation
        });
      } catch (err) {
        console.warn(`Failed to calculate risk for shift ${shift.id}:`, err.message);
      }
    }

    return res.json({
      guardId: guard.id,
      guardName: guard.name || guard.email,
      calloutHistory: {
        total: parseInt(calloutHistory[0]?.total_callouts || 0),
        last30Days: parseInt(calloutHistory[0]?.callouts_30d || 0),
        last90Days: parseInt(calloutHistory[0]?.callouts_90d || 0),
        reasons: calloutHistory[0]?.reasons || 'None'
      },
      recentAvailabilityChanges: parseInt(availabilityChanges[0]?.count || 0),
      upcomingShifts: shiftRisks,
      averageRiskScore: shiftRisks.length > 0
        ? Math.round(shiftRisks.reduce((sum, s) => sum + s.riskScore, 0) / shiftRisks.length)
        : 0
    });
  } catch (e) {
    console.error("getGuardRiskProfile error:", e);
    return res.status(500).json({
      message: "Failed to get guard risk profile",
      error: e.message
    });
  }
};
