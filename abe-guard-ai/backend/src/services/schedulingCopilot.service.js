/**
 * Scheduling Copilot Service
 * 
 * AI-powered scheduling assistant that:
 * - Parses natural language scheduling requests
 * - Proposes guard assignments
 * - Flags risks (overtime, fatigue, etc.)
 * - Provides assignment recommendations
 */

const { Op } = require("sequelize");
const rankGuards = require("./ranking.service");

/**
 * Parse natural language scheduling request
 * @param {string} request - Natural language request (e.g., "Cover all Manhattan night shifts this weekend")
 * @returns {Object} Parsed request with date range, location, shift type, constraints
 */
function parseSchedulingRequest(request) {
  const reqLower = request.toLowerCase();

  // Extract date/time information
  const today = new Date();
  const dayOfWeek = today.getDay(); // 0 = Sunday, 6 = Saturday

  let dateRange = null;
  let shiftType = null;
  let location = null;
  let constraints = {
    minimizeOvertime: reqLower.includes("minimum") && reqLower.includes("overtime"),
    prioritizeExperience: reqLower.includes("experienced") || reqLower.includes("experienced"),
    avoidFatigue: true, // Default
  };

  // Parse "this weekend"
  if (reqLower.includes("weekend") || reqLower.includes("saturday") || reqLower.includes("sunday")) {
    const saturday = new Date(today);
    saturday.setDate(today.getDate() + ((6 - dayOfWeek) % 7));
    const sunday = new Date(saturday);
    sunday.setDate(saturday.getDate() + 1);
    dateRange = {
      start: saturday.toISOString().split("T")[0],
      end: sunday.toISOString().split("T")[0],
    };
  }

  // Parse "night" or "overnight"
  if (reqLower.includes("night") || reqLower.includes("overnight")) {
    shiftType = "NIGHT";
  } else if (reqLower.includes("day") || reqLower.includes("morning")) {
    shiftType = "DAY";
  }

  // Extract location
  const locationKeywords = ["manhattan", "brooklyn", "queens", "bronx", "main office"];
  for (const keyword of locationKeywords) {
    if (reqLower.includes(keyword)) {
      location = keyword;
      break;
    }
  }

  return {
    dateRange,
    shiftType,
    location,
    constraints,
    originalRequest: request,
  };
}

/**
 * Find shifts matching the scheduling request
 * @param {Object} models - Sequelize models
 * @param {string} tenantId - Tenant ID
 * @param {Object} parsedRequest - Parsed request from parseSchedulingRequest
 * @returns {Promise<Array>} Matching shifts
 */
async function findMatchingShifts(models, tenantId, parsedRequest) {
  const { Shift } = models;
  const { dateRange, shiftType, location } = parsedRequest;

  const where = {
    tenant_id: tenantId,
    status: { [Op.in]: ["OPEN", "PENDING"] }, // Only unfilled shifts
  };

  if (dateRange) {
    where.shift_date = {
      [Op.between]: [dateRange.start, dateRange.end],
    };
  }

  if (location) {
    where.location = { [Op.iLike]: `%${location}%` };
  }

  const shifts = await Shift.findAll({
    where,
    order: [["shift_date", "ASC"], ["shift_start", "ASC"]],
    limit: 100,
  });

  // Filter by shift type if specified
  if (shiftType === "NIGHT") {
    return shifts.filter((shift) => {
      const startHour = parseInt(shift.shift_start?.split(":")[0] || 0);
      return startHour >= 18 || startHour < 6; // After 6 PM or before 6 AM
    });
  }

  if (shiftType === "DAY") {
    return shifts.filter((shift) => {
      const startHour = parseInt(shift.shift_start?.split(":")[0] || 0);
      return startHour >= 6 && startHour < 18; // Between 6 AM and 6 PM
    });
  }

  return shifts;
}

/**
 * Propose guard assignments for shifts
 * @param {Object} models - Sequelize models
 * @param {string} tenantId - Tenant ID
 * @param {Array} shifts - Shifts to assign
 * @param {Object} constraints - Assignment constraints
 * @returns {Promise<Object>} Proposed assignments with risks and recommendations
 */
async function proposeAssignments(models, tenantId, shifts, constraints) {
  const { Guard, Shift } = models;

  // Get all active guards
  const guards = await Guard.findAll({
    where: { tenant_id: tenantId, is_active: true },
  });

  const proposals = [];
  const risks = [];
  const guardWorkload = new Map(); // Track guard assignments to detect overtime

  for (const shift of shifts) {
    // Rank guards for this shift
    const rankedGuards = await rankGuards(guards, shift, models);

    // Select top guard that meets constraints
    let selectedGuard = null;
    let selectionReason = null;

    for (const guard of rankedGuards.slice(0, 5)) {
      // Check constraints
      const currentHours = guard.weekly_hours || 0;
      const proposedHours = calculateShiftHours(shift);
      const newTotalHours = currentHours + proposedHours;

      // Check overtime constraint
      if (constraints.minimizeOvertime && newTotalHours > 40) {
        risks.push({
          type: "OVERTIME_RISK",
          guardId: guard.id,
          guardName: guard.name,
          shiftId: shift.id,
          currentHours,
          proposedHours,
          newTotalHours,
          message: `${guard.name} would exceed 40 hours/week (${newTotalHours}h)`,
        });
        continue; // Skip this guard
      }

      // Check fatigue constraint
      if (constraints.avoidFatigue && newTotalHours > 50) {
        risks.push({
          type: "FATIGUE_RISK",
          guardId: guard.id,
          guardName: guard.name,
          shiftId: shift.id,
          currentHours,
          proposedHours,
          newTotalHours,
          message: `${guard.name} would exceed 50 hours/week (high fatigue risk)`,
        });
        continue; // Skip this guard
      }

      // Guard meets constraints
      selectedGuard = guard;
      selectionReason = guard._rankFactors
        ? `Ranked #1: ${Math.round((guard._rankFactors.reliabilityScore || 0.8) * 100)}% reliability, ${Math.round((guard._rankFactors.acceptanceRate || 0.85) * 100)}% acceptance rate`
        : "Ranked #1 by scoring algorithm";
      break;
    }

    if (selectedGuard) {
      const shiftHours = calculateShiftHours(shift);
      const currentWorkload = guardWorkload.get(selectedGuard.id) || 0;
      guardWorkload.set(selectedGuard.id, currentWorkload + shiftHours);

      proposals.push({
        shiftId: shift.id,
        shiftDate: shift.shift_date,
        shiftStart: shift.shift_start,
        shiftEnd: shift.shift_end,
        location: shift.location,
        guardId: selectedGuard.id,
        guardName: selectedGuard.name,
        guardReliability: selectedGuard.reliability_score || 0.8,
        guardAcceptanceRate: selectedGuard.acceptance_rate || 0.85,
        guardCurrentHours: selectedGuard.weekly_hours || 0,
        proposedHours: shiftHours,
        guardNewTotalHours: (selectedGuard.weekly_hours || 0) + shiftHours,
        selectionReason,
      });
    } else {
      risks.push({
        type: "NO_GUARD_AVAILABLE",
        shiftId: shift.id,
        shiftDate: shift.shift_date,
        location: shift.location,
        message: `No suitable guard found for shift on ${shift.shift_date} at ${shift.location}`,
      });
    }
  }

  // Summary statistics
  const totalShifts = shifts.length;
  const assignedShifts = proposals.length;
  const unassignedShifts = totalShifts - assignedShifts;
  const totalOvertimeHours = Array.from(guardWorkload.values())
    .filter((hours) => hours > 40)
    .reduce((sum, hours) => sum + (hours - 40), 0);

  return {
    proposals,
    risks,
    summary: {
      totalShifts,
      assignedShifts,
      unassignedShifts,
      totalOvertimeHours: constraints.minimizeOvertime ? 0 : totalOvertimeHours,
      assignmentRate: totalShifts > 0 ? assignedShifts / totalShifts : 0,
    },
  };
}

/**
 * Calculate shift hours from start and end times
 * @param {Object} shift - Shift object
 * @returns {number} Hours worked
 */
function calculateShiftHours(shift) {
  if (!shift.shift_start || !shift.shift_end) return 8; // Default 8 hours

  try {
    const start = new Date(`2000-01-01T${shift.shift_start}`);
    const end = new Date(`2000-01-01T${shift.shift_end}`);

    // Handle overnight shifts
    if (end < start) {
      end.setDate(end.getDate() + 1);
    }

    const diffMs = end - start;
    const diffHours = diffMs / (1000 * 60 * 60);
    return Math.round(diffHours * 10) / 10; // Round to 1 decimal
  } catch (error) {
    return 8; // Default fallback
  }
}

/**
 * Main scheduling copilot function
 * @param {Object} params - Parameters
 * @param {Object} params.models - Sequelize models
 * @param {string} params.tenantId - Tenant ID
 * @param {string} params.request - Natural language scheduling request
 * @returns {Promise<Object>} Scheduling proposal with assignments and risks
 */
async function generateSchedulingProposal({ models, tenantId, request }) {
  // Parse request
  const parsedRequest = parseSchedulingRequest(request);

  // Find matching shifts
  const shifts = await findMatchingShifts(models, tenantId, parsedRequest);

  if (shifts.length === 0) {
    return {
      proposals: [],
      risks: [
        {
          type: "NO_SHIFTS_FOUND",
          message: `No matching shifts found for request: "${request}"`,
        },
      ],
      summary: {
        totalShifts: 0,
        assignedShifts: 0,
        unassignedShifts: 0,
        totalOvertimeHours: 0,
        assignmentRate: 0,
      },
    };
  }

  // Propose assignments
  const proposal = await proposeAssignments(models, tenantId, shifts, parsedRequest.constraints);

  return proposal;
}

module.exports = {
  generateSchedulingProposal,
  parseSchedulingRequest,
  findMatchingShifts,
  proposeAssignments,
};
