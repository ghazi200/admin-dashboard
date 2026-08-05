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
    if (!tenantId) {
      console.warn("⚠️ getSiteHealthOverview called without tenantId");
      return [];
    }

    if (!models || !models.Shift) {
      console.error("❌ Models not available in getSiteHealthOverview");
      return [];
    }

    const { Shift, OpEvent, Site, Incident, sequelize } = models;
    const days = options.days || 30;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    const startDateStr = startDate.toISOString().split("T")[0];

    // Prefer real sites for this tenant (show even with zero recent activity)
    let sites = [];
    try {
      if (Site) {
        sites = await Site.findAll({
          where: { tenant_id: tenantId },
          order: [["name", "ASC"]],
          raw: true,
        });
      }
    } catch (err) {
      console.warn("⚠️ Site.findAll failed:", err.message);
    }

    const discoveredIds = new Set();
    if (Incident) {
      try {
        const incidentSites = await Incident.findAll({
          where: {
            tenantId: tenantId,
            siteId: { [Op.ne]: null },
            reportedAt: { [Op.gte]: startDate },
          },
          attributes: ["siteId"],
          group: ["siteId"],
          raw: true,
        });
        incidentSites.forEach((s) => {
          const id = s.siteId || s.site_id;
          if (id) discoveredIds.add(String(id));
        });
      } catch (err) {
        console.warn("⚠️ Incident site discovery failed:", err.message);
      }
    }

    if (OpEvent) {
      try {
        const eventSites = await OpEvent.findAll({
          where: {
            tenant_id: tenantId,
            site_id: { [Op.ne]: null },
            created_at: { [Op.gte]: startDate },
          },
          attributes: ["site_id"],
          group: ["site_id"],
          raw: true,
        });
        eventSites.forEach((s) => {
          if (s.site_id) discoveredIds.add(String(s.site_id));
        });
      } catch (err) {
        console.warn("⚠️ OpEvent site discovery failed:", err.message);
      }
    }

    const knownIds = new Set(sites.map((s) => String(s.id)));
    for (const id of discoveredIds) {
      if (!knownIds.has(id)) {
        sites.push({
          id,
          name: `Site ${id.substring(0, 8)}`,
          address_1: null,
        });
      }
    }

    // Fallback: distinct shift locations if sites table empty
    if (sites.length === 0 && sequelize) {
      try {
        const [locRows] = await sequelize.query(
          `SELECT DISTINCT location AS name
           FROM shifts
           WHERE tenant_id::text = $1::text
             AND location IS NOT NULL
             AND TRIM(location) <> ''
           ORDER BY name
           LIMIT 50`,
          { bind: [String(tenantId)] }
        );
        sites = (locRows || []).map((r, idx) => ({
          id: `loc-${idx}-${String(r.name).slice(0, 24)}`,
          name: r.name,
          address_1: null,
          _isLocationOnly: true,
        }));
      } catch (err) {
        console.warn("⚠️ Shift location fallback failed:", err.message);
      }
    }

    if (sites.length === 0) {
      console.log(`ℹ️ No sites found for tenant ${tenantId}`);
      return [];
    }

    const siteHealthData = await Promise.all(
      sites.map(async (site) => {
        const siteId = site.id;
        const siteName = site.name || "";

        let incidents = 0;
        if (Incident && !site._isLocationOnly) {
          try {
            incidents = await Incident.count({
              where: {
                tenantId: tenantId,
                siteId: siteId,
                reportedAt: { [Op.gte]: startDate },
              },
            });
          } catch (_) {}
        }

        let openShifts = 0;
        try {
          if (sequelize && siteName) {
            const [rows] = await sequelize.query(
              `SELECT COUNT(*)::int AS count
               FROM shifts
               WHERE tenant_id::text = $1::text
                 AND status = 'OPEN'
                 AND shift_date >= $2
                 AND (location ILIKE $3 OR location ILIKE $4)`,
              {
                bind: [String(tenantId), startDateStr, siteName, `%${siteName}%`],
              }
            );
            openShifts = rows[0]?.count || 0;
          } else {
            openShifts = await Shift.count({
              where: {
                tenant_id: tenantId,
                status: "OPEN",
                shift_date: { [Op.gte]: startDateStr },
              },
            });
          }
        } catch (err) {
          console.warn(`⚠️ Error counting open shifts for site ${siteId}:`, err.message);
        }

        let recentEvents = 0;
        if (OpEvent && !site._isLocationOnly) {
          try {
            recentEvents = await OpEvent.count({
              where: {
                tenant_id: tenantId,
                site_id: siteId,
                created_at: { [Op.gte]: startDate },
              },
            });
          } catch (err) {
            console.warn(`⚠️ Error counting events for site ${siteId}:`, err.message);
          }
        }

        let siteRisk = { riskScore: 0, riskLevel: "LOW", factors: {} };
        if (!site._isLocationOnly) {
          try {
            siteRisk = await riskScoringService.calculateSiteRisk(siteId, models, { days });
          } catch (err) {
            console.warn(`⚠️ Error calculating site risk for ${siteId}:`, err.message);
          }
        }

        let healthScore = 100;
        healthScore -= Math.min(incidents * 5, 50);
        healthScore -= Math.min(openShifts * 10, 30);
        healthScore -= Math.min((siteRisk.riskScore || 0) / 5, 20);
        healthScore = Math.max(healthScore, 0);

        let healthStatus = "HEALTHY";
        if (healthScore >= 80) healthStatus = "HEALTHY";
        else if (healthScore >= 60) healthStatus = "WARNING";
        else if (healthScore >= 40) healthStatus = "CAUTION";
        else healthStatus = "CRITICAL";

        const address =
          [site.address_1, site.address_2].filter(Boolean).join(", ") ||
          site.address ||
          "Address not available";

        return {
          site: {
            id: site.id,
            name: siteName || `Site ${String(site.id).substring(0, 8)}`,
            address,
          },
          metrics: {
            healthScore: Math.round(healthScore),
            healthStatus,
            incidents,
            openShifts,
            recentEvents,
          },
          risk: siteRisk,
          trends: {
            incidents7d: 0,
            incidents30d: incidents,
          },
        };
      })
    );

    siteHealthData.sort((a, b) => a.metrics.healthScore - b.metrics.healthScore);
    return siteHealthData;
  } catch (error) {
    console.error("❌ Error getting site health overview:", error);
    console.warn("⚠️ Returning empty array due to error:", error.message);
    return [];
  }
}

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
