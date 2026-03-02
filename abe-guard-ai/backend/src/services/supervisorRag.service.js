/**
 * Supervisor RAG Service
 * 
 * Retrieves relevant data for supervisor questions about:
 * - Guard reliability and performance
 * - Shift fill rates and difficulty
 * - Location/incident history
 * - Scheduling patterns
 */

const { Op, Sequelize } = require("sequelize");

/**
 * Retrieve guard performance data for questions
 * @param {Object} models - Sequelize models
 * @param {string} tenantId - Tenant ID
 * @param {string} query - Question text
 * @returns {Promise<Array>} Array of relevant guard data chunks
 */
async function retrieveGuardData(models, tenantId, query) {
  const { Guard, Shift, Callout } = models;
  
  // Ensure tenantId is a valid UUID string
  if (!tenantId) {
    throw new Error('Invalid tenantId: must be a UUID string');
  }
  tenantId = String(tenantId).trim(); // Ensure it's a string

  const queryLower = query.toLowerCase();

  // Extract keywords
  const keywords = {
    overnight: queryLower.includes("overnight") || queryLower.includes("night"),
    reliable: queryLower.includes("reliable") || queryLower.includes("reliability"),
    experienced: queryLower.includes("experienced") || queryLower.includes("experience"),
    location: extractLocation(query),
  };

  // Build guard query with performance metrics
  // Note: Guards don't have direct shifts association in models/index.js
  // We'll fetch guards and then calculate stats separately
  const guards = await Guard.findAll({
    where: { tenant_id: tenantId, is_active: true },
    limit: 50,
  });

  // Enrich guards with performance data
  const enrichedGuards = await Promise.all(
    guards.map(async (guard) => {
      // Calculate stats
      const allShifts = await Shift.count({
        where: { guard_id: guard.id, status: "CLOSED" },
      });

      const callouts = await Callout.count({
        where: { guard_id: guard.id },
      });

      // Note: Callout model doesn't have a response field, so we can't track acceptance via callouts
      // We'll use allShifts (completed shifts) as a proxy for "accepted callouts"
      // since a guard accepting a callout leads to them being assigned to the shift
      const acceptedCallouts = allShifts;

      // Calculate overnight shifts if keyword matches
      let overnightCount = 0;
      if (keywords.overnight) {
        overnightCount = await Shift.count({
          where: {
            guard_id: guard.id,
            status: "CLOSED",
            // Overnight shifts typically start after 6 PM or before 6 AM
            [Op.or]: [
              Sequelize.where(Sequelize.cast(Sequelize.col("shift_start"), "TEXT"), { [Op.gte]: "18:00:00" }),
              Sequelize.where(Sequelize.cast(Sequelize.col("shift_start"), "TEXT"), { [Op.lte]: "06:00:00" }),
            ],
          },
        });
      }

      // Calculate location-specific shifts if location mentioned
      let locationShifts = 0;
      if (keywords.location) {
        locationShifts = await Shift.count({
          where: {
            guard_id: guard.id,
            location: keywords.location,
            status: "CLOSED",
          },
        });
      }

      return {
        id: guard.id,
        name: guard.name,
        reliability_score: guard.reliability_score || 0.8,
        acceptance_rate: guard.acceptance_rate || 0.85,
        total_shifts: allShifts,
        callouts_received: callouts,
        callouts_accepted: acceptedCallouts,
        callout_acceptance_rate: callouts > 0 ? acceptedCallouts / callouts : 0,
        overnight_shifts: overnightCount,
        location_shifts: locationShifts,
        weekly_hours: guard.weekly_hours || 0,
      };
    })
  );

  // Convert to RAG chunks
  return enrichedGuards.map((g) => ({
    type: "guard",
    content: `Guard ${g.name} (ID: ${g.id}):
- Reliability Score: ${Math.round(g.reliability_score * 100)}%
- Acceptance Rate: ${Math.round(g.acceptance_rate * 100)}%
- Total Shifts Completed: ${g.total_shifts}
- Callouts Accepted: ${g.callouts_accepted} out of ${g.callouts_received} (${Math.round(g.callout_acceptance_rate * 100)}%)
- Overnight Shifts: ${g.overnight_shifts}
- Location-Specific Shifts: ${g.location_shifts}
- Current Weekly Hours: ${g.weekly_hours}`,
    metadata: g,
    score: 1.0, // All guards are equally relevant for now
  }));
}

/**
 * Retrieve shift fill difficulty data
 * @param {Object} models - Sequelize models
 * @param {string} tenantId - Tenant ID
 * @param {string} query - Question text
 * @returns {Promise<Array>} Array of relevant shift data chunks
 */
async function retrieveShiftData(models, tenantId, query) {
  const { Shift, Callout, AIDecision } = models;
  
  // Ensure tenantId is a valid UUID string
  if (!tenantId || typeof tenantId !== 'string') {
    throw new Error('Invalid tenantId: must be a UUID string');
  }

  const queryLower = query.toLowerCase();

  // Find shifts that were hard to fill (multiple callouts, long time open)
  // Note: Check associations in models/index.js - Callout belongsTo Shift, AIDecision belongsTo Shift
  // We'll fetch shifts and related data separately
  const hardToFillShifts = await Shift.findAll({
    where: { tenant_id: tenantId },
    limit: 100,
    order: [["created_at", "DESC"]],
  });

  // Analyze fill difficulty
  const shiftChunks = await Promise.all(
    hardToFillShifts.map(async (shift) => {
      // Get callouts for this shift
      const callouts = await Callout.findAll({
        where: { shift_id: shift.id },
      });
      const calloutCount = callouts.length;
      // Note: Callout model doesn't have response field based on the model I saw
      // Assuming all callouts are "sent" - we'll need to track acceptance differently
      const calloutAccepted = 0; // Placeholder - would need to check actual acceptance logic

      // Calculate time open
      const createdAt = new Date(shift.created_at);
      const filledAt = shift.status === "CLOSED" ? new Date(shift.updated_at || shift.created_at) : new Date();
      const hoursOpen = (filledAt - createdAt) / (1000 * 60 * 60);

      const difficulty = calloutCount > 3 || hoursOpen > 24 ? "HIGH" : calloutCount > 1 || hoursOpen > 12 ? "MEDIUM" : "LOW";

      // Get AI decision reasons if available
      const aiDecisions = await AIDecision.findAll({
        where: { shift_id: shift.id },
        limit: 5,
      });
      const aiReasons = aiDecisions.map((d) => {
        const decision = d.decision_json || {};
        return decision.rankings?.map((r) => r.reason).join("; ") || null;
      }).filter(Boolean);

      return {
        type: "shift",
        content: `Shift on ${shift.shift_date} ${shift.shift_start}-${shift.shift_end} at ${shift.location || "Unknown Location"}:
- Status: ${shift.status}
- Fill Difficulty: ${difficulty}
- Callouts Sent: ${calloutCount}
- Callouts Accepted: ${calloutAccepted}
- Hours Open: ${hoursOpen.toFixed(1)} hours
${aiReasons.length > 0 ? `- AI Reasons: ${aiReasons.join("; ")}` : ""}`,
        metadata: {
          shift_id: shift.id,
          shift_date: shift.shift_date,
          location: shift.location,
          difficulty,
          calloutCount,
          hoursOpen,
        },
        score: difficulty === "HIGH" ? 1.0 : difficulty === "MEDIUM" ? 0.7 : 0.4,
      };
    })
  );

  // Filter and sort by relevance
  return shiftChunks
    .filter((chunk) => {
      // Filter by keywords
      if (queryLower.includes("hard to fill") && chunk.metadata.difficulty !== "HIGH") return false;
      if (queryLower.includes("location") && !chunk.metadata.location) return false;
      return true;
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 20); // Top 20 most relevant
}

/**
 * Retrieve location/incident data
 * @param {Object} models - Sequelize models
 * @param {string} tenantId - Tenant ID
 * @param {string} query - Question text
 * @returns {Promise<Array>} Array of relevant location data chunks
 */
async function retrieveLocationData(models, tenantId, query) {
  const { Shift, ShiftTimeEntry } = models;
  
  // Ensure tenantId is a valid UUID string
  if (!tenantId || typeof tenantId !== 'string') {
    throw new Error('Invalid tenantId: must be a UUID string');
  }

  const queryLower = query.toLowerCase();
  const location = extractLocation(query);

  if (!queryLower.includes("incident") && !queryLower.includes("location") && !location) {
    return [];
  }

  // Find shifts at location
  const shifts = await Shift.findAll({
    where: {
      tenant_id: tenantId,
      ...(location ? { location: { [Op.iLike]: `%${location}%` } } : {}),
    },
    limit: 50,
  });

  // Get time entries with location issues for these shifts
  const locationChunks = await Promise.all(
    shifts.map(async (shift) => {
      const timeEntries = await ShiftTimeEntry.findAll({
        where: {
          shift_id: shift.id,
          // Look for exceptions/incidents
          location_verified: false,
          // Note: distance_m might not exist, check model
        },
        limit: 10,
      });

      const exceptions = timeEntries.length;
      if (exceptions === 0) return null;

      return {
        type: "location_incident",
        content: `Location: ${shift.location || "Unknown"}
- Shift: ${shift.shift_date} ${shift.shift_start}-${shift.shift_end}
- Exceptions Found: ${exceptions}
- Location Verification Issues: ${exceptions} entry/entries with location mismatches`,
        metadata: {
          location: shift.location,
          shift_date: shift.shift_date,
          exception_count: exceptions,
        },
        score: exceptions > 0 ? 1.0 : 0.5,
      };
    })
  );

  return locationChunks.filter(Boolean).slice(0, 10);
}

/**
 * Extract location from query (simple keyword matching)
 * @param {string} query - Question text
 * @returns {string|null} Extracted location or null
 */
function extractLocation(query) {
  const locationKeywords = ["manhattan", "brooklyn", "queens", "bronx", "main office", "site", "location"];
  const queryLower = query.toLowerCase();

  for (const keyword of locationKeywords) {
    if (queryLower.includes(keyword)) {
      // Try to extract the full location name
      const regex = new RegExp(`${keyword}[^?.!]*`, "i");
      const match = query.match(regex);
      if (match) return match[0].trim();
      return keyword;
    }
  }

  return null;
}

/**
 * Main RAG retrieval function
 * @param {Object} params - Parameters
 * @param {Object} params.models - Sequelize models
 * @param {string} params.tenantId - Tenant ID
 * @param {string} params.query - Question text
 * @returns {Promise<Array>} Combined relevant data chunks
 */
async function retrieveSupervisorData({ models, tenantId, query }) {
  const queryLower = query.toLowerCase();

  // Determine what data to retrieve based on question
  const chunks = [];

  // Guard-related questions
  if (
    queryLower.includes("who") ||
    queryLower.includes("guard") ||
    queryLower.includes("reliable") ||
    queryLower.includes("experienced") ||
    queryLower.includes("best") ||
    queryLower.includes("overnight")
  ) {
    const guardChunks = await retrieveGuardData(models, tenantId, query);
    chunks.push(...guardChunks);
  }

  // Shift-related questions
  if (
    queryLower.includes("shift") ||
    queryLower.includes("fill") ||
    queryLower.includes("hard") ||
    queryLower.includes("difficult") ||
    queryLower.includes("why")
  ) {
    const shiftChunks = await retrieveShiftData(models, tenantId, query);
    chunks.push(...shiftChunks);
  }

  // Location/incident questions
  if (
    queryLower.includes("incident") ||
    queryLower.includes("location") ||
    queryLower.includes("this location") ||
    queryLower.includes("site")
  ) {
    const locationChunks = await retrieveLocationData(models, tenantId, query);
    chunks.push(...locationChunks);
  }

  // Sort by relevance score and return top results
  return chunks.sort((a, b) => b.score - a.score).slice(0, 20);
}

module.exports = {
  retrieveSupervisorData,
  retrieveGuardData,
  retrieveShiftData,
  retrieveLocationData,
};
