/**
 * Command Center AI Service
 * 
 * Phase 2: LLM-powered analysis of operational data using DeepSeek (with OpenAI fallback)
 * - AI-generated summaries
 * - Pattern detection
 * - Intelligent recommendations
 * - Context-aware insights
 */

const {
  isChatAvailable,
  chatCompletionsCreate,
  getProviderInfo,
  isBillingOrQuotaError,
} = require("../utils/aiClient");

// Track last failure for /ai-status (no secrets)
let lastAiError = null;
let quotaExceeded = false;
let quotaExceededUntil = null;
const QUOTA_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour cooldown after quota error

function recordAiError(error, provider) {
  lastAiError = {
    at: new Date().toISOString(),
    provider: provider || null,
    status: error?.status || error?.response?.status || null,
    message: String(error?.message || "unknown").slice(0, 300),
    billingOrQuota: isBillingOrQuotaError(error),
  };
  if (lastAiError.billingOrQuota) {
    quotaExceeded = true;
    quotaExceededUntil = Date.now() + QUOTA_COOLDOWN_MS;
  }
}

function getAiStatus() {
  const info = getProviderInfo();
  return {
    ...info,
    quotaCooldownActive: !!(quotaExceeded && quotaExceededUntil && Date.now() < quotaExceededUntil),
    quotaCooldownUntil: quotaExceededUntil ? new Date(quotaExceededUntil).toISOString() : null,
    lastError: lastAiError,
  };
}

/**
 * Generate AI analysis for operational briefing
 * @param {Object} data - Aggregated operational data (events, shifts, stats)
 * @param {Object} context - Additional context (tenantId, timeRange, focus)
 * @returns {Promise<Object>} AI analysis with summary, insights, and recommendations
 */
async function generateOperationalBriefing(data, context = {}) {
  if (!isChatAvailable()) {
    console.warn("⚠️  AI API key not configured - using template-based briefing");
    return generateTemplateBriefing(data, context);
  }

  // Check if quota was recently exceeded on ALL providers
  if (quotaExceeded && quotaExceededUntil && Date.now() < quotaExceededUntil) {
    console.warn("⚠️  AI quota/billing cooldown active - using template-based briefing");
    return generateTemplateBriefing(data, context);
  }

  try {
    const { events = [], atRiskShifts = [], stats = {}, timeRange = "24h" } = data;
    
    // Prepare context for AI
    const eventSummary = events.slice(0, 20).map(e => ({
      type: e.type,
      severity: e.severity,
      title: e.title,
      timestamp: e.created_at,
    }));

    const riskSummary = atRiskShifts.slice(0, 10).map(item => ({
      shift_date: item.shift?.shift_date,
      shift_time: `${item.shift?.shift_start} - ${item.shift?.shift_end}`,
      risk_score: item.risk?.riskScore,
      risk_level: item.risk?.riskLevel,
      factors: Object.keys(item.risk?.factors || {}),
    }));

    const prompt = `You are an expert operations center analyst for a security guard scheduling platform. Analyze the following operational data and provide a comprehensive briefing.

**Time Range:** Last ${timeRange}

**Operational Events:** ${JSON.stringify(eventSummary, null, 2)}

**At-Risk Shifts:** ${JSON.stringify(riskSummary, null, 2)}

**Statistics:**
- Total Events: ${stats.totalEvents || 0}
- Incidents: ${stats.newIncidents || 0}
- Callouts: ${stats.newCallouts || 0}
- Open Shifts: ${stats.openShifts || 0}
- High-Risk Shifts: ${stats.atRiskShifts || 0}
- Critical Events: ${stats.bySeverity?.CRITICAL || 0}

Provide your analysis as JSON with this EXACT structure:
{
  "summary": "A concise 2-3 sentence executive summary of the operational status and key concerns.",
  "topRisks": [
    {
      "type": "SHIFT_COVERAGE|INCIDENT|COMPLIANCE",
      "severity": "LOW|MEDIUM|HIGH|CRITICAL",
      "title": "Brief title of the risk",
      "description": "Detailed description of why this is a risk",
      "impact": "Potential impact if not addressed"
    }
  ],
  "insights": [
    "Insight 1: Pattern or trend you've identified",
    "Insight 2: Another important observation"
  ],
  "recommendedActions": [
    {
      "type": "REQUEST_BACKUP|ESCALATE_SUPERVISOR|TRIGGER_CALLOUT|REQUEST_INSPECTION",
      "priority": "LOW|MEDIUM|HIGH|CRITICAL",
      "title": "Action title",
      "reason": "Why this action is recommended",
      "context": {},
      "confidence": 0.85
    }
  ],
  "trends": {
    "incidents": "INCREASING|DECREASING|STABLE",
    "callouts": "INCREASING|DECREASING|STABLE",
    "coverage": "IMPROVING|DETERIORATING|STABLE"
  }
}

**Important:**
- Be specific and actionable
- Focus on what matters most
- Provide clear reasoning for recommendations
- Return ONLY valid JSON, no markdown formatting`;

    const { completion, provider } = await chatCompletionsCreate({
      messages: [
        {
          role: "system",
          content: "You are an expert operations center analyst for security guard scheduling. Provide clear, actionable analysis of operational data. Always respond with valid JSON only, no markdown code blocks.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.3,
      max_tokens: 1500,
      response_format: { type: "json_object" },
    });

    const responseText = completion.choices[0]?.message?.content || "{}";
    
    // Parse JSON response
    let aiResponse;
    try {
      const jsonMatch = responseText.match(/```json\s*([\s\S]*?)\s*```/) || responseText.match(/```\s*([\s\S]*?)\s*```/);
      const jsonText = jsonMatch ? jsonMatch[1] : responseText.trim();
      aiResponse = JSON.parse(jsonText);
    } catch (e) {
      console.error("❌ Failed to parse AI response as JSON:", e.message);
      console.error("Response text:", responseText.substring(0, 200));
      return generateTemplateBriefing(data, context);
    }

    // Validate and normalize response
    return {
      summary: aiResponse.summary || generateTemplateBriefing(data, context).summary,
      topRisks: Array.isArray(aiResponse.topRisks) ? aiResponse.topRisks : [],
      insights: Array.isArray(aiResponse.insights) ? aiResponse.insights : [],
      recommendedActions: Array.isArray(aiResponse.recommendedActions) ? aiResponse.recommendedActions : [],
      trends: aiResponse.trends || {},
      aiGenerated: true,
      provider,
    };
  } catch (error) {
    recordAiError(error);
    console.warn(`⚠️  AI API error in generateOperationalBriefing: ${error.message}`);
    if (isBillingOrQuotaError(error)) {
      console.warn("💡 Check OpenAI/DeepSeek billing. AI features on cooldown for 1 hour.");
    }
    return generateTemplateBriefing(data, context);
  }
}

/**
 * Generate AI-powered risk analysis for a shift
 * @param {Object} shift - Shift data
 * @param {Object} context - Additional context (guard history, site info, etc.)
 * @returns {Promise<Object>} AI analysis of shift risk
 */
async function generateShiftRiskAnalysis(shift, context = {}) {
  if (!isChatAvailable()) {
    return {
      reasoning: "AI analysis not available (AI key not configured)",
      confidence: 0.5,
    };
  }

  try {
    const prompt = `Analyze the risk level for this security guard shift assignment:

**Shift Details:**
- Date: ${shift.shift_date}
- Time: ${shift.shift_start} - ${shift.shift_end}
- Guard: ${context.guardName || "Unassigned"}
- Location: ${shift.location || "Not specified"}

**Risk Factors:**
- Guard callout rate: ${(context.guardCalloutRate * 100).toFixed(0)}%
- Lateness rate: ${(context.guardLatenessRate * 100).toFixed(0)}%
- Hours until shift: ${context.hoursUntilShiftStart?.toFixed(1) || "N/A"} hours
- Site incident frequency: ${(context.siteIncidentRate * 100).toFixed(0)}%

Provide a brief risk analysis in JSON format:
{
  "reasoning": "Human-readable explanation of the risk assessment",
  "confidence": 0.85,
  "keyFactors": ["factor1", "factor2"]
}`;

    const { completion } = await chatCompletionsCreate({
      messages: [
        {
          role: "system",
          content: "You are a risk assessment analyst. Provide clear, concise risk analysis. Always respond with valid JSON only.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.3,
      max_tokens: 300,
      response_format: { type: "json_object" },
    });

    const responseText = completion.choices[0]?.message?.content || "{}";
    const jsonMatch = responseText.match(/```json\s*([\s\S]*?)\s*```/) || responseText.match(/```\s*([\s\S]*?)\s*```/);
    const jsonText = jsonMatch ? jsonMatch[1] : responseText.trim();
    return JSON.parse(jsonText);
  } catch (error) {
    recordAiError(error);
    return {
      reasoning: "Unable to generate AI analysis",
      confidence: 0.5,
    };
  }
}

/**
 * Auto-tag an operational event with AI (risk level + category)
 * @param {Object} event - Standardized event
 * @returns {Promise<Object>} AI tags { risk_level, category, auto_summary }
 */
async function tagEventWithAI(event) {
  if (!isChatAvailable()) {
    return {
      risk_level: event.severity,
      category: getEventCategory(event.type),
      auto_summary: event.summary || event.title,
      confidence: 0.7,
    };
  }

  if (quotaExceeded && quotaExceededUntil && Date.now() < quotaExceededUntil) {
    return {
      risk_level: event.severity,
      category: getEventCategory(event.type),
      auto_summary: event.summary || event.title,
      confidence: 0.7,
    };
  }

  if (quotaExceededUntil && Date.now() >= quotaExceededUntil) {
    quotaExceeded = false;
    quotaExceededUntil = null;
  }

  try {
    const prompt = `Analyze this operational event and provide tags:

**Event:**
- Type: ${event.type}
- Severity: ${event.severity}
- Title: ${event.title}
- Summary: ${event.summary || "N/A"}

Return JSON:
{
  "risk_level": "LOW|MEDIUM|HIGH|CRITICAL",
  "category": "Coverage|Incident|Compliance|Payroll|Client SLA",
  "auto_summary": "One-line summary suitable for a command center feed",
  "confidence": 0.85
}`;

    const { completion } = await chatCompletionsCreate({
      messages: [
        {
          role: "system",
          content: "You are an operations analyst. Tag events with risk level and category. Always respond with valid JSON only.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.2,
      max_tokens: 200,
      response_format: { type: "json_object" },
    });

    const responseText = completion.choices[0]?.message?.content || "{}";
    const jsonMatch = responseText.match(/```json\s*([\s\S]*?)\s*```/) || responseText.match(/```\s*([\s\S]*?)\s*```/);
    const jsonText = jsonMatch ? jsonMatch[1] : responseText.trim();

    quotaExceeded = false;
    quotaExceededUntil = null;

    return JSON.parse(jsonText);
  } catch (error) {
    recordAiError(error);
    if (isBillingOrQuotaError(error)) {
      console.warn("⚠️  AI quota/billing exceeded - tagging uses fallback for 1 hour");
    }

    return {
      risk_level: event.severity,
      category: getEventCategory(event.type),
      auto_summary: event.summary || event.title,
      confidence: 0.7,
    };
  }
}

/**
 * Get event category from type (fallback when AI unavailable)
 */
function getEventCategory(type) {
  const categoryMap = {
    INCIDENT: "Incident",
    CALLOUT: "Coverage",
    INSPECTION: "Compliance",
    CLOCKIN: "Compliance",
    SHIFT: "Coverage",
    COMPLIANCE: "Compliance",
    PAYROLL: "Payroll",
  };
  return categoryMap[type] || "Other";
}

/**
 * Template-based briefing (fallback when OpenAI unavailable)
 */
function generateTemplateBriefing(data, context) {
  const { events = [], atRiskShifts = [], stats = {}, timeRange = "24h" } = data;
  
  let summary = `Operations briefing for the last ${timeRange}:\n\n`;
  
  if (atRiskShifts.length > 0) {
    summary += `⚠️ ${atRiskShifts.length} high-risk shift${atRiskShifts.length > 1 ? "s" : ""} require immediate attention.\n`;
  }
  
  if (stats.newIncidents > 0) {
    summary += `📋 ${stats.newIncidents} new incident${stats.newIncidents > 1 ? "s" : ""} reported.\n`;
  }
  
  if (stats.newCallouts > 0) {
    summary += `📞 ${stats.newCallouts} callout${stats.newCallouts > 1 ? "s" : ""} recorded.\n`;
  }
  
  if (stats.openShifts > 0) {
    summary += `📅 ${stats.openShifts} open shift${stats.openShifts > 1 ? "s" : ""} need coverage.\n`;
  }
  
  if (stats.bySeverity?.CRITICAL > 0) {
    summary += `🚨 ${stats.bySeverity.CRITICAL} critical event${stats.bySeverity.CRITICAL > 1 ? "s" : ""} occurred.\n`;
  }
  
  if (!atRiskShifts.length && stats.newIncidents === 0 && stats.newCallouts === 0) {
    summary += "✅ Operations running smoothly with no critical issues.\n";
  }
  
  return {
    summary: summary.trim(),
    topRisks: [],
    insights: [],
    recommendedActions: [],
    trends: {},
    aiGenerated: false,
    provider: "template",
  };
}

/**
 * Generate AI-powered weekly operational summary
 * @param {Object} aggregatedData - Aggregated operational data for the week
 * @param {Object} options - { startDate, endDate }
 * @returns {Promise<Object>} AI-generated weekly summary
 */
async function generateWeeklySummary(aggregatedData, options = {}) {
  if (!isChatAvailable()) {
    console.warn("⚠️  AI API key not configured - weekly report will use template summary");
    return null;
  }

  if (quotaExceeded && quotaExceededUntil && Date.now() < quotaExceededUntil) {
    console.warn("⚠️  AI quota/billing cooldown active - weekly report will use template summary");
    return null;
  }

  try {
    const { metrics, insights, trends } = aggregatedData;
    const { startDate, endDate } = options;
    const days = Math.ceil((new Date(endDate) - new Date(startDate)) / (1000 * 60 * 60 * 24));

    const prompt = `You are an expert operations analyst creating a weekly operational summary report for a security guard scheduling platform.

**Report Period:** ${days} days (${new Date(startDate).toLocaleDateString()} - ${new Date(endDate).toLocaleDateString()})

**Operational Metrics:**
- Total Shifts: ${metrics.totalShifts}
- Completed Shifts: ${metrics.completedShifts} (${metrics.completionRate}% completion rate)
- Open Shifts: ${metrics.openShifts}
- Total Callouts: ${metrics.totalCallouts} (${metrics.calloutRate}% callout rate)
- Total Incidents: ${metrics.totalIncidents} (${metrics.openIncidents} open)
- Operational Events: ${metrics.totalEvents} (${metrics.highSeverityEvents} high-severity)

**Performance Insights:**
- Coverage Status: ${insights.coverage}
- Reliability Status: ${insights.reliability}
- Incident Rate: ${insights.incidentRate}

**Trends:**
- Shifts: ${trends.shifts}
- Callouts: ${trends.callouts}
- Incidents: ${trends.incidents}

Create a comprehensive weekly summary report. Provide your analysis as JSON with this EXACT structure:
{
  "overview": "A comprehensive 3-4 paragraph executive summary of the week's operations, highlighting key achievements, challenges, and overall performance.",
  "highlights": [
    "Key positive achievement or milestone",
    "Important operational event",
    "Notable pattern or trend"
  ],
  "recommendations": [
    "Actionable recommendation for improving operations",
    "Another specific recommendation",
    "Strategic insight for next week"
  ],
  "keyMetrics": {
    "bestPerforming": "What performed best this week",
    "needsAttention": "What needs attention next week",
    "trend": "Overall trend (improving/stable/declining)"
  }
}

**Important:**
- Be concise but comprehensive
- Focus on actionable insights
- Identify patterns and trends
- Provide clear recommendations
- Use professional but accessible language`;

    const { completion, provider } = await chatCompletionsCreate({
      messages: [
        {
          role: "system",
          content: "You are an expert operations analyst specializing in security guard scheduling and workforce management. You create clear, actionable weekly operational reports.",
        },
        { role: "user", content: prompt },
      ],
      temperature: 0.7,
      response_format: { type: "json_object" },
    });

    const responseText = completion.choices[0]?.message?.content || "{}";
    const aiAnalysis = JSON.parse(responseText);

    quotaExceeded = false;
    quotaExceededUntil = null;

    return {
      overview: aiAnalysis.overview || "Weekly operational summary generated.",
      highlights: Array.isArray(aiAnalysis.highlights) ? aiAnalysis.highlights : [],
      recommendations: Array.isArray(aiAnalysis.recommendations) ? aiAnalysis.recommendations : [],
      keyMetrics: aiAnalysis.keyMetrics || {},
      generatedByAI: true,
      provider,
    };
  } catch (error) {
    recordAiError(error);
    console.warn(`⚠️  AI weekly summary failed: ${error.message}`);
    if (isBillingOrQuotaError(error)) {
      console.warn("💡 Add credits on OpenAI and/or DeepSeek. Falling back to template summary.");
    }
    return null;
  }
}

module.exports = {
  generateOperationalBriefing,
  generateShiftRiskAnalysis,
  tagEventWithAI,
  generateWeeklySummary,
  getAiStatus,
};
