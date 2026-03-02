const OpenAI = require('openai');
const { calculateReliabilityDecay, calculateSiteSuccessRate, calculateGuardScore } = require('../services/ranking.service');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

/**
 * Enhanced scoring function with reliability decay and site stats
 * @param {Object} guard - Guard object
 * @param {Object} shift - Shift object
 * @param {Object} siteStats - Site-specific statistics
 * @param {number} decayedReliability - Decayed reliability score
 * @returns {number} Score (0-1)
 */
function scoreGuard(guard, shift, siteStats = null, decayedReliability = null) {
  const stats = siteStats || { successRate: 0.5, shiftCount: 0, onTimeRate: 0.5 };
  const reliability = decayedReliability || (guard.reliability_score || 0.8);

  const scoreData = calculateGuardScore(guard, shift, stats, reliability);
  return scoreData.score;
}

/**
 * Enhanced AI ranking with detailed explanations
 * @param {Object} context - Context object with shift, guards, and optional models
 * @returns {Promise<Object>} Rankings with detailed explanations
 */
async function rankGuardsWithAI(context) {
  const { shift, guards, models = null } = context;

  // If models provided, enhance guards with site stats and decay
  let enhancedGuards = guards;
  if (models && shift) {
    enhancedGuards = await Promise.all(
      guards.map(async (guard) => {
        // Calculate last shift date
        let lastShiftDate = null;
        try {
          const { Shift } = models;
          const lastShift = await Shift.findOne({
            where: { guard_id: guard.id, status: "CLOSED" },
            order: [["shift_date", "DESC"]],
            limit: 1,
          });
          if (lastShift) lastShiftDate = lastShift.shift_date;
        } catch (error) {
          console.error("Error fetching last shift:", error);
        }

        const baseReliability = guard.reliability_score || 0.8;
        const decayedReliability = calculateReliabilityDecay(lastShiftDate, baseReliability);

        const location = shift.location || null;
        const siteStats = await calculateSiteSuccessRate(guard.id, location, models);

        return {
          ...guard,
          _lastShiftDate: lastShiftDate,
          _decayedReliability: decayedReliability,
          _siteStats: siteStats,
        };
      })
    );
  }

  // Build enhanced context for AI
  const enhancedContext = {
    shift: {
      id: shift?.id,
      date: shift?.shift_date,
      start: shift?.shift_start,
      end: shift?.shift_end,
      location: shift?.location,
      reason: shift?.reason || context.reason,
    },
    guards: enhancedGuards.map(g => ({
      id: g.id,
      name: g.name,
      acceptanceRate: g.acceptance_rate || 0.85,
      reliabilityScore: g._decayedReliability || g.reliability_score || 0.8,
      weeklyHours: g.weekly_hours || 0,
      isActive: g.is_active,
      siteStats: g._siteStats || null,
      lastShiftDate: g._lastShiftDate || null,
    })),
  };

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    temperature: 0.2,
    messages: [
      {
        role: 'system',
        content: `
You are an AI staffing supervisor for a security company.

Your task:
- Rank guards from BEST to WORST for the shift
- Provide DETAILED explanations for WHY each guard is ranked where they are
- Include multiple factors in your explanation (reliability, acceptance rate, site experience, fatigue, etc.)

Return STRICT JSON ONLY in this format:

{
  "rankings": [
    {
      "guardId": "uuid",
      "rank": 1,
      "reason": "Detailed explanation mentioning reliability %, site experience, fatigue level, etc."
    }
  ]
}

Explanation Format Examples:
- "Guard A selected because: 97% on-time, Worked this site 6 times, Low fatigue score (32h/week)"
- "Guard B ranked #2: 85% acceptance rate, 90% reliability (decayed from inactivity), 5 previous shifts at this location"

Rules:
- Rank ALL guards provided
- Rank 1 is BEST
- Include specific metrics (percentages, counts, hours)
- Mention site-specific experience if available
- Note fatigue if weekly hours > 40
- Note reliability decay if guard hasn't worked recently
- No markdown
- No extra text
`
      },
      {
        role: 'user',
        content: JSON.stringify(enhancedContext, null, 2)
      }
    ]
  });

  const raw = response.choices[0].message.content.trim();
  
  // Clean up any markdown code blocks if present
  const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  
  const parsed = JSON.parse(cleaned);
  
  // Enhance rankings with calculated factors for explainability
  if (parsed.rankings && enhancedGuards) {
    parsed.rankings = parsed.rankings.map(ranking => {
      const guard = enhancedGuards.find(g => String(g.id) === String(ranking.guardId));
      if (guard) {
        const siteStats = guard._siteStats || { successRate: 0.5, shiftCount: 0 };
        const decayedReliability = guard._decayedReliability || guard.reliability_score || 0.8;
        
        return {
          ...ranking,
          factors: {
            acceptanceRate: guard.acceptance_rate || 0.85,
            reliabilityScore: decayedReliability,
            weeklyHours: guard.weekly_hours || 0,
            siteShiftCount: siteStats.shiftCount,
            siteSuccessRate: siteStats.successRate,
          },
        };
      }
      return ranking;
    });
  }

  return parsed;
}

module.exports = { rankGuardsWithAI, scoreGuard };
