/**
 * AI AGENT 24 Service
 * 
 * Processes chat messages and can:
 * - Answer questions about guards, shifts, locations
 * - Execute tasks (create shifts, assign guards, generate reports)
 * - Integrate with Command Center AI
 * - Provide context-aware responses
 */

const { Op } = require("sequelize");
const commandCenterAI = require("./commandCenterAI.service");
const calloutRiskService = require("./calloutRiskPrediction.service");
const operationalDataRag = require("./operationalDataRag.service");
const guardReportService = require("./guardReport.service");
const globalSearchService = require("./globalSearch.service");
const clockReportService = require("./clockReport.service");

/**
 * Process a chat message and return response
 * @param {Object} context - Chat context (message, history, adminId, adminRole, permissions)
 * @param {Object} models - Sequelize models
 * @param {Object} app - Express app instance
 * @returns {Promise<Object>} Response with answer, citations, actions, data
 */
async function processChatMessage(context, models, app) {
  const { message, history, adminId, adminRole, permissions } = context;
  const { sequelize } = models;

  // Normalize message to lowercase for intent detection
  const messageLower = message.toLowerCase();

  // Detect intent and route to appropriate handler
  if (isQuestion(messageLower)) {
    return await handleQuestion(message, context, models, app);
  } else if (isTaskExecution(messageLower)) {
    return await handleTaskExecution(message, context, models, app);
  } else {
    // Default: try to answer as a question
    return await handleQuestion(message, context, models, app);
  }
}

/**
 * Check if message is a question
 */
function isQuestion(message) {
  const questionWords = ["what", "who", "when", "where", "why", "how", "show", "list", "find", "tell"];
  return questionWords.some(word => message.startsWith(word) || message.includes(` ${word} `));
}

/**
 * Check if message is a task execution request
 */
function isTaskExecution(message) {
  const taskWords = ["create", "assign", "generate", "make", "set", "update", "delete", "remove"];
  return taskWords.some(word => message.startsWith(word) || message.includes(` ${word} `));
}

/**
 * Handle question/query
 */
async function handleQuestion(message, context, models, app) {
  const { sequelize } = models;
  const messageLower = message.toLowerCase();
  let response = "";
  let citations = [];
  let data = null;

  try {
    // Route to specific handlers based on keywords (clock report before guard report so "clock report for location A" is not treated as guard report)
    if (isClockReportRequest(messageLower)) {
      return await handleClockReportQuery(message, context, models, app);
    } else if (isGuardReportRequest(messageLower)) {
      return await handleGuardReportQuery(message, context, models);
    } else if (isSearchIntent(messageLower)) {
      return await handleGlobalSearchQuery(message, context, models);
    } else if (messageLower.includes("high-risk") || messageLower.includes("high risk") || messageLower.includes("callout risk")) {
      return await handleCalloutRiskQuery(message, context, models);
    } else if (messageLower.includes("unfilled") || messageLower.includes("no guard") || messageLower.includes("unassigned")) {
      return await handleUnfilledShiftsQuery(message, context, models);
    } else if (messageLower.includes("reliable") || messageLower.includes("reliability") || messageLower.includes("performance")) {
      return await handleGuardPerformanceQuery(message, context, models);
    } else if (messageLower.includes("callout") || messageLower.includes("call out")) {
      return await handleCalloutQuery(message, context, models);
    } else if (messageLower.includes("incident")) {
      return await handleIncidentQuery(message, context, models);
    } else if (messageLower.includes("shift") && (messageLower.includes("today") || messageLower.includes("tomorrow") || messageLower.includes("week"))) {
      return await handleShiftScheduleQuery(message, context, models);
    } else {
      // Generic query - use operational data RAG
      return await handleGenericQuery(message, context, models, app);
    }
  } catch (error) {
    console.error("Error handling question:", error);
    return {
      response: `I encountered an error while processing your question: ${error.message}. Please try rephrasing your question or contact support.`,
      citations: [],
      actions: [],
      data: null,
      confidence: 0,
    };
  }
}

/**
 * Detect request for full report on a guard (e.g. "full report on guard bob from tenant abe")
 */
function isGuardReportRequest(messageLower) {
  if (!messageLower.includes("report")) return false;
  return (
    messageLower.includes("guard") ||
    /\breport\b.*\b(on|about|for)\b/.test(messageLower)
  );
}

/**
 * Detect request for clock in/out report (e.g. "give me the full clock in and out report for location A")
 */
function isClockReportRequest(messageLower) {
  const hasClock = messageLower.includes("clock") || messageLower.includes("punch") || messageLower.includes("time clock");
  const hasReport = messageLower.includes("report") || messageLower.includes("for location") || messageLower.includes("location");
  const hasInOut = messageLower.includes("clock in") || messageLower.includes("clock out") || messageLower.includes("clock-in") || messageLower.includes("clock-out");
  return hasClock && (hasReport || hasInOut);
}

/**
 * Detect global / advanced search intent (UPGRADE_OPTIONS #31)
 */
function isSearchIntent(messageLower) {
  const searchPhrases = [
    "search for", "search ", "find ", "look up", "look for", "show me all",
    "show all ", "global search", "find all", "who is ", "where is ",
    "list guards named", "list shifts at", "list sites", "list incidents",
    "guards named", "shifts for", "sites called", "incidents about",
  ];
  if (messageLower.length < 3) return false;
  return searchPhrases.some((p) => messageLower.includes(p)) ||
    /^(search|find|look up|show)\s+/i.test(messageLower.trim());
}

/**
 * Parse search query from message: extract free-text query and optional entity type hint.
 * @returns {{ query: string, entityTypes: string[] | null }}
 */
function parseSearchMessage(message) {
  const t = message.trim();
  let query = t
    .replace(/^(search for|find|look up|look for|show me all|show all|global search|find all)\s*/i, "")
    .replace(/\s*\.\s*$/, "")
    .trim();
  const lower = query.toLowerCase();
  let entityTypes = null;
  if (/\b(guard|guards)\b/.test(lower)) entityTypes = ["guard"];
  else if (/\b(shift|shifts)\b/.test(lower)) entityTypes = ["shift"];
  else if (/\b(site|sites)\b/.test(lower)) entityTypes = ["site"];
  else if (/\b(incident|incidents)\b/.test(lower)) entityTypes = ["incident"];
  else if (/\b(tenant|tenants)\b/.test(lower)) entityTypes = ["tenant"];
  return { query: query || t, entityTypes };
}

/**
 * Handle global search via AI Agent 24 (Advanced Search & Filters #31)
 */
async function handleGlobalSearchQuery(message, context, models) {
  const { adminId, tenantId: adminTenantId } = context;
  const isSuperAdmin = context.adminRole === "super_admin";
  const { query: rawQuery, entityTypes } = parseSearchMessage(message);

  if (!rawQuery || rawQuery.length < 2) {
    return {
      response: "I can search across **guards**, **shifts**, **sites**, **incidents**, and (for super admins) **tenants**. Try:\n\n• \"Search for Bob\"\n• \"Find shifts at Downtown\"\n• \"Show me all guards named John\"\n• \"List incidents about theft\"",
      citations: [],
      actions: [],
      data: null,
      confidence: 0.5,
    };
  }

  try {
    const result = await globalSearchService.search(
      {
        query: rawQuery,
        tenantId: adminTenantId || null,
        isSuperAdmin,
        entityTypes: entityTypes || undefined,
      },
      models
    );

    if (adminId && rawQuery) globalSearchService.addSearchHistory(adminId, rawQuery, {});

    const results = result.results || [];
    if (results.length === 0) {
      return {
        response: `No results found for **"${rawQuery}"**. Try a different search or broaden your query. You can also use the **global search** bar (or ⌘K) to search with filters.`,
        citations: [],
        actions: [],
        data: { searchResults: [], query: rawQuery },
        confidence: 0.8,
      };
    }

    const byType = results.reduce((acc, r) => {
      acc[r.entityType] = (acc[r.entityType] || 0) + 1;
      return acc;
    }, {});
    const typeSummary = Object.entries(byType).map(([k, v]) => `${v} ${k}(s)`).join(", ");
    let response = `Found **${results.length}** result(s) for "${rawQuery}": ${typeSummary}\n\n`;
    results.slice(0, 8).forEach((r) => {
      response += `• **${r.entityType}:** ${r.title}${r.snippet ? ` — ${r.snippet}` : ""}\n`;
    });
    if (results.length > 8) response += `\n...and ${results.length - 8} more. Use the buttons below to open in the app.`;

    const actions = [];
    const seenHref = new Set();
    results.forEach((r) => {
      if (seenHref.has(r.href)) return;
      seenHref.add(r.href);
      actions.push({
        type: "open_in",
        label: `Open ${r.entityType}s`,
        href: r.href,
        entityType: r.entityType,
        query: rawQuery,
      });
    });

    return {
      response,
      citations: [],
      actions,
      data: { searchResults: results, query: rawQuery, totalByType: result.totalByType },
      confidence: 0.9,
    };
  } catch (err) {
    console.error("handleGlobalSearchQuery error:", err);
    return {
      response: `Search failed: ${err.message}. Please try again or use the global search bar.`,
      citations: [],
      actions: [],
      data: null,
      confidence: 0.3,
    };
  }
}

/**
 * Parse guard name and optional tenant name from message.
 * @returns {{ guardName: string | null, tenantName: string | null }}
 */
function parseGuardReportRequest(message) {
  const lower = message.toLowerCase().trim();
  let guardName = null;
  let tenantName = null;
  // "tenant abe" or "from tenant abe"
  const tenantMatch = lower.match(/(?:from\s+)?tenant\s+(\w+)/);
  if (tenantMatch) tenantName = tenantMatch[1].trim();
  // "guard bob" or "on guard bob" or "report on bob"
  const guardMatch = lower.match(/(?:guard\s+)(\w+)/) || lower.match(/\breport\s+(?:on|about|for)\s+(\w+)/);
  if (guardMatch) guardName = guardMatch[1].trim();
  return { guardName, tenantName };
}

/**
 * Handle full report on a guard (Option B + C: summary + Download PDF action).
 */
async function handleGuardReportQuery(message, context, models) {
  const { adminId, tenantId: adminTenantId } = context;
  const { Guard, Tenant } = models;
  const { guardName, tenantName } = parseGuardReportRequest(message);

  if (!guardName) {
    return {
      response: "I can generate a full report on a guard. Please specify the guard name, for example:\n\n• \"Full report on guard Bob\"\n• \"Give me a report on guard Bob from tenant Abe\"",
      citations: [],
      actions: [],
      data: null,
      confidence: 0.5,
    };
  }

  try {
    let scopeTenantId = adminTenantId;
    if (tenantName && Tenant) {
      const tenant = await Tenant.findOne({
        where: { name: { [Op.iLike]: `%${tenantName}%` } },
        attributes: ["id"],
      });
      if (tenant) scopeTenantId = tenant.id;
      else if (adminTenantId) {
        scopeTenantId = adminTenantId;
      }
    }

    const guard = await Guard.findOne({
      where: {
        name: { [Op.iLike]: `%${guardName}%` },
        ...(scopeTenantId ? { tenant_id: scopeTenantId } : {}),
      },
      attributes: ["id", "name", "email", "tenant_id"],
    });

    if (!guard) {
      return {
        response: `I couldn't find a guard matching "${guardName}"${scopeTenantId ? " in that tenant." : "."} Please check the name or tenant.`,
        citations: [],
        actions: [],
        data: null,
        confidence: 0.6,
      };
    }

    const reportData = await guardReportService.getGuardReportData(guard.id, guard.tenant_id || scopeTenantId, models);
    if (!reportData) {
      return {
        response: "I found the guard but couldn't load the report data. Please try again.",
        citations: [],
        actions: [],
        data: null,
        confidence: 0.5,
      };
    }

    const guardDisplay = reportData.guard.name || "Guard";
    const tenantDisplay = reportData.tenant?.name || "—";
    let response = `📋 **Full report: ${guardDisplay}** (${tenantDisplay})\n\n`;
    response += `**Profile:** ${reportData.guard.email || "—"}${reportData.guard.phone ? ` | ${reportData.guard.phone}` : ""}\n`;
    response += `**Pay rate:** ${reportData.guard.pay_rate != null && reportData.guard.pay_rate !== "" ? reportData.guard.pay_rate : "—"}\n`;
    if (reportData.overtimeHoursTotal != null && reportData.overtimeHoursTotal > 0) response += `**Overtime hours (last 30 days):** ${reportData.overtimeHoursTotal}\n`;
    if (reportData.weeklyShiftDays && reportData.weeklyShiftDays.length > 0) {
      const lines = reportData.weeklyShiftDays.map((w) => (w.off ? `${w.day}: off` : `${w.day}: ${w.timeLabel || w.start + "–" + w.end}`));
      response += `**Weekly schedule:** ${lines.join("; ")}\n`;
    }
    response += `**Upcoming shifts (30 days):** ${reportData.schedule && reportData.schedule.length > 0 ? `${reportData.schedule.length} shift(s)` : "None."}\n`;
    if (reportData.guard.reliability_score != null || reportData.guard.acceptance_rate != null) {
      response += `**Rating:** ${reportData.guard.reliability_score != null ? `Reliability ${reportData.guard.reliability_score}` : ""}${reportData.guard.reliability_score != null && reportData.guard.acceptance_rate != null ? " | " : ""}${reportData.guard.acceptance_rate != null ? `Acceptance ${reportData.guard.acceptance_rate}` : ""}\n`;
    }
    if (reportData.guard.created_at) {
      const start = new Date(reportData.guard.created_at);
      const months = Math.max(0, Math.floor((Date.now() - start) / (30.44 * 24 * 60 * 60 * 1000)));
      const years = Math.floor(months / 12);
      const tenure = years >= 1 ? `${years}y ${months % 12}mo` : `${months}mo`;
      response += `**Time with company:** ${tenure} (since ${start.toLocaleDateString()})\n`;
    }
    if (reportData.locations && reportData.locations.length > 0) {
      response += `**Locations worked:** ${reportData.locations.slice(0, 5).join(", ")}${reportData.locations.length > 5 ? ` (+${reportData.locations.length - 5} more)` : ""}\n`;
    }
    if (reportData.lateClockIns && reportData.lateClockIns.length > 0) {
      response += `**Late clock-ins:** ${reportData.lateClockIns.length} (running late)\n`;
    }
    response += `**Shifts (last 30 days):** ${reportData.shifts.length}\n`;
    response += `**Incidents:** ${reportData.incidents.length}\n`;
    response += `**Callouts:** ${reportData.callouts.length}\n\n`;
    response += `You can download this report as a PDF using the button below.`;

    return {
      response,
      citations: [],
      actions: [
        {
          type: "download_report_pdf",
          label: "Download as PDF",
          guardId: guard.id,
          tenantId: guard.tenant_id || scopeTenantId,
        },
      ],
      data: { guardId: guard.id, guardName: guardDisplay, tenantId: reportData.tenant?.id },
      confidence: 0.9,
    };
  } catch (err) {
    console.error("handleGuardReportQuery error:", err);
    return {
      response: `I couldn't generate the report: ${err.message}. Please try again or specify guard and tenant.`,
      citations: [],
      actions: [],
      data: null,
      confidence: 0.3,
    };
  }
}

/**
 * Parse location from message (e.g. "report for location A" -> "A", "location North" -> "North")
 */
function parseClockReportLocation(message) {
  const lower = message.toLowerCase();
  const forLocationMatch = lower.match(/(?:for\s+)?location\s+([a-z0-9\s\-]+?)(?:\s+please|\s*$|\.|,)/i);
  if (forLocationMatch) return forLocationMatch[1].trim();
  const atMatch = lower.match(/(?:at|@)\s+([a-z0-9\s\-]+?)(?:\s+please|\s*$|\.|,)/i);
  if (atMatch) return atMatch[1].trim();
  return null;
}

/**
 * Handle clock in/out report request (e.g. "give me the full clock in and out report for location A")
 */
async function handleClockReportQuery(message, context, models, app) {
  const tenantId = context.tenantId || context.tenant_id;
  if (!tenantId) {
    return {
      response: "I need your tenant context to generate the clock report. Please ensure you're signed in as an admin or supervisor.",
      citations: [],
      actions: [],
      data: null,
      confidence: 0.3,
    };
  }

  const location = parseClockReportLocation(message);

  try {
    const report = await clockReportService.buildClockReport(
      { tenantId, location: location || undefined },
      models
    );

    if (report.error) {
      return {
        response: report.error,
        citations: [],
        actions: [],
        data: null,
        confidence: 0.5,
      };
    }

    let response = `📋 **Clock In/Out Report**`;
    if (location) response += ` for **${location}**`;
    response += `\n**Week:** ${report.weekStart} to ${report.weekEnd}\n\n`;

    if (report.locations.length === 0) {
      response += "No shifts or time entries found for this period.";
      return {
        response,
        citations: [],
        actions: [],
        data: report,
        confidence: 0.8,
      };
    }

    for (const loc of report.locations) {
      response += `**📍 ${loc.location}**\n`;
      response += `_${loc.summary}_\n\n`;

      if (loc.narratives.length > 0) {
        response += "**Correctly clocked:**\n";
        loc.narratives.slice(0, 20).forEach((n) => {
          response += `• ${n.text}\n`;
        });
        if (loc.narratives.length > 20) response += `_...and ${loc.narratives.length - 20} more._\n`;
        response += "\n";
      }

      if (loc.flags.length > 0) {
        response += "**⚠️ Flags:**\n";
        loc.flags.forEach((f) => {
          response += `• ${f.message}\n`;
        });
        response += "\n";
      }

      if (loc.otNotes.length > 0) {
        response += "**🕐 Overtime noted:**\n";
        loc.otNotes.forEach((o) => {
          response += `• ${o.message}\n`;
        });
        response += "\n";
      }
    }

    response += "**Summary:** " + report.summary + "\n\n";
    if (report.suggestions && report.suggestions.length > 0) {
      response += "**Suggestions:**\n";
      report.suggestions.forEach((s) => {
        response += `• ${s}\n`;
      });
    }

    return {
      response,
      citations: [],
      actions: [],
      data: report,
      confidence: 0.9,
    };
  } catch (err) {
    console.error("handleClockReportQuery error:", err);
    return {
      response: `I couldn't generate the clock report: ${err.message}. Please try again.`,
      citations: [],
      actions: [],
      data: null,
      confidence: 0.3,
    };
  }
}

/**
 * Handle callout risk queries
 */
async function handleCalloutRiskQuery(message, context, models) {
  const { sequelize } = models;
  
  // Get upcoming high-risk shifts
  const risks = await calloutRiskService.batchCalculateRisks(models, 7);
  const highRiskShifts = risks.filter(item => item.risk.recommendation === 'HIGH_RISK');
  
  if (highRiskShifts.length === 0) {
    return {
      response: "✅ No high-risk shifts found in the next 7 days. All shifts appear to have low callout risk.",
      citations: [],
      actions: [],
      data: { highRiskCount: 0 },
      confidence: 0.9,
    };
  }

  const shiftList = highRiskShifts.slice(0, 5).map(item => {
    const guardName = item.risk.guardName || "Unknown Guard";
    const location = item.shift.location || "Unknown Location";
    const date = new Date(item.shift.shift_date).toLocaleDateString();
    const riskScore = Math.round(item.risk.score);
    return `• ${guardName} - ${location} on ${date} (${riskScore}% risk)`;
  }).join("\n");

  return {
    response: `🚨 Found ${highRiskShifts.length} high-risk shift(s) in the next 7 days:\n\n${shiftList}\n\n${highRiskShifts.length > 5 ? `...and ${highRiskShifts.length - 5} more.` : ""}\n\nWould you like me to suggest backup guards for any of these shifts?`,
    citations: [],
    actions: [],
    data: {
      highRiskCount: highRiskShifts.length,
      shifts: highRiskShifts.slice(0, 5).map(item => ({
        shiftId: item.shift.id,
        guardName: item.risk.guardName,
        location: item.shift.location,
        date: item.shift.shift_date,
        riskScore: Math.round(item.risk.score),
      })),
    },
    confidence: 0.9,
  };
}

/**
 * Handle unfilled shifts queries
 */
async function handleUnfilledShiftsQuery(message, context, models) {
  const { sequelize } = models;
  
  const [unfilledShifts] = await sequelize.query(`
    SELECT 
      s.id,
      s.shift_date,
      s.shift_start,
      s.shift_end,
      s.location,
      s.status
    FROM shifts s
    WHERE s.status = 'OPEN'
      AND s.guard_id IS NULL
      AND s.shift_date >= CURRENT_DATE
    ORDER BY s.shift_date ASC, s.shift_start ASC
    LIMIT 10
  `);

  if (unfilledShifts.length === 0) {
    return {
      response: "✅ All upcoming shifts are assigned! No unfilled shifts found.",
      citations: [],
      actions: [],
      data: { unfilledCount: 0 },
      confidence: 0.9,
    };
  }

  const shiftList = unfilledShifts.map(shift => {
    const date = new Date(shift.shift_date).toLocaleDateString();
    const location = shift.location || "Unknown Location";
    return `• ${date} ${shift.shift_start} - ${shift.shift_end} at ${location}`;
  }).join("\n");

  return {
    response: `⚠️ Found ${unfilledShifts.length} unfilled shift(s):\n\n${shiftList}\n\nWould you like me to suggest guards for any of these shifts?`,
    citations: [],
    actions: [],
    data: {
      unfilledCount: unfilledShifts.length,
      shifts: unfilledShifts,
    },
    confidence: 0.9,
  };
}

/**
 * Handle guard performance queries
 */
async function handleGuardPerformanceQuery(message, context, models) {
  const { sequelize } = models;
  
  // Get guards with callout history
  const [guardStats] = await sequelize.query(`
    SELECT 
      g.id,
      g.name,
      g.email,
      COUNT(c.id) as callout_count,
      COUNT(c.id) FILTER (WHERE c.created_at >= NOW() - INTERVAL '30 days') as callouts_30d
    FROM guards g
    LEFT JOIN callouts c ON c.guard_id = g.id
    GROUP BY g.id, g.name, g.email
    ORDER BY callouts_30d DESC, callout_count DESC
    LIMIT 10
  `);

  if (guardStats.length === 0) {
    return {
      response: "No guard performance data available.",
      citations: [],
      actions: [],
      data: null,
      confidence: 0.5,
    };
  }

  const reliableGuards = guardStats.filter(g => g.callouts_30d === 0).slice(0, 5);
  const unreliableGuards = guardStats.filter(g => g.callouts_30d > 0).slice(0, 5);

  let response = "";
  if (reliableGuards.length > 0) {
    response += `✅ Most Reliable Guards (no callouts in last 30 days):\n`;
    reliableGuards.forEach(g => {
      response += `• ${g.name || g.email} - ${g.callout_count || 0} total callouts\n`;
    });
    response += "\n";
  }

  if (unreliableGuards.length > 0) {
    response += `⚠️ Guards with Recent Callouts:\n`;
    unreliableGuards.forEach(g => {
      response += `• ${g.name || g.email} - ${g.callouts_30d} callouts in last 30 days\n`;
    });
  }

  return {
    response: response || "Guard performance data is available but no significant patterns found.",
    citations: [],
    actions: [],
    data: {
      reliableGuards: reliableGuards,
      unreliableGuards: unreliableGuards,
    },
    confidence: 0.8,
  };
}

/**
 * Handle callout queries
 */
async function handleCalloutQuery(message, context, models) {
  const { sequelize } = models;
  
  const [recentCallouts] = await sequelize.query(`
    SELECT 
      c.id,
      c.reason,
      c.created_at,
      s.shift_date,
      s.shift_start,
      s.location,
      g.name as guard_name,
      g.email as guard_email
    FROM callouts c
    LEFT JOIN shifts s ON s.id = c.shift_id
    LEFT JOIN guards g ON g.id = c.guard_id
    WHERE c.created_at >= NOW() - INTERVAL '7 days'
    ORDER BY c.created_at DESC
    LIMIT 10
  `);

  if (recentCallouts.length === 0) {
    return {
      response: "✅ No callouts in the last 7 days. Great job!",
      citations: [],
      actions: [],
      data: { calloutCount: 0 },
      confidence: 0.9,
    };
  }

  const calloutList = recentCallouts.map(c => {
    const guardName = c.guard_name || c.guard_email || "Unknown Guard";
    const date = new Date(c.created_at).toLocaleDateString();
    const location = c.location || "Unknown Location";
    return `• ${guardName} - ${date} at ${location} (${c.reason || "No reason"})`;
  }).join("\n");

  return {
    response: `📞 Recent Callouts (last 7 days):\n\n${calloutList}`,
    citations: [],
    actions: [],
    data: {
      calloutCount: recentCallouts.length,
      callouts: recentCallouts,
    },
    confidence: 0.9,
  };
}

/**
 * Handle incident queries
 */
async function handleIncidentQuery(message, context, models) {
  const { sequelize, Incident } = models;
  
  try {
    const recentIncidents = await Incident.findAll({
      where: {
        reportedAt: {
          [Op.gte]: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // Last 7 days
        },
      },
      order: [["reportedAt", "DESC"]],
      limit: 10,
    });

    if (recentIncidents.length === 0) {
      return {
        response: "✅ No incidents reported in the last 7 days.",
        citations: [],
        actions: [],
        data: { incidentCount: 0 },
        confidence: 0.9,
      };
    }

    const incidentList = recentIncidents.map(inc => {
      const date = inc.reportedAt ? new Date(inc.reportedAt).toLocaleDateString() : "Unknown date";
      return `• ${inc.type || "Incident"} - ${date}${inc.locationText ? ` at ${inc.locationText}` : ""}`;
    }).join("\n");

    return {
      response: `⚠️ Recent Incidents (last 7 days):\n\n${incidentList}`,
      citations: [],
      actions: [],
      data: {
        incidentCount: recentIncidents.length,
        incidents: recentIncidents.map(inc => inc.toJSON()),
      },
      confidence: 0.9,
    };
  } catch (error) {
    return {
      response: "I couldn't retrieve incident data. The incidents feature may not be fully configured.",
      citations: [],
      actions: [],
      data: null,
      confidence: 0.3,
    };
  }
}

/**
 * Handle shift schedule queries
 */
async function handleShiftScheduleQuery(message, context, models) {
  const { sequelize } = models;
  const messageLower = message.toLowerCase();
  
  let dateFilter = "CURRENT_DATE";
  let dateLabel = "today";
  
  if (messageLower.includes("tomorrow")) {
    dateFilter = "CURRENT_DATE + INTERVAL '1 day'";
    dateLabel = "tomorrow";
  } else if (messageLower.includes("week")) {
    dateFilter = "CURRENT_DATE + INTERVAL '7 days'";
    dateLabel = "this week";
  }

  const [shifts] = await sequelize.query(`
    SELECT 
      s.id,
      s.shift_date,
      s.shift_start,
      s.shift_end,
      s.location,
      s.status,
      g.name as guard_name,
      g.email as guard_email
    FROM shifts s
    LEFT JOIN guards g ON g.id = s.guard_id
    WHERE s.shift_date >= ${dateFilter === "CURRENT_DATE" ? "CURRENT_DATE" : dateFilter}
      AND s.shift_date < ${dateFilter === "CURRENT_DATE" ? "CURRENT_DATE + INTERVAL '1 day'" : dateFilter === "CURRENT_DATE + INTERVAL '1 day'" ? "CURRENT_DATE + INTERVAL '2 days'" : "CURRENT_DATE + INTERVAL '8 days'"}
    ORDER BY s.shift_date ASC, s.shift_start ASC
    LIMIT 20
  `);

  if (shifts.length === 0) {
    return {
      response: `No shifts found for ${dateLabel}.`,
      citations: [],
      actions: [],
      data: { shiftCount: 0 },
      confidence: 0.9,
    };
  }

  const assigned = shifts.filter(s => s.guard_name || s.guard_email);
  const unassigned = shifts.filter(s => !s.guard_name && !s.guard_email);

  let response = `📅 Shifts for ${dateLabel}:\n\n`;
  response += `✅ Assigned: ${assigned.length}\n`;
  response += `⚠️ Unassigned: ${unassigned.length}\n\n`;

  if (assigned.length > 0) {
    response += `Assigned Shifts:\n`;
    assigned.slice(0, 5).forEach(s => {
      const guardName = s.guard_name || s.guard_email || "Unknown";
      const date = new Date(s.shift_date).toLocaleDateString();
      response += `• ${guardName} - ${date} ${s.shift_start} - ${s.shift_end} at ${s.location || "Unknown"}\n`;
    });
    if (assigned.length > 5) response += `...and ${assigned.length - 5} more.\n`;
  }

  if (unassigned.length > 0) {
    response += `\nUnassigned Shifts:\n`;
    unassigned.slice(0, 5).forEach(s => {
      const date = new Date(s.shift_date).toLocaleDateString();
      response += `• ${date} ${s.shift_start} - ${s.shift_end} at ${s.location || "Unknown"}\n`;
    });
    if (unassigned.length > 5) response += `...and ${unassigned.length - 5} more.\n`;
  }

  return {
    response,
    citations: [],
    actions: [],
    data: {
      shiftCount: shifts.length,
      assignedCount: assigned.length,
      unassignedCount: unassigned.length,
      shifts: shifts.slice(0, 10),
    },
    confidence: 0.9,
  };
}

/**
 * Handle generic queries using operational data RAG
 */
async function handleGenericQuery(message, context, models, app) {
  try {
    // Check if OpEvent model exists before using RAG
    if (!models.OpEvent) {
      console.warn("⚠️ OpEvent model not available, skipping RAG query");
      return getFallbackResponse(message);
    }

    // Use operational data RAG for general questions
    // Note: queryOperationalData expects (question, tenantId, models, options)
    const ragResult = await operationalDataRag.queryOperationalData(
      message,
      null, // tenantId - can be null for general queries
      models,
      { limit: 5 }
    );

    if (ragResult && ragResult.answer) {
      return {
        response: ragResult.answer,
        citations: ragResult.sources || [],
        actions: [],
        data: ragResult.data || null,
        confidence: ragResult.confidence || 0.7,
      };
    }

    // Fallback response
    return getFallbackResponse(message);
  } catch (error) {
    console.error("Error in generic query:", error);
    return getFallbackResponse(message);
  }
}

/**
 * Get fallback response when RAG is unavailable
 */
function getFallbackResponse(message) {
  return {
    response: `I understand you're asking: "${message}"\n\nI can help you with:\n• High-risk shifts - "Show me high-risk shifts"\n• Unfilled shifts - "List unfilled shifts"\n• Guard performance - "Who is most reliable?"\n• Recent callouts - "Show me recent callouts"\n• Shift schedules - "Shifts for today/tomorrow"\n• Incident reports - "Recent incidents"\n\nTry asking one of these specific questions for the best results!`,
    citations: [],
    actions: [],
    data: null,
    confidence: 0.5,
  };
}

/**
 * Handle task execution requests
 */
async function handleTaskExecution(message, context, models, app) {
  const messageLower = message.toLowerCase();
  const actions = [];

  // For now, return a helpful message about task execution
  // This can be expanded to actually execute tasks
  if (messageLower.includes("create") && messageLower.includes("shift")) {
    return {
      response: "I can help you create shifts! To create a shift, please use the Shifts page or provide more details like:\n\n• Guard name\n• Date and time\n• Location\n\nExample: 'Create a shift for John tomorrow 8am-4pm at Site A'",
      citations: [],
      actions: [],
      data: null,
      confidence: 0.7,
    };
  } else if (messageLower.includes("assign") && messageLower.includes("guard")) {
    return {
      response: "I can help you assign guards to shifts! Please provide:\n\n• Guard name\n• Shift date and time\n• Location\n\nExample: 'Assign Sarah to the night shift on Friday at Site B'",
      citations: [],
      actions: [],
      data: null,
      confidence: 0.7,
    };
  } else {
    return {
      response: "I understand you want to execute a task. Currently, I can help you with:\n\n• Answering questions about guards, shifts, and operations\n• Showing high-risk shifts\n• Listing unfilled shifts\n• Guard performance analysis\n\nTask execution (creating shifts, assigning guards) is coming soon! For now, please use the Shifts page to manage shifts.",
      citations: [],
      actions: [],
      data: null,
      confidence: 0.6,
    };
  }
}

module.exports = {
  processChatMessage,
};
