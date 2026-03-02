/**
 * Smart Notification Service
 * 
 * Tier 1: AI-powered notification intelligence
 * - Prioritizes notifications (CRITICAL, HIGH, MEDIUM, LOW)
 * - Groups related notifications
 * - Provides actionable insights
 * - Batches non-critical items
 * - Learns from user interactions
 */

const { Op } = require("sequelize");
const commandCenterAI = require("./commandCenterAI.service");

/**
 * Analyze notification and assign priority, category, and insights
 * @param {Object} notification - Notification object
 * @param {Object} context - Additional context (recent events, user activity, etc.)
 * @returns {Promise<Object>} Enhanced notification with smart metadata
 */
async function analyzeNotification(notification, context = {}) {
  try {
    // Rule-based priority assignment (fast, deterministic)
    const priority = assignPriority(notification, context);
    const category = assignCategory(notification);
    const urgency = calculateUrgency(notification, context);
    
    // AI-powered insights (if OpenAI available)
    let aiInsights = null;
    try {
      aiInsights = await generateAIInsights(notification, context);
    } catch (error) {
      console.warn("⚠️ AI insights generation failed, using rule-based:", error.message);
    }
    
    return {
      priority,
      category,
      urgency,
      shouldGroup: shouldGroupWithOthers(notification, context),
      actionable: isActionable(notification),
      quickActions: getQuickActions(notification),
      aiInsights: aiInsights || null,
      smartMetadata: {
        riskLevel: calculateRiskLevel(notification, context),
        timeSensitivity: calculateTimeSensitivity(notification),
        relatedEntities: findRelatedEntities(notification, context),
      },
    };
  } catch (error) {
    console.error("❌ Error analyzing notification:", error);
    // Return safe defaults
    return {
      priority: "MEDIUM",
      category: "GENERAL",
      urgency: "NORMAL",
      shouldGroup: false,
      actionable: false,
      quickActions: [],
      aiInsights: null,
      smartMetadata: {},
    };
  }
}

/**
 * Assign priority based on notification type and context
 */
function assignPriority(notification, context) {
  const { type, meta } = notification;
  
  // Critical priorities
  if (type.includes("CRITICAL") || type.includes("EMERGENCY")) {
    return "CRITICAL";
  }
  
  if (type.includes("INCIDENT") && meta?.severity === "CRITICAL") {
    return "CRITICAL";
  }
  
  // High priorities
  if (type.includes("HIGH_RISK")) {
    return "HIGH";
  }
  
  if (type.includes("UNFILLED_SHIFT")) {
    return "HIGH";
  }
  
  if (type.includes("SHIFT") && meta?.status === "UNCOVERED") {
    return "HIGH";
  }
  
  if (type.includes("INCIDENT") && meta?.severity === "HIGH") {
    return "HIGH";
  }
  
  if (type.includes("CALLOUT") && meta?.urgent === true) {
    return "HIGH";
  }
  
  // Medium priorities
  if (type.includes("SHIFT") || type.includes("CALLOUT")) {
    return "MEDIUM";
  }
  
  if (type.includes("GUARD") && type.includes("AVAILABILITY")) {
    return "MEDIUM";
  }
  
  // Low priorities
  if (type.includes("GUARD_CREATED") || type.includes("GUARD_DELETED")) {
    return "LOW";
  }
  
  if (type.includes("AI_RANKING") || type.includes("REPORT")) {
    return "LOW";
  }
  
  return "MEDIUM"; // Default
}

/**
 * Assign category to notification
 */
function assignCategory(notification) {
  const { type } = notification;
  
  if (type.includes("UNFILLED_SHIFT")) return "COVERAGE";
  if (type.includes("SHIFT")) return "COVERAGE";
  if (type.includes("CALLOUT")) return "COVERAGE";
  if (type.includes("INCIDENT")) return "INCIDENT";
  if (type.includes("GUARD")) return "PERSONNEL";
  if (type.includes("INSPECTION")) return "COMPLIANCE";
  if (type.includes("AI_")) return "AI_INSIGHTS";
  if (type.includes("REPORT")) return "REPORTS";
  
  return "GENERAL";
}

/**
 * Calculate urgency level
 */
function calculateUrgency(notification, context) {
  const { type, meta, created_at } = notification;
  const now = new Date();
  const age = now - new Date(created_at);
  const ageMinutes = age / (1000 * 60);
  
  // Critical items are always urgent
  if (type.includes("CRITICAL") || type.includes("EMERGENCY")) {
    return "URGENT";
  }
  
  // Time-sensitive items
  if (type.includes("HIGH_RISK")) {
    return "URGENT";
  }
  
  if (type.includes("UNFILLED_SHIFT")) {
    return "URGENT";
  }
  
  if (type.includes("SHIFT") && ageMinutes < 30) {
    return "URGENT";
  }
  
  if (type.includes("INCIDENT") && meta?.severity === "HIGH") {
    return "URGENT";
  }
  
  // Normal urgency
  if (ageMinutes < 60) {
    return "NORMAL";
  }
  
  // Low urgency for old items
  if (ageMinutes > 240) {
    return "LOW";
  }
  
  return "NORMAL";
}

/**
 * Determine if notification should be grouped with others
 */
function shouldGroupWithOthers(notification, context) {
  const { type, category } = notification;
  
  // Group similar types
  const groupableTypes = [
    "SHIFT_CLOSED",
    "SHIFT_CREATED",
    "CALLOUT_CREATED",
    "GUARD_AVAILABILITY_CHANGED",
  ];
  
  return groupableTypes.some(gt => type.includes(gt));
}

/**
 * Check if notification is actionable
 */
function isActionable(notification) {
  const { type } = notification;
  
  const actionableTypes = [
    "SHIFT",
    "CALLOUT",
    "INCIDENT",
    "INSPECTION",
  ];
  
  return actionableTypes.some(at => type.includes(at));
}

/**
 * Get quick actions for notification
 */
function getQuickActions(notification) {
  const { type, entityType, entityId } = notification;
  const actions = [];
  
  if (type.includes("SHIFT") && entityId) {
    actions.push({ label: "View Shift", action: "view", entityType: "shift", entityId });
    if (type.includes("OPEN") || type.includes("UNCOVERED")) {
      actions.push({ label: "Assign Guard", action: "assign", entityType: "shift", entityId });
    }
  }
  
  if (type.includes("CALLOUT") && entityId) {
    actions.push({ label: "View Callout", action: "view", entityType: "callout", entityId });
    actions.push({ label: "Find Replacement", action: "find_replacement", entityType: "callout", entityId });
  }
  
  if (type.includes("INCIDENT") && entityId) {
    actions.push({ label: "View Incident", action: "view", entityType: "incident", entityId });
    actions.push({ label: "Acknowledge", action: "acknowledge", entityType: "incident", entityId });
  }
  
  return actions;
}

/**
 * Calculate risk level
 */
function calculateRiskLevel(notification, context) {
  const { type, meta } = notification;
  
  if (type.includes("CRITICAL") || meta?.severity === "CRITICAL") {
    return "CRITICAL";
  }
  
  if (type.includes("INCIDENT") || type.includes("UNCOVERED")) {
    return "HIGH";
  }
  
  if (type.includes("CALLOUT") || type.includes("LATE")) {
    return "MEDIUM";
  }
  
  return "LOW";
}

/**
 * Calculate time sensitivity
 */
function calculateTimeSensitivity(notification) {
  const { type, created_at } = notification;
  const now = new Date();
  const age = now - new Date(created_at);
  const ageMinutes = age / (1000 * 60);
  
  if (type.includes("CRITICAL") || type.includes("EMERGENCY")) {
    return "IMMEDIATE"; // < 5 minutes
  }
  
  if (type.includes("SHIFT") && ageMinutes < 30) {
    return "URGENT"; // < 30 minutes
  }
  
  if (ageMinutes < 60) {
    return "SOON"; // < 1 hour
  }
  
  return "NORMAL"; // > 1 hour
}

/**
 * Find related entities
 */
function findRelatedEntities(notification, context) {
  const { type, entityType, entityId, meta } = notification;
  const related = [];
  
  // If shift-related, find related callouts
  if (type.includes("SHIFT") && meta?.guardId) {
    related.push({ type: "guard", id: meta.guardId });
  }
  
  // If callout-related, find related shifts
  if (type.includes("CALLOUT") && meta?.shiftId) {
    related.push({ type: "shift", id: meta.shiftId });
  }
  
  return related;
}

/**
 * Generate AI insights for notification
 */
async function generateAIInsights(notification, context) {
  try {
    const { type, title, message, meta } = notification;
    
    // Only use AI for complex notifications
    if (!type.includes("INCIDENT") && !type.includes("SHIFT") && !type.includes("CALLOUT")) {
      return null;
    }
    
    const prompt = `You are analyzing a notification for a security guard scheduling platform. Provide brief, actionable insights.

Notification Type: ${type}
Title: ${title}
Message: ${message}
Metadata: ${JSON.stringify(meta || {})}

Provide a JSON response with:
{
  "summary": "One-sentence summary of what this notification means",
  "actionRequired": true/false,
  "suggestedAction": "What should the admin do?",
  "context": "Additional context or pattern detected"
}

Be concise and actionable.`;

    // Use commandCenterAI if available
    const OpenAI = require('openai');
    const openai = process.env.OPENAI_API_KEY
      ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
      : null;
    
    if (!openai) {
      return null; // Fall back to rule-based
    }
    
    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "You are a notification analysis assistant for security operations. Provide concise, actionable insights.",
        },
        { role: "user", content: prompt },
      ],
      temperature: 0.5,
      response_format: { type: "json_object" },
    });
    
    const responseText = completion.choices[0]?.message?.content || "{}";
    return JSON.parse(responseText);
  } catch (error) {
    console.warn("⚠️ AI insights generation failed:", error.message);
    return null;
  }
}

/**
 * Group notifications by category, priority, or related entities
 * @param {Array} notifications - Array of notifications
 * @returns {Array} Grouped notifications
 */
function groupNotifications(notifications) {
  const groups = {
    critical: [],
    high: [],
    coverage: [],
    incidents: [],
    personnel: [],
    general: [],
  };
  
  notifications.forEach(notif => {
    const smart = notif.smartMetadata || {};
    const priority = smart.priority || "MEDIUM";
    const category = smart.category || "GENERAL";
    
    if (priority === "CRITICAL") {
      groups.critical.push(notif);
    } else if (priority === "HIGH") {
      groups.high.push(notif);
    } else if (category === "COVERAGE") {
      groups.coverage.push(notif);
    } else if (category === "INCIDENT") {
      groups.incidents.push(notif);
    } else if (category === "PERSONNEL") {
      groups.personnel.push(notif);
    } else {
      groups.general.push(notif);
    }
  });
  
  return groups;
}

/**
 * Create digest summary for batched notifications
 * @param {Array} notifications - Array of notifications to batch
 * @returns {Promise<Object>} Digest summary
 */
async function createDigestSummary(notifications) {
  try {
    if (notifications.length === 0) {
      return null;
    }
    
    // Group by category
    const byCategory = {};
    notifications.forEach(notif => {
      const category = notif.smartMetadata?.category || "GENERAL";
      if (!byCategory[category]) {
        byCategory[category] = [];
      }
      byCategory[category].push(notif);
    });
    
    // Create summary
    const summary = {
      total: notifications.length,
      byCategory: Object.keys(byCategory).map(cat => ({
        category: cat,
        count: byCategory[cat].length,
        items: byCategory[cat].slice(0, 3).map(n => ({
          title: n.title,
          type: n.type,
        })),
      })),
      timestamp: new Date().toISOString(),
    };
    
    return summary;
  } catch (error) {
    console.error("❌ Error creating digest summary:", error);
    return null;
  }
}

module.exports = {
  analyzeNotification,
  groupNotifications,
  createDigestSummary,
  assignPriority,
  assignCategory,
};
