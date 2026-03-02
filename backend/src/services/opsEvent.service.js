/**
 * OpsEvent Service
 * 
 * Standardizes and stores operational events from all sources.
 * Intercepts Socket.IO events and converts them to standardized OpEvent format.
 */

const { Op } = require("sequelize");
const commandCenterAI = require("./commandCenterAI.service");

/**
 * Standardize an event from any source into OpEvent format
 * @param {Object} event - Raw event from Socket.IO or API
 * @param {Object} context - Additional context (tenantId, siteId, etc.)
 * @returns {Object} Standardized OpEvent
 */
function standardizeEvent(event, context = {}) {
  const { tenantId, siteId } = context;
  
  // Determine event type and severity from raw event
  let type = "SHIFT";
  let severity = "LOW";
  let title = "Unknown Event";
  let summary = "";
  let entityRefs = {};

  // Handle different event types
  if (event.type === "incidents:new" || event.type === "incidents:updated") {
    type = "INCIDENT";
    severity = event.incident?.severity || "MEDIUM";
    if (event.incident?.severity === "HIGH" || event.incident?.severity === "CRITICAL") {
      severity = event.incident.severity;
    }
    title = `Incident: ${event.incident?.type || "Unknown"}`;
    summary = event.incident?.description || "";
    entityRefs = { incident_id: event.incident?.id };
  } else if (event.type === "callout_started" || event.type === "callout:new") {
    type = "CALLOUT";
    severity = "MEDIUM"; // Callouts are typically medium priority
    title = "Guard Callout";
    summary = event.reason || event.callout?.reason || "Guard has called out";
    entityRefs = {
      callout_id: event.calloutId || event.callout?.id,
      shift_id: event.shiftId || event.shift_id,
      guard_id: event.guardId || event.guard_id,
    };
  } else if (
    event.type === "inspection:request" ||
    event.type === "inspection:submitted" ||
    event.type === "inspection:request:created"
  ) {
    type = "INSPECTION";
    severity = event.inspection?.status === "OVERDUE" ? "HIGH" : "MEDIUM";
    title = `Inspection ${event.type.includes("submitted") ? "Submitted" : "Request"}`;
    summary = event.message || event.inspection?.instructions || "";
    entityRefs = {
      inspection_id: event.inspectionId || event.inspection?.id,
      guard_id: event.guardId || event.guard_id,
    };
  } else if (
    event.type === "guard_clocked_in" ||
    event.type === "guard_clocked_out" ||
    event.type === "guard_lunch_started" ||
    event.type === "guard_lunch_ended"
  ) {
    type = "CLOCKIN";
    severity = "LOW";
    const action = event.type.replace("guard_", "").replace(/_/g, " ");
    title = `Guard ${action}`;
    summary = event.message || `${action} recorded`;
    entityRefs = {
      guard_id: event.guardId || event.guard_id,
      time_entry_id: event.timeEntryId,
    };
  } else if (event.type === "shift_filled" || event.type === "shift:created") {
    type = "SHIFT";
    severity = "LOW";
    title = event.type === "shift_filled" ? "Shift Filled" : "New Shift Created";
    summary = event.message || "";
    entityRefs = {
      shift_id: event.shiftId || event.shift_id,
      guard_id: event.guardId || event.guard_id,
    };
  }

  return {
    tenant_id: tenantId || event.tenant_id || null,
    site_id: siteId || event.site_id || null,
    type,
    severity,
    title,
    summary,
    entity_refs: entityRefs,
    raw_event: event,
    created_at: new Date(),
  };
}

/**
 * Create an OpEvent from a standardized event
 * @param {Object} standardizedEvent - Standardized event from standardizeEvent()
 * @param {Object} models - Sequelize models
 * @param {Boolean} enableAI - Whether to enable AI tagging (default: true)
 * @returns {Promise<Object>} Created OpEvent
 */
async function createOpEvent(standardizedEvent, models, enableAI = true) {
  try {
    if (!models || !models.OpEvent) {
      console.warn("⚠️ OpEvent model not available - cannot create event");
      return null;
    }
    const { OpEvent } = models;

    // Phase 2: Add AI tagging if enabled and OpenAI is available
    if (enableAI && process.env.OPENAI_API_KEY) {
      try {
        const aiTags = await commandCenterAI.tagEventWithAI(standardizedEvent);
        standardizedEvent.ai_enhanced = true;
        standardizedEvent.ai_tags = aiTags;
      } catch (aiError) {
        // Don't fail event creation if AI tagging fails
        console.warn("⚠️ AI tagging failed for event:", aiError.message);
        standardizedEvent.ai_enhanced = false;
        standardizedEvent.ai_tags = {
          risk_level: standardizedEvent.severity,
          category: getEventCategory(standardizedEvent.type),
          auto_summary: standardizedEvent.summary || standardizedEvent.title,
          confidence: 0.7,
        };
      }
    } else {
      // Fallback: Basic tags without AI
      standardizedEvent.ai_enhanced = false;
      standardizedEvent.ai_tags = {
        risk_level: standardizedEvent.severity,
        category: getEventCategory(standardizedEvent.type),
        auto_summary: standardizedEvent.summary || standardizedEvent.title,
        confidence: 0.7,
      };
    }

    return await OpEvent.create(standardizedEvent);
  } catch (error) {
    // Don't throw - event creation is non-critical, just log it
    console.error("❌ Error creating OpEvent:", error.message);
    return null;
  }
}

/**
 * Get event category from type (fallback helper)
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
 * Get operational events feed
 * @param {Object} filters - { tenantId, siteId, type, severity, limit, offset }
 * @param {Object} models - Sequelize models
 * @returns {Promise<Array>} OpEvents
 */
async function getOpEventsFeed(filters = {}, models) {
  try {
    if (!models || !models.OpEvent) {
      console.warn("⚠️ OpEvent model not available - returning empty array");
      return [];
    }

    const { OpEvent } = models;
    const {
      tenantId,
      siteId,
      type,
      severity,
      limit = 50,
      offset = 0,
      startDate,
      endDate,
    } = filters;

    const where = {};

    if (tenantId) where.tenant_id = tenantId;
    if (siteId) where.site_id = siteId;
    if (type) where.type = type;
    if (severity) where.severity = severity;

    if (startDate || endDate) {
      where.created_at = {};
      if (startDate) where.created_at[Op.gte] = new Date(startDate);
      if (endDate) where.created_at[Op.lte] = new Date(endDate);
    }

    const events = await OpEvent.findAll({
      where,
      order: [["created_at", "DESC"]],
      limit: Math.min(limit, 200), // Cap at 200
      offset,
    });

    return events || [];
  } catch (error) {
    console.error("❌ Error in getOpEventsFeed:", error);
    // Return empty array instead of throwing - allows page to load even if table doesn't exist
    return [];
  }
}

/**
 * Get events for a specific time range (for summaries)
 * @param {String} tenantId
 * @param {Date} startDate
 * @param {Date} endDate
 * @param {Object} models
 * @returns {Promise<Array>} OpEvents
 */
async function getOpEventsByTimeRange(tenantId, startDate, endDate, models) {
  const { OpEvent } = models;
  return await OpEvent.findAll({
    where: {
      tenant_id: tenantId,
      created_at: {
        [Op.gte]: startDate,
        [Op.lte]: endDate,
      },
    },
    order: [["created_at", "DESC"]],
  });
}

module.exports = {
  standardizeEvent,
  createOpEvent,
  getOpEventsFeed,
  getOpEventsByTimeRange,
};
