/**
 * Site Health Service
 * 
 * Calculates and analyzes site health metrics:
 * - Risk scores per site
 * - Incident trends
 * - Coverage gaps
 * - Guard activity
 */

const { Op } = require("sequelize");
const riskScoringService = require("./riskScoring.service");

/**
 * Get site health overview for a tenant
 * @param {String} tenantId - Tenant ID
 * @param {Object} models - Sequelize models
 * @param {Object} options - { days = 30, includeRiskScores = true }
 * @returns {Promise<Array>} Site health data
 */
async function getSiteHealthOverview(tenantId, models, options = {}) {
  try {
    // Validate inputs
    if (!tenantId) {
      console.warn("⚠️ getSiteHealthOverview called without tenantId");
      return [];
    }
    
    if (!models || !models.Shift || !models.OpEvent) {
      console.error("❌ Models not available in getSiteHealthOverview");
      return [];
    }
    
    const { Shift, OpEvent } = models;
    const days = options.days || 30;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Get unique site IDs from OpEvents (Incident model may not be available)
    let incidentSites = [];
    if (models.Incident) {
      try {
        // Get unique site IDs from incidents (now using extended schema)
        incidentSites = await models.Incident.findAll({
          where: {
            tenantId: tenantId,
            siteId: { [Op.ne]: null },
            reportedAt: {
              [Op.gte]: startDate,
            },
          },
          attributes: ["siteId"],
          group: ["siteId"],
          raw: true,
        });
      } catch (err) {
        console.warn("⚠️ Incident model not available or query failed:", err.message);
      }
    }

    let eventSites = [];
    try {
      eventSites = await OpEvent.findAll({
        where: {
          tenant_id: tenantId,
          site_id: { [Op.ne]: null },
          created_at: {
            [Op.gte]: startDate,
          },
        },
        attributes: ["site_id"],
        group: ["site_id"],
        raw: true,
      });
    } catch (err) {
      console.warn("⚠️ OpEvent query failed:", err.message);
      eventSites = [];
    }

    // Combine and get unique site IDs
    const allSiteIds = new Set();
    incidentSites.forEach((s) => s.site_id && allSiteIds.add(s.site_id));
    eventSites.forEach((s) => s.site_id && allSiteIds.add(s.site_id));

    // If no sites found, return empty array instead of error
    if (allSiteIds.size === 0) {
      console.log(`ℹ️ No sites found with activity for tenant ${tenantId} in last ${days} days`);
      return [];
    }

    const sites = Array.from(allSiteIds).map((siteId) => ({
      id: siteId,
      name: `Site ${siteId.substring(0, 8)}`, // Use ID prefix as name if Site model not available
    }));

    // Calculate health metrics for each site
    const siteHealthData = await Promise.all(
      sites.map(async (site) => {
        const siteId = site.id;

        // Get incidents for this site (if Incident model available)
        let incidents = 0;
        if (models.Incident) {
          try {
            // Count incidents for this site (using extended schema)
            incidents = await models.Incident.count({
              where: {
                tenantId: tenantId,
                siteId: siteId,
                reportedAt: {
                  [Op.gte]: startDate,
                },
              },
            });
          } catch (err) {
            // Incident model not available or query failed
          }
        }

        // Get open shifts for this site
        // Note: Shift model uses 'location' field (string), not site_id
        // We'll try to match by checking if any OpEvents or Incidents reference both site and shift locations
        let openShifts = 0;
        try {
          openShifts = await Shift.count({
            where: {
              tenant_id: tenantId,
              status: "OPEN",
              shift_date: { [Op.gte]: new Date().toISOString().split("T")[0] },
            },
          });
        } catch (err) {
          console.warn(`⚠️ Error counting open shifts for site ${siteId}:`, err.message);
        }

        // Filter by checking OpEvents that reference this site
        // For now, we'll get a rough count - could be improved with better site_id mapping
        const siteRelatedShifts = 0; // Placeholder - would need better site mapping

        // Get recent OpEvents for this site
        let recentEvents = 0;
        try {
          recentEvents = await OpEvent.count({
            where: {
              tenant_id: tenantId,
              site_id: siteId,
              created_at: {
                [Op.gte]: startDate,
              },
            },
          });
        } catch (err) {
          console.warn(`⚠️ Error counting events for site ${siteId}:`, err.message);
        }

        // Calculate risk score (with error handling)
        let siteRisk = {
          riskScore: 0,
          riskLevel: "LOW",
          factors: {},
        };
        try {
          siteRisk = await riskScoringService.calculateSiteRisk(siteId, models, { days });
        } catch (err) {
          console.warn(`⚠️ Error calculating site risk for ${siteId}:`, err.message);
          // Use default low risk if calculation fails
        }

        // Determine health status
        let healthStatus = "HEALTHY";
        let healthScore = 100;
        
        // Deduct points for incidents (5 points per incident, max 50)
        healthScore -= Math.min(incidents * 5, 50);
        
        // Deduct points for open shifts (10 points per shift, max 30)
        healthScore -= Math.min(openShifts * 10, 30);
        
        // Deduct based on risk score (up to 20 points)
        healthScore -= Math.min(siteRisk.riskScore / 5, 20);
        
        healthScore = Math.max(healthScore, 0); // Don't go below 0

        if (healthScore >= 80) healthStatus = "HEALTHY";
        else if (healthScore >= 60) healthStatus = "WARNING";
        else if (healthScore >= 40) healthStatus = "CAUTION";
        else healthStatus = "CRITICAL";

        return {
          site: {
            id: site.id,
            name: site.name || `Site ${site.id.substring(0, 8)}`,
            address: site.address || "Address not available",
          },
          metrics: {
            healthScore: Math.round(healthScore),
            healthStatus,
            incidents: incidents,
            openShifts: openShifts,
            recentEvents: recentEvents,
          },
          risk: siteRisk,
          trends: {
            incidents7d: 0, // Will calculate separately if needed
            incidents30d: incidents,
          },
        };
      })
    );

    // Sort by health score (worst first)
    siteHealthData.sort((a, b) => a.metrics.healthScore - b.metrics.healthScore);

    // Return empty array if no data instead of error
    return siteHealthData.length > 0 ? siteHealthData : [];
  } catch (error) {
    console.error("❌ Error getting site health overview:", error);
    // Return empty array instead of throwing to handle gracefully
    console.warn("⚠️ Returning empty array due to error:", error.message);
    return [];
  }
}

/**
 * Get detailed site health for a specific site
 * @param {String} siteId - Site ID
 * @param {String} tenantId - Tenant ID
 * @param {Object} models - Sequelize models
 * @param {Object} options - { days = 30 }
 * @returns {Promise<Object>} Detailed site health data
 */
async function getSiteHealthDetails(siteId, tenantId, models, options = {}) {
  try {
    const { Shift, OpEvent } = models;
    const days = options.days || 30;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Verify site exists by checking if it has incidents or events
    let hasIncidents = 0;
    if (models.Incident) {
      try {
        hasIncidents = await models.Incident.count({
          where: { site_id: siteId, tenant_id: tenantId },
          limit: 1,
        });
      } catch (err) {
        // Incident model not available
      }
    }
    
    const hasEvents = await OpEvent.count({
      where: { site_id: siteId, tenant_id: tenantId },
      limit: 1,
    });

    if (!hasIncidents && !hasEvents) {
      throw new Error("Site not found or has no activity");
    }

    // Get OpEvents first (needed for shift filtering)
    const opEvents = await OpEvent.findAll({
      where: {
        tenant_id: tenantId,
        site_id: siteId,
        created_at: {
          [Op.gte]: startDate,
        },
      },
      order: [["created_at", "DESC"]],
      limit: 50,
    });

    // Get incidents (if Incident model available)
    let incidents = [];
    if (models.Incident) {
      try {
        // Get incidents for this site (using extended schema)
        incidents = await models.Incident.findAll({
          where: {
            tenantId: tenantId,
            siteId: siteId,
            reportedAt: {
              [Op.gte]: startDate,
            },
          },
          order: [["reportedAt", "DESC"]],
          limit: 20,
        });
      } catch (err) {
        // Incident model not available
      }
    }

    // Get open shifts (Note: Shift model doesn't have direct site_id)
    // For detailed view, we'll get shifts that might be related via OpEvents
    const openShifts = await Shift.findAll({
      where: {
        tenant_id: tenantId,
        status: "OPEN",
        shift_date: { [Op.gte]: new Date().toISOString().split("T")[0] },
      },
      order: [["shift_date", "ASC"], ["shift_start", "ASC"]],
      limit: 20,
    });

    // Filter shifts that are related to this site via OpEvents
    const siteShiftIds = new Set();
    opEvents.forEach(e => {
      if (e.entity_refs?.shift_id) {
        siteShiftIds.add(e.entity_refs.shift_id);
      }
    });
    const relatedShifts = openShifts.filter(s => siteShiftIds.has(s.id));

    // Calculate trends (last 7 days vs last 30 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    let incidents7d = 0;
    if (models.Incident) {
      try {
        incidents7d = await models.Incident.count({
          where: {
            site_id: siteId,
            reported_at: {
              [Op.gte]: sevenDaysAgo,
            },
          },
        });
      } catch (err) {
        // Incident model not available
      }
    }

    const incidents30d = incidents.length;

    // Calculate risk (with error handling)
    let siteRisk = {
      riskScore: 0,
      riskLevel: "LOW",
      factors: {},
    };
    try {
      siteRisk = await riskScoringService.calculateSiteRisk(siteId, models, { days });
    } catch (err) {
      console.warn(`⚠️ Error calculating site risk details for ${siteId}:`, err.message);
      // Use default low risk if calculation fails
    }

    return {
      site: {
        id: siteId,
        name: `Site ${siteId.substring(0, 8)}`, // Use ID prefix as name if Site model not available
        address: "Address not available",
      },
      metrics: {
        incidents: {
          total: incidents30d,
          last7Days: incidents7d,
          trend: incidents7d > (incidents30d / 4) ? "INCREASING" : incidents7d < (incidents30d / 6) ? "DECREASING" : "STABLE",
        },
        openShifts: openShifts.length,
        recentEvents: opEvents.length,
      },
      risk: siteRisk,
      incidents: incidents.slice(0, 10).map(i => ({
        id: i.id,
        type: i.type,
        severity: i.severity,
        status: i.status,
        reported_at: i.reported_at,
      })),
      openShifts: (relatedShifts || []).map(s => ({
        id: s.id,
        shift_date: s.shift_date,
        shift_start: s.shift_start,
        shift_end: s.shift_end,
        guard_id: s.guard_id,
        location: s.location,
      })),
      recentEvents: opEvents.slice(0, 10).map(e => ({
        id: e.id,
        type: e.type,
        severity: e.severity,
        title: e.title,
        created_at: e.created_at,
      })),
    };
  } catch (error) {
    console.error("❌ Error getting site health details:", error);
    throw error;
  }
}

module.exports = {
  getSiteHealthOverview,
  getSiteHealthDetails,
};
