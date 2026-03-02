/**
 * Callout Risk Prediction Service
 * 
 * Predicts the likelihood of a guard calling out for a scheduled shift
 * using rule-based risk scoring and AI RAG for external factors (weather, transit, etc.)
 */

const externalRiskFactorsService = require("./externalRiskFactors.service");

/**
 * Calculate callout risk score for a shift
 * @param {Object} shift - Shift object with guard_id, shift_date, shift_start, etc.
 * @param {Object} models - Sequelize models
 * @returns {Promise<Object>} Risk score and factors
 */
async function calculateCalloutRisk(shift, models) {
  const { sequelize, CallOut, AvailabilityLog, Guard } = models;
  const guardId = shift.guard_id;
  const shiftDate = shift.shift_date;
  const shiftStart = shift.shift_start;

  if (!guardId) {
    return {
      score: 0,
      recommendation: 'NO_GUARD',
      factors: {},
      message: 'No guard assigned to shift'
    };
  }

  const riskFactors = {
    calloutFrequency: 0,
    dayOfWeekRisk: 0,
    recentAvailabilityChanges: 0,
    timeSinceLastCallout: 0,
    patternMatch: 0,
    shiftTimeRisk: 0,
    externalFactors: 0, // External risk factors (weather, transit, etc.)
  };

  // Factor 1: Callout frequency (last 30 days)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  
  const [calloutHistory] = await sequelize.query(`
    SELECT COUNT(*) as count, 
           STRING_AGG(reason, ', ') as reasons
    FROM callouts
    WHERE guard_id = $1 
      AND created_at >= $2
  `, {
    bind: [guardId, thirtyDaysAgo]
  });

  const calloutCount = parseInt(calloutHistory[0]?.count || 0);
  // Each callout in last 30 days adds 15 points (max 60 points)
  riskFactors.calloutFrequency = Math.min(60, calloutCount * 15);

  // Factor 2: Day of week risk
  const shiftDateObj = new Date(shiftDate);
  const dayOfWeek = shiftDateObj.getDay(); // 0 = Sunday, 1 = Monday, etc.
  
  // Monday and Friday have higher callout rates typically
  const dayRiskMap = {
    0: 5,   // Sunday
    1: 20,  // Monday (highest)
    2: 10,  // Tuesday
    3: 10,  // Wednesday
    4: 15,  // Thursday
    5: 25,  // Friday (high)
    6: 10,  // Saturday
  };
  riskFactors.dayOfWeekRisk = dayRiskMap[dayOfWeek] || 10;

  // Factor 3: Recent availability changes
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  
  // Check if guardId is UUID or integer and query accordingly
  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(guardId);
  
  let availabilityChanges;
  if (isUUID) {
    // Guards table uses UUID, but availability_logs might use integer
    // Skip availability check for UUID guards for now
    availabilityChanges = [{ count: 0 }];
  } else {
    [availabilityChanges] = await sequelize.query(`
      SELECT COUNT(*) as count
      FROM availability_logs
      WHERE "guardId" = $1 
        AND "createdAt" >= $2
        AND "to" = false
    `, {
      bind: [guardId, sevenDaysAgo]
    });
  }

  const availabilityChangeCount = parseInt(availabilityChanges[0]?.count || 0);
  // Each availability change to "unavailable" adds 10 points (max 30 points)
  riskFactors.recentAvailabilityChanges = Math.min(30, availabilityChangeCount * 10);

  // Factor 4: Time since last callout
  const [lastCallout] = await sequelize.query(`
    SELECT created_at
    FROM callouts
    WHERE guard_id = $1
    ORDER BY created_at DESC
    LIMIT 1
  `, {
    bind: [guardId]
  });

  if (lastCallout && lastCallout.length > 0) {
    const lastCalloutDate = new Date(lastCallout[0].created_at);
    const daysSince = Math.floor((Date.now() - lastCalloutDate.getTime()) / (1000 * 60 * 60 * 24));
    
    // If called out recently (within 7 days), add risk
    if (daysSince <= 7) {
      riskFactors.timeSinceLastCallout = 20;
    } else if (daysSince <= 14) {
      riskFactors.timeSinceLastCallout = 10;
    } else {
      riskFactors.timeSinceLastCallout = 0;
    }
  }

  // Factor 5: Pattern matching - check if guard has called out on similar days/times
  const [patternCallouts] = await sequelize.query(`
    SELECT COUNT(*) as count
    FROM callouts c
    JOIN shifts s ON c.shift_id = s.id
    WHERE c.guard_id = $1
      AND EXTRACT(DOW FROM s.shift_date::date) = $2
      AND s.shift_start::time = $3::time
  `, {
    bind: [guardId, dayOfWeek, shiftStart]
  });

  const patternCount = parseInt(patternCallouts[0]?.count || 0);
  // If guard has called out on same day/time before, add risk
  riskFactors.patternMatch = Math.min(20, patternCount * 10);

  // Factor 6: Shift time risk (early morning shifts have higher callout rates)
  const [hours] = shiftStart.split(':').map(Number);
  if (hours >= 5 && hours <= 7) {
    riskFactors.shiftTimeRisk = 15; // Early morning
  } else if (hours >= 22 || hours <= 2) {
    riskFactors.shiftTimeRisk = 10; // Night shift
  } else {
    riskFactors.shiftTimeRisk = 5; // Normal hours
  }

  // Factor 7: External Risk Factors (Weather, Transit, Shutdowns)
  let externalRiskData = null;
  if (shift.location) {
    try {
      console.log(`🌍 Checking external risk factors for shift ${shift.id} at location: "${shift.location}"`);
      const { city, state } = externalRiskFactorsService.parseLocation(shift.location);
      console.log(`📍 Parsed location - City: "${city}", State: "${state}"`);
      
      if (city) {
        externalRiskData = await externalRiskFactorsService.searchExternalFactors(
          city,
          state,
          new Date(shiftDate)
        );
        console.log(`🌦️ External risk data for ${city}, ${state}:`, {
          riskLevel: externalRiskData.riskLevel,
          riskScore: externalRiskData.riskScore,
          factors: externalRiskData.factors,
          summary: externalRiskData.summary,
        });
        
        if (externalRiskData.riskLevel === "HIGH") {
          riskFactors.externalFactors = 50; // Increased points for high external risk (snow storms, etc.)
          console.log(`⚠️ HIGH external risk detected! Adding 50 points to risk score.`);
        } else if (externalRiskData.riskLevel === "MEDIUM") {
          riskFactors.externalFactors = 25; // Increased points for medium external risk
          console.log(`⚡ MEDIUM external risk detected. Adding 25 points to risk score.`);
        } else {
          console.log(`✅ LOW external risk. No additional points.`);
        }
      } else {
        console.warn(`⚠️ Could not parse city from location: "${shift.location}"`);
      }
    } catch (externalError) {
      console.error(`❌ Error fetching external risk factors for shift ${shift.id}:`, externalError.message);
      console.error(`   Location: "${shift.location}", Date: ${shiftDate}`);
      // Continue without external risk data
      externalRiskData = null;
    }
  } else {
    console.log(`⚠️ Shift ${shift.id} has no location data. Skipping external risk factors.`);
  }

  // Calculate total risk score (0-100)
  // Adjust weights: external factors are critical, especially for severe weather
  const baseScore = Math.round(
    riskFactors.calloutFrequency * 0.30 +
    riskFactors.dayOfWeekRisk * 0.12 +
    riskFactors.recentAvailabilityChanges * 0.20 +
    riskFactors.timeSinceLastCallout * 0.12 +
    riskFactors.patternMatch * 0.05 +
    riskFactors.shiftTimeRisk * 0.05
  );
  
  // External factors get significant weight, especially HIGH risk (snow storms, etc.)
  const externalScore = riskFactors.externalFactors > 0 
    ? Math.min(30, riskFactors.externalFactors * 0.30) // Up to 30 points for external factors
    : 0;
  
  const totalScore = Math.min(100, baseScore + externalScore);
  
  console.log(`📊 Risk score breakdown:`);
  console.log(`   Base score: ${baseScore}%`);
  console.log(`   External factors: ${externalScore}% (${riskFactors.externalFactors} points)`);
  console.log(`   Total score: ${totalScore}%`);

  // Determine recommendation
  // If external risk is HIGH (snow storm, severe weather), automatically mark as HIGH_RISK
  // This is critical - severe weather should always trigger high risk regardless of base score
  let recommendation;
  
  // Debug: Log external risk data state
  console.log(`🔍 Checking recommendation - externalRiskData:`, {
    exists: !!externalRiskData,
    riskLevel: externalRiskData?.riskLevel,
    totalScore,
  });
  
  if (externalRiskData && externalRiskData.riskLevel === "HIGH") {
    // Severe external factors (snow storms, etc.) automatically = HIGH_RISK
    recommendation = 'HIGH_RISK';
    console.log(`⚠️ HIGH_RISK recommendation due to severe external factors (snow storm, etc.)`);
    // Boost the score to reflect the high risk
    const boostedScore = Math.max(totalScore, 75); // Ensure score reflects the severity
    if (boostedScore > totalScore) {
      console.log(`   Score boosted from ${totalScore}% to ${boostedScore}% due to severe external factors`);
    }
  } else if (totalScore >= 70) {
    recommendation = 'HIGH_RISK';
    console.log(`⚠️ HIGH_RISK recommendation due to high total score (${totalScore}%)`);
  } else if (totalScore >= 40) {
    recommendation = 'MEDIUM_RISK';
    console.log(`⚡ MEDIUM_RISK recommendation (score: ${totalScore}%)`);
  } else {
    recommendation = 'LOW_RISK';
    console.log(`✅ LOW_RISK recommendation (score: ${totalScore}%)`);
    if (externalRiskData) {
      console.log(`   Note: External risk is ${externalRiskData.riskLevel}, but total score too low`);
    }
  }

  // Get guard name for context
  const [guardInfo] = await sequelize.query(`
    SELECT name, email
    FROM guards
    WHERE id = $1
    LIMIT 1
  `, {
    bind: [guardId]
  });

  const guardName = guardInfo[0]?.name || guardInfo[0]?.email || 'Guard';

  // If external risk is HIGH, boost the score to reflect severity
  const finalScore = (externalRiskData && externalRiskData.riskLevel === "HIGH") 
    ? Math.max(totalScore, 75) 
    : totalScore;

  return {
    score: finalScore,
    recommendation,
    factors: {
      calloutFrequency: {
        value: riskFactors.calloutFrequency,
        description: `${calloutCount} callout(s) in last 30 days`,
        weight: 0.35
      },
      dayOfWeekRisk: {
        value: riskFactors.dayOfWeekRisk,
        description: `Day of week risk (${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][dayOfWeek]})`,
        weight: 0.15
      },
      recentAvailabilityChanges: {
        value: riskFactors.recentAvailabilityChanges,
        description: `${availabilityChangeCount} recent availability change(s)`,
        weight: 0.25
      },
      timeSinceLastCallout: {
        value: riskFactors.timeSinceLastCallout,
        description: lastCallout && lastCallout.length > 0 
          ? `Last callout ${Math.floor((Date.now() - new Date(lastCallout[0].created_at).getTime()) / (1000 * 60 * 60 * 24))} days ago`
          : 'No recent callouts',
        weight: 0.15
      },
      patternMatch: {
        value: riskFactors.patternMatch,
        description: patternCount > 0 
          ? `${patternCount} previous callout(s) on similar shifts`
          : 'No pattern match',
        weight: 0.05
      },
      shiftTimeRisk: {
        value: riskFactors.shiftTimeRisk,
        description: hours >= 5 && hours <= 7 ? 'Early morning shift' : hours >= 22 || hours <= 2 ? 'Night shift' : 'Normal hours',
        weight: 0.05
      },
      externalFactors: {
        value: riskFactors.externalFactors,
        description: externalRiskData?.summary || 'No external risk factors analyzed',
        weight: 0.16,
        details: externalRiskData || null
      }
    },
    guardName,
    guardId,
    shiftId: shift.id,
    shiftDate,
    shiftTime: `${shiftStart} - ${shift.shift_end}`,
    location: shift.location,
    externalRiskFactors: externalRiskData, // Include full external risk data
    message: getRiskMessage(totalScore, recommendation, guardName, externalRiskData)
  };
}

/**
 * Get risk message based on score and external factors
 */
function getRiskMessage(score, recommendation, guardName, externalRiskData = null) {
  let baseMessage = "";
  if (recommendation === 'HIGH_RISK') {
    baseMessage = `⚠️ High risk: ${guardName} has a ${score}% callout risk. Consider assigning a backup guard.`;
  } else if (recommendation === 'MEDIUM_RISK') {
    baseMessage = `⚡ Medium risk: ${guardName} has a ${score}% callout risk. Monitor this shift.`;
  } else {
    baseMessage = `✅ Low risk: ${guardName} has a ${score}% callout risk.`;
  }

  // Add external factors info if available
  if (externalRiskData && externalRiskData.riskLevel !== "LOW") {
    const factorsList = externalRiskData.factors?.join(", ") || "external factors";
    baseMessage += ` External factors detected: ${factorsList}.`;
  }

  return baseMessage;
}

/**
 * Get proactive backup guard suggestions
 * @param {Object} shift - Shift object
 * @param {Object} models - Sequelize models
 * @param {number} limit - Number of suggestions to return
 * @returns {Promise<Array>} List of suggested backup guards
 */
async function getBackupSuggestions(shift, models, limit = 3) {
  try {
    const { sequelize } = models;
    if (!sequelize) {
      return [];
    }
    const { shift_date, shift_start, shift_end, location, tenant_id } = shift;

    // Find available guards who:
    // 1. Are currently available
    // 2. Don't have a conflicting shift
    // 3. Have worked at this location before (preferred)
    // 4. Have low callout risk themselves

    const [suggestions] = await sequelize.query(`
    WITH available_guards AS (
      SELECT 
        g.id,
        g.name,
        g.email,
        -- Check if guard has worked at this location before
        COUNT(DISTINCT s2.id) FILTER (WHERE s2.location = $4) as location_experience,
        -- Check for low callout risk (no callouts in last 30 days)
        COUNT(c.id) FILTER (
          WHERE c.created_at >= NOW() - INTERVAL '30 days'
        ) as recent_callouts
      FROM guards g
      LEFT JOIN shifts s2 ON s2.guard_id = g.id 
        AND s2.location = $4
        AND s2.status = 'CLOSED'
      LEFT JOIN callouts c ON c.guard_id = g.id
      WHERE g.id != $5  -- Exclude the assigned guard
        -- Check no conflicting shift
        AND NOT EXISTS (
          SELECT 1
          FROM shifts s3
          WHERE s3.guard_id = g.id
            AND s3.shift_date = $1::date
            AND s3.status IN ('OPEN', 'CLOSED')
            AND (
              (s3.shift_start::time <= $2::time AND s3.shift_end::time > $2::time)
              OR (s3.shift_start::time < $3::time AND s3.shift_end::time >= $3::time)
              OR (s3.shift_start::time >= $2::time AND s3.shift_end::time <= $3::time)
            )
        )
      GROUP BY g.id, g.name, g.email
      HAVING COUNT(c.id) FILTER (
        WHERE c.created_at >= NOW() - INTERVAL '30 days'
      ) = 0  -- Only guards with no recent callouts
      ORDER BY 
        location_experience DESC,  -- Prefer guards with location experience
        recent_callouts ASC        -- Prefer guards with fewer callouts
      LIMIT $6
    )
    SELECT 
      id,
      name,
      email,
      location_experience,
      recent_callouts,
      CASE 
        WHEN location_experience > 0 THEN 'High - Has worked at this location'
        WHEN recent_callouts = 0 THEN 'Medium - Available with good reliability'
        ELSE 'Low'
      END as match_quality
    FROM available_guards
  `, {
    bind: [
      shift_date,
      shift_start,
      shift_end,
      location || '',
      shift.guard_id,
      limit
    ]
  });

    return suggestions.map((guard, index) => ({
      rank: index + 1,
      guardId: guard.id,
      guardName: guard.name || guard.email,
      locationExperience: parseInt(guard.location_experience || 0),
      recentCallouts: parseInt(guard.recent_callouts || 0),
      matchQuality: guard.match_quality,
      confidence: guard.location_experience > 0 ? 0.9 : 0.7
    }));
  } catch (error) {
    // Silently return empty array if backup suggestions fail
    // This is optional functionality - don't break risk calculation
    if (!error.message?.includes('availability') && !error.message?.includes('does not exist')) {
      console.warn(`⚠️ Backup suggestions failed (non-critical):`, error.message);
    }
    return [];
  }
}

/**
 * Batch calculate risks for upcoming shifts
 * @param {Object} models - Sequelize models
 * @param {number} daysAhead - Number of days ahead to check (default 7)
 * @returns {Promise<Array>} Array of shifts with risk scores
 */
async function batchCalculateRisks(models, daysAhead = 7) {
  const { sequelize, Shift } = models;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const endDate = new Date(today);
  endDate.setDate(endDate.getDate() + daysAhead);

  // Get all upcoming shifts with assigned guards
  const [upcomingShifts] = await sequelize.query(`
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
    WHERE shift_date >= $1::date
      AND shift_date <= $2::date
      AND guard_id IS NOT NULL
      AND status IN ('OPEN', 'CLOSED')
    ORDER BY shift_date, shift_start
  `, {
    bind: [today.toISOString().split('T')[0], endDate.toISOString().split('T')[0]]
  });

  const risks = [];
  console.log(`📊 Calculating risks for ${upcomingShifts.length} upcoming shifts...`);
  
  for (const shift of upcomingShifts) {
    try {
      console.log(`\n🔍 Processing shift ${shift.id}:`);
      console.log(`   Date: ${shift.shift_date}`);
      console.log(`   Time: ${shift.shift_start} - ${shift.shift_end}`);
      console.log(`   Location: ${shift.location || 'NOT SET'}`);
      console.log(`   Guard ID: ${shift.guard_id}`);
      
      const risk = await calculateCalloutRisk(shift, models);
      
      console.log(`   ✅ Risk calculated: ${risk.score}% (${risk.recommendation})`);
      if (risk.externalRiskFactors) {
        console.log(`   🌦️ External factors: ${risk.externalRiskFactors.riskLevel} (${risk.externalRiskFactors.riskScore})`);
      }
      
      risks.push({
        shift,
        risk
      });
    } catch (err) {
      console.error(`❌ Error calculating risk for shift ${shift.id}:`, err.message);
      console.error(`   Stack:`, err.stack);
    }
  }
  
  console.log(`\n📊 Risk calculation complete: ${risks.length} shifts analyzed`);
  const highRiskCount = risks.filter(r => r.risk.recommendation === 'HIGH_RISK').length;
  const mediumRiskCount = risks.filter(r => r.risk.recommendation === 'MEDIUM_RISK').length;
  console.log(`   High risk: ${highRiskCount}, Medium risk: ${mediumRiskCount}, Low risk: ${risks.length - highRiskCount - mediumRiskCount}`);

  return risks;
}

module.exports = {
  calculateCalloutRisk,
  getBackupSuggestions,
  batchCalculateRisks,
  getRiskMessage
};
