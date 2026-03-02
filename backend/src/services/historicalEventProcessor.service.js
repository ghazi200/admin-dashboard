/**
 * Historical Event Processor
 * 
 * Processes historical data and creates OpEvents retroactively.
 * Useful for:
 * - Backfilling OpEvents from existing incidents, callouts, shifts
 * - Replaying events for analysis
 * - Migrating data to OpEvent format
 */

const opsEventService = require("./opsEvent.service");
const { Op } = require("sequelize");

/**
 * Process historical incidents and create OpEvents
 * @param {String} tenantId - Tenant ID (optional, if null processes all)
 * @param {Object} models - Sequelize models
 * @param {Object} options - { startDate, endDate, limit, dryRun }
 * @returns {Promise<Object>} Processing results
 */
async function processHistoricalIncidents(tenantId, models, options = {}) {
  try {
    const { Incident } = models;
    if (!Incident) {
      return { processed: 0, skipped: 0, errors: 0, message: "Incident model not available" };
    }

    const where = {};
    if (tenantId) where.tenant_id = tenantId;
    if (options.startDate && options.endDate) {
      where.reported_at = { [Op.between]: [options.startDate, options.endDate] };
    }

    const incidents = await Incident.findAll({
      where,
      limit: options.limit || 100,
      order: [["reported_at", "DESC"]],
    });

    let processed = 0;
    let skipped = 0;
    let errors = 0;

    for (const incident of incidents) {
      try {
        // Check if OpEvent already exists for this incident
        const { OpEvent } = models;
        const existing = await OpEvent.findOne({
          where: {
            type: "INCIDENT",
            entity_refs: { incident_id: incident.id },
          },
        });

        if (existing && !options.force) {
          skipped++;
          continue;
        }

        if (!options.dryRun) {
          await opsEventService.createOpEvent(
            {
              tenant_id: incident.tenant_id,
              site_id: incident.site_id || null,
              type: "INCIDENT",
              severity: incident.severity || "MEDIUM",
              title: `Incident: ${incident.type || "Unknown"}`,
              summary: incident.description || incident.ai_summary || "Incident reported",
              entity_refs: {
                incident_id: incident.id,
              },
              created_at: new Date(incident.reported_at || incident.created_at),
            },
            models,
            false // Don't tag with AI for historical data
          );
        }
        processed++;
      } catch (error) {
        console.error(`❌ Error processing incident ${incident.id}:`, error.message);
        errors++;
      }
    }

    return {
      processed,
      skipped,
      errors,
      total: incidents.length,
      dryRun: options.dryRun || false,
    };
  } catch (error) {
    console.error("❌ Error processing historical incidents:", error);
    throw error;
  }
}

/**
 * Process historical callouts and create OpEvents
 * @param {String} tenantId - Tenant ID (optional)
 * @param {Object} models - Sequelize models
 * @param {Object} options - Processing options
 * @returns {Promise<Object>} Processing results
 */
async function processHistoricalCallouts(tenantId, models, options = {}) {
  try {
    const { CallOut } = models;
    if (!CallOut) {
      return { processed: 0, skipped: 0, errors: 0, message: "CallOut model not available" };
    }

    const where = {};
    if (tenantId) where.tenant_id = tenantId;
    if (options.startDate && options.endDate) {
      where.created_at = { [Op.between]: [options.startDate, options.endDate] };
    }

    const callouts = await CallOut.findAll({
      where,
      limit: options.limit || 100,
      order: [["created_at", "DESC"]],
    });

    let processed = 0;
    let skipped = 0;
    let errors = 0;

    for (const callout of callouts) {
      try {
        // Check if OpEvent already exists
        const { OpEvent } = models;
        const existing = await OpEvent.findOne({
          where: {
            type: "CALLOUT",
            entity_refs: { callout_id: callout.id },
          },
        });

        if (existing && !options.force) {
          skipped++;
          continue;
        }

        if (!options.dryRun) {
          await opsEventService.createOpEvent(
            {
              tenant_id: callout.tenant_id,
              site_id: null,
              type: "CALLOUT",
              severity: "MEDIUM",
              title: "Guard Callout",
              summary: `Guard called out${callout.reason ? `: ${callout.reason}` : ""}`,
              entity_refs: {
                callout_id: callout.id,
                guard_id: callout.guard_id,
                shift_id: callout.shift_id || null,
              },
              created_at: new Date(callout.created_at),
            },
            models,
            false // Don't tag with AI for historical data
          );
        }
        processed++;
      } catch (error) {
        console.error(`❌ Error processing callout ${callout.id}:`, error.message);
        errors++;
      }
    }

    return {
      processed,
      skipped,
      errors,
      total: callouts.length,
      dryRun: options.dryRun || false,
    };
  } catch (error) {
    console.error("❌ Error processing historical callouts:", error);
    throw error;
  }
}

/**
 * Process historical shifts and create OpEvents
 * @param {String} tenantId - Tenant ID (optional)
 * @param {Object} models - Sequelize models
 * @param {Object} options - Processing options
 * @returns {Promise<Object>} Processing results
 */
async function processHistoricalShifts(tenantId, models, options = {}) {
  try {
    const { Shift } = models;
    if (!Shift) {
      return { processed: 0, skipped: 0, errors: 0, message: "Shift model not available" };
    }

    const where = {};
    if (tenantId) where.tenant_id = tenantId;
    if (options.startDate && options.endDate) {
      where.shift_date = { [Op.between]: [options.startDate, options.endDate] };
    }

    const shifts = await Shift.findAll({
      where,
      limit: options.limit || 100,
      order: [["shift_date", "DESC"]],
    });

    let processed = 0;
    let skipped = 0;
    let errors = 0;

    for (const shift of shifts) {
      try {
        // Only process open or recently closed shifts
        if (shift.status === "CLOSED" && options.onlyOpen) {
          skipped++;
          continue;
        }

        // Check if OpEvent already exists
        const { OpEvent } = models;
        const existing = await OpEvent.findOne({
          where: {
            type: "SHIFT",
            entity_refs: { shift_id: shift.id },
          },
        });

        if (existing && !options.force) {
          skipped++;
          continue;
        }

        if (!options.dryRun) {
          const severity = shift.guard_id ? "LOW" : "MEDIUM";
          const title = shift.status === "OPEN" && !shift.guard_id
            ? "Unassigned Shift"
            : shift.status === "CLOSED"
            ? "Shift Closed"
            : "Shift Created";

          await opsEventService.createOpEvent(
            {
              tenant_id: shift.tenant_id,
              site_id: null,
              type: "SHIFT",
              severity,
              title,
              summary: `Shift ${shift.shift_date} ${shift.shift_start}-${shift.shift_end} at ${shift.location || "Location TBD"}`,
              entity_refs: {
                shift_id: shift.id,
                guard_id: shift.guard_id || null,
              },
              created_at: new Date(shift.created_at || shift.shift_date),
            },
            models,
            false // Don't tag with AI for historical data
          );
        }
        processed++;
      } catch (error) {
        console.error(`❌ Error processing shift ${shift.id}:`, error.message);
        errors++;
      }
    }

    return {
      processed,
      skipped,
      errors,
      total: shifts.length,
      dryRun: options.dryRun || false,
    };
  } catch (error) {
    console.error("❌ Error processing historical shifts:", error);
    throw error;
  }
}

/**
 * Process all historical data
 * @param {String} tenantId - Tenant ID (optional)
 * @param {Object} models - Sequelize models
 * @param {Object} options - Processing options
 * @returns {Promise<Object>} Combined processing results
 */
async function processAllHistoricalData(tenantId, models, options = {}) {
  const results = {
    incidents: { processed: 0, skipped: 0, errors: 0 },
    callouts: { processed: 0, skipped: 0, errors: 0 },
    shifts: { processed: 0, skipped: 0, errors: 0 },
    total: { processed: 0, skipped: 0, errors: 0 },
  };

  try {
    // Process incidents
    results.incidents = await processHistoricalIncidents(tenantId, models, options);
    
    // Process callouts
    results.callouts = await processHistoricalCallouts(tenantId, models, options);
    
    // Process shifts
    results.shifts = await processHistoricalShifts(tenantId, models, options);

    // Calculate totals
    results.total.processed =
      results.incidents.processed + results.callouts.processed + results.shifts.processed;
    results.total.skipped =
      results.incidents.skipped + results.callouts.skipped + results.shifts.skipped;
    results.total.errors =
      results.incidents.errors + results.callouts.errors + results.shifts.errors;

    return results;
  } catch (error) {
    console.error("❌ Error processing historical data:", error);
    throw error;
  }
}

module.exports = {
  processHistoricalIncidents,
  processHistoricalCallouts,
  processHistoricalShifts,
  processAllHistoricalData,
};
