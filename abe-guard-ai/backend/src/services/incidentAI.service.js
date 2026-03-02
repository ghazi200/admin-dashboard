/**
 * Incident AI Service
 * 
 * Generates AI-powered analysis for incidents using DeepSeek (with OpenAI fallback)
 * Includes:
 * - Summary
 * - Timeline
 * - Risk Category
 */

const { createChatClient, isChatAvailable } = require("../utils/aiClient");

// Initialize AI client (DeepSeek preferred, OpenAI fallback)
const aiConfig = isChatAvailable() ? createChatClient() : null;

/**
 * Generate AI analysis for an incident
 * @param {Object} incident - Incident object with all related data
 * @param {Object} options - Optional context (site, guard, etc.)
 * @returns {Promise<Object>} AI analysis with summary, timeline, and riskCategory
 */
async function generateIncidentAnalysis(incident, options = {}) {
  if (!aiConfig || !aiConfig.client) {
    console.warn("⚠️  AI API key not configured - generating mock AI analysis");
    return generateMockAnalysis(incident);
  }

  try {
    const site = options.site || null;
    const guard = options.guard || null;
    
    // Build context for AI
    const incidentContext = {
      type: incident.type,
      severity: incident.severity,
      status: incident.status,
      location: incident.location_text || (site ? `${site.name}, ${site.address_1 || ''} ${site.city || ''}`.trim() : 'Not specified'),
      description: incident.description,
      reportedAt: new Date(incident.reported_at).toISOString(),
      occurredAt: incident.occurred_at ? new Date(incident.occurred_at).toISOString() : null,
      guardName: guard ? (guard.name || guard.email) : 'Unknown',
      siteName: site ? site.name : null,
    };

    const prompt = `You are a security operations center (SOC) analyst. Analyze the following incident report and provide a comprehensive analysis.

**Incident Details:**
- Type: ${incidentContext.type}
- Severity: ${incidentContext.severity}
- Status: ${incidentContext.status}
- Location: ${incidentContext.location}
- Description: ${incidentContext.description}
- Reported at: ${new Date(incidentContext.reportedAt).toLocaleString()}
${incidentContext.occurredAt ? `- Occurred at: ${new Date(incidentContext.occurredAt).toLocaleString()}` : ''}
${incidentContext.guardName ? `- Reported by: ${incidentContext.guardName}` : ''}
${incidentContext.siteName ? `- Site: ${incidentContext.siteName}` : ''}

Provide your analysis as JSON with this EXACT structure:
{
  "summary": "A concise 2-3 sentence summary of the incident, its significance, and immediate implications.",
  "timeline": [
    {
      "timestamp": "ISO 8601 timestamp",
      "event": "Description of what happened at this time"
    }
  ],
  "riskCategory": "One of: Security Threat, Property Damage, Medical Emergency, Safety Hazard, Policy Violation, Equipment Failure, Environmental, Other",
  "riskLevel": "LOW|MEDIUM|HIGH|CRITICAL",
  "urgency": "LOW|MODERATE|HIGH|CRITICAL",
  "recommendedActions": [
    "Action item 1",
    "Action item 2",
    "Action item 3"
  ]
}

**Important:**
- Timeline should include at least: incident occurrence, incident reporting, and current status
- Risk category should be specific and actionable
- Return ONLY valid JSON, no markdown formatting`;

    const completion = await aiConfig.client.chat.completions.create({
      model: aiConfig.model,
      messages: [
        {
          role: "system",
          content: "You are an expert security operations center (SOC) analyst. Provide accurate, actionable analysis of security incidents. Always respond with valid JSON only, no markdown code blocks, no explanations outside the JSON.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.3,
      max_tokens: 800,
      response_format: { type: "json_object" },
    });

    const responseText = completion.choices[0]?.message?.content || "{}";
    
    // Parse JSON response
    let aiResponse;
    try {
      // Remove markdown code blocks if present (some models still add them)
      const jsonMatch = responseText.match(/```json\s*([\s\S]*?)\s*```/) || responseText.match(/```\s*([\s\S]*?)\s*```/);
      const jsonText = jsonMatch ? jsonMatch[1] : responseText.trim();
      aiResponse = JSON.parse(jsonText);
    } catch (e) {
      console.error("❌ Failed to parse AI response as JSON:", e.message);
      console.error("Response text:", responseText.substring(0, 200));
      // Fallback to mock analysis
      return generateMockAnalysis(incident);
    }

    // Validate and normalize response
    return {
      summary: aiResponse.summary || generateMockAnalysis(incident).summary,
      timeline: Array.isArray(aiResponse.timeline) ? aiResponse.timeline : generateMockAnalysis(incident).timeline,
      riskCategory: aiResponse.riskCategory || "Other",
      riskLevel: aiResponse.riskLevel || incident.severity,
      urgency: aiResponse.urgency || (incident.severity === 'HIGH' ? 'HIGH' : 'MODERATE'),
      recommendedActions: Array.isArray(aiResponse.recommendedActions) ? aiResponse.recommendedActions : [],
    };
  } catch (error) {
    console.error(`❌ ${aiConfig.provider.toUpperCase()} API error:`, error.message);
    // Fallback to mock analysis
    return generateMockAnalysis(incident);
  }
}

/**
 * Generate mock analysis when OpenAI is unavailable
 */
function generateMockAnalysis(incident) {
  const occurredAt = incident.occurred_at ? new Date(incident.occurred_at) : new Date(incident.reported_at);
  const reportedAt = new Date(incident.reported_at);
  const now = new Date();

  // Determine risk category based on incident type
  let riskCategory = "Other";
  if (incident.type === "TRESPASS" || incident.type === "THEFT") {
    riskCategory = "Security Threat";
  } else if (incident.type === "VANDALISM") {
    riskCategory = "Property Damage";
  } else if (incident.type === "MEDICAL") {
    riskCategory = "Medical Emergency";
  }

  return {
    summary: `This is a ${incident.severity} severity ${incident.type} incident reported at ${incident.location_text || 'an unspecified location'}. The incident requires ${incident.severity === 'HIGH' ? 'immediate' : incident.severity === 'MEDIUM' ? 'prompt' : 'standard'} attention based on the severity level. Recommended actions include verifying details with the reporting guard, assessing immediate threat level, and following tenant incident response protocol.`,
    timeline: [
      {
        timestamp: occurredAt.toISOString(),
        event: `Incident occurred: ${incident.type} at ${incident.location_text || 'location'}`,
      },
      {
        timestamp: reportedAt.toISOString(),
        event: `Incident reported by guard`,
      },
      {
        timestamp: now.toISOString(),
        event: `Status: ${incident.status} - Awaiting review`,
      },
    ],
    riskCategory: riskCategory,
    riskLevel: incident.severity,
    urgency: incident.severity === 'HIGH' ? 'HIGH' : incident.severity === 'MEDIUM' ? 'MODERATE' : 'LOW',
    recommendedActions: [
      "Contact reporting guard for additional details",
      "Review incident location and time",
      "Assess if immediate response team is needed",
      "Document for incident log",
    ],
  };
}

module.exports = {
  generateIncidentAnalysis,
};
