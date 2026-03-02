/**
 * Weekly Report Service
 * 
 * Generates AI-powered weekly operational summaries and reports
 * - Aggregates operational data over time periods
 * - Generates AI summaries using LLM
 * - Exports to CSV/PDF format
 */

const { Op } = require("sequelize");
const commandCenterAI = require("./commandCenterAI.service");

/**
 * Generate weekly operational summary using AI
 * @param {String} tenantId - Tenant ID
 * @param {Object} models - Sequelize models
 * @param {Object} options - { startDate, endDate, includeGuards, includeSites }
 * @returns {Promise<Object>} Weekly report data
 */
async function generateWeeklyReport(tenantId, models, options = {}) {
  try {
    const { Shift, CallOut, OpEvent, Guard, Incident } = models;
    
    // Default to last 7 days if dates not provided
    const endDate = options.endDate || new Date();
    const startDate = options.startDate || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    
    // Ensure dates are Date objects
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    // Aggregate operational data
    const aggregatedData = await aggregateOperationalData(tenantId, models, start, end);
    
    // Generate AI summary
    let aiSummary = null;
    try {
      aiSummary = await commandCenterAI.generateWeeklySummary(aggregatedData, { startDate: start, endDate: end });
    } catch (error) {
      console.warn("⚠️ AI summary generation failed, using template:", error.message);
      aiSummary = generateTemplateSummary(aggregatedData, start, end);
    }
    
    return {
      reportId: `weekly-${start.toISOString().split("T")[0]}-${end.toISOString().split("T")[0]}`,
      period: {
        startDate: start.toISOString(),
        endDate: end.toISOString(),
        days: Math.ceil((end - start) / (1000 * 60 * 60 * 24)),
      },
      summary: aiSummary,
      metrics: aggregatedData.metrics,
      insights: aggregatedData.insights,
      trends: aggregatedData.trends,
      generatedAt: new Date().toISOString(),
    };
  } catch (error) {
    console.error("❌ Error generating weekly report:", error);
    throw error;
  }
}

/**
 * Aggregate operational data for the specified time period
 * @param {String} tenantId - Tenant ID
 * @param {Object} models - Sequelize models
 * @param {Date} startDate - Start date
 * @param {Date} endDate - End date
 * @returns {Promise<Object>} Aggregated data
 */
async function aggregateOperationalData(tenantId, models, startDate, endDate) {
  try {
    const { Shift, CallOut, OpEvent, Guard, Incident } = models;
    const { sequelize } = models;
    
    // Count shifts
    let totalShifts = 0;
    let completedShifts = 0;
    let openShifts = 0;
    try {
      if (sequelize) {
        const [shiftRows] = await sequelize.query(
          `SELECT COUNT(*) as total, 
                  SUM(CASE WHEN status = 'CLOSED' THEN 1 ELSE 0 END) as completed,
                  SUM(CASE WHEN status = 'OPEN' THEN 1 ELSE 0 END) as open
           FROM shifts 
           WHERE tenant_id::text = COALESCE($1::text, '')::text 
           AND shift_date >= $2 
           AND shift_date <= $3`,
          { bind: [tenantId || '', startDate.toISOString().split("T")[0], endDate.toISOString().split("T")[0]] }
        );
        totalShifts = parseInt(shiftRows[0]?.total || 0, 10);
        completedShifts = parseInt(shiftRows[0]?.completed || 0, 10);
        openShifts = parseInt(shiftRows[0]?.open || 0, 10);
      }
    } catch (err) {
      console.warn("⚠️ Error counting shifts:", err.message);
    }
    
    // Count callouts
    let totalCallouts = 0;
    try {
      if (sequelize) {
        const [calloutRows] = await sequelize.query(
          `SELECT COUNT(*) as total 
           FROM callouts 
           WHERE created_at >= $1 
           AND created_at <= $2`,
          { bind: [startDate, endDate] }
        );
        totalCallouts = parseInt(calloutRows[0]?.total || 0, 10);
      }
    } catch (err) {
      console.warn("⚠️ Error counting callouts:", err.message);
    }
    
    // Count incidents
    let totalIncidents = 0;
    let openIncidents = 0;
    try {
      if (Incident && sequelize) {
        const [incidentRows] = await sequelize.query(
          `SELECT COUNT(*) as total,
                  SUM(CASE WHEN status = 'OPEN' THEN 1 ELSE 0 END) as open
           FROM incidents 
           WHERE created_at >= $1 
           AND created_at <= $2`,
          { bind: [startDate, endDate] }
        );
        totalIncidents = parseInt(incidentRows[0]?.total || 0, 10);
        openIncidents = parseInt(incidentRows[0]?.open || 0, 10);
      }
    } catch (err) {
      console.warn("⚠️ Error counting incidents:", err.message);
    }
    
    // Count operational events
    let totalEvents = 0;
    let highSeverityEvents = 0;
    try {
      if (OpEvent && sequelize) {
        const [eventRows] = await sequelize.query(
          `SELECT COUNT(*) as total,
                  SUM(CASE WHEN severity IN ('HIGH', 'CRITICAL') THEN 1 ELSE 0 END) as high_severity
           FROM ops_events 
           WHERE created_at >= $1 
           AND created_at <= $2`,
          { bind: [startDate, endDate] }
        );
        totalEvents = parseInt(eventRows[0]?.total || 0, 10);
        highSeverityEvents = parseInt(eventRows[0]?.high_severity || 0, 10);
      }
    } catch (err) {
      console.warn("⚠️ Error counting events:", err.message);
    }
    
    // Calculate trends (compare first half vs second half of period)
    const midDate = new Date(startDate.getTime() + (endDate.getTime() - startDate.getTime()) / 2);
    
    let shiftsTrend = "STABLE";
    let calloutsTrend = "STABLE";
    let incidentsTrend = "STABLE";
    
    try {
      if (sequelize) {
        // Compare shifts in first half vs second half
        const [firstHalf] = await sequelize.query(
          `SELECT COUNT(*) as count FROM shifts 
           WHERE shift_date >= $1 AND shift_date < $2`,
          { bind: [startDate.toISOString().split("T")[0], midDate.toISOString().split("T")[0]] }
        );
        const [secondHalf] = await sequelize.query(
          `SELECT COUNT(*) as count FROM shifts 
           WHERE shift_date >= $1 AND shift_date <= $2`,
          { bind: [midDate.toISOString().split("T")[0], endDate.toISOString().split("T")[0]] }
        );
        
        const firstHalfCount = parseInt(firstHalf[0]?.count || 0, 10);
        const secondHalfCount = parseInt(secondHalf[0]?.count || 0, 10);
        
        if (firstHalfCount > 0) {
          const change = ((secondHalfCount - firstHalfCount) / firstHalfCount) * 100;
          shiftsTrend = change > 10 ? "INCREASING" : change < -10 ? "DECREASING" : "STABLE";
        }
      }
    } catch (err) {
      console.warn("⚠️ Error calculating trends:", err.message);
    }
    
    // Calculate completion rate
    const completionRate = totalShifts > 0 ? (completedShifts / totalShifts) * 100 : 0;
    const calloutRate = totalShifts > 0 ? (totalCallouts / totalShifts) * 100 : 0;
    
    return {
      metrics: {
        totalShifts,
        completedShifts,
        openShifts,
        totalCallouts,
        totalIncidents,
        openIncidents,
        totalEvents,
        highSeverityEvents,
        completionRate: Math.round(completionRate * 100) / 100,
        calloutRate: Math.round(calloutRate * 100) / 100,
      },
      insights: {
        coverage: completionRate >= 90 ? "EXCELLENT" : completionRate >= 75 ? "GOOD" : completionRate >= 60 ? "FAIR" : "POOR",
        reliability: calloutRate <= 5 ? "EXCELLENT" : calloutRate <= 10 ? "GOOD" : calloutRate <= 20 ? "FAIR" : "POOR",
        incidentRate: totalIncidents > 10 ? "HIGH" : totalIncidents > 5 ? "MEDIUM" : "LOW",
      },
      trends: {
        shifts: shiftsTrend,
        callouts: calloutsTrend,
        incidents: incidentsTrend,
      },
    };
  } catch (error) {
    console.error("❌ Error aggregating operational data:", error);
    // Return safe defaults
    return {
      metrics: {
        totalShifts: 0,
        completedShifts: 0,
        openShifts: 0,
        totalCallouts: 0,
        totalIncidents: 0,
        openIncidents: 0,
        totalEvents: 0,
        highSeverityEvents: 0,
        completionRate: 0,
        calloutRate: 0,
      },
      insights: {
        coverage: "UNKNOWN",
        reliability: "UNKNOWN",
        incidentRate: "LOW",
      },
      trends: {
        shifts: "STABLE",
        callouts: "STABLE",
        incidents: "STABLE",
      },
    };
  }
}

/**
 * Generate template summary if AI fails
 */
function generateTemplateSummary(data, startDate, endDate) {
  const { metrics, insights, trends } = data;
  const days = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));
  
  return {
    overview: `Weekly operational summary for ${days} days (${startDate.toLocaleDateString()} - ${endDate.toLocaleDateString()}). 
    
Total Operations:
- ${metrics.totalShifts} shifts scheduled (${metrics.completedShifts} completed, ${metrics.openShifts} open)
- ${metrics.totalCallouts} callouts recorded
- ${metrics.totalIncidents} incidents reported (${metrics.openIncidents} open)
- ${metrics.totalEvents} operational events tracked

Performance:
- Completion Rate: ${metrics.completionRate}%
- Callout Rate: ${metrics.calloutRate}%
- Coverage Status: ${insights.coverage}
- Reliability Status: ${insights.reliability}`,
    
    highlights: [
      metrics.highSeverityEvents > 0 ? `${metrics.highSeverityEvents} high-severity events require attention` : null,
      metrics.openShifts > 0 ? `${metrics.openShifts} open shifts need assignment` : null,
      metrics.openIncidents > 0 ? `${metrics.openIncidents} incidents remain unresolved` : null,
      insights.coverage === "EXCELLENT" ? "Excellent coverage maintained this week" : null,
    ].filter(Boolean),
    
    recommendations: [
      insights.coverage === "POOR" ? "Consider increasing guard availability for better coverage" : null,
      insights.reliability === "POOR" ? "Review guard reliability patterns and provide additional support" : null,
      metrics.openShifts > 0 ? "Address open shifts to maintain coverage" : null,
      metrics.openIncidents > 0 ? "Prioritize resolving open incidents" : null,
    ].filter(Boolean),
  };
}

/**
 * Export report data to PDF format
 * @param {Object} reportData - Report data object
 * @returns {Promise<Buffer>} PDF buffer
 */
async function exportToPDF(reportData) {
  try {
    // Dynamic import to avoid requiring pdfkit if not installed
    const PDFDocument = require('pdfkit');
    const doc = new PDFDocument({ margin: 50 });
    
    const chunks = [];
    doc.on('data', chunk => chunks.push(chunk));
    
    return new Promise((resolve, reject) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
      
      // Header
      doc.fontSize(20).text('Weekly Operational Report', { align: 'center' });
      doc.moveDown();
      
      // Report Period
      const startDate = new Date(reportData.period.startDate).toLocaleDateString();
      const endDate = new Date(reportData.period.endDate).toLocaleDateString();
      doc.fontSize(12)
        .text(`Period: ${startDate} - ${endDate} (${reportData.period.days} days)`, { align: 'center' });
      doc.text(`Generated: ${new Date(reportData.generatedAt).toLocaleString()}`, { align: 'center' });
      if (reportData.summary?.generatedByAI) {
        doc.fillColor('#a78bfa').text('🤖 AI-Generated Report', { align: 'center' });
        doc.fillColor('black');
      }
      doc.moveDown(2);
      
      // Executive Summary
      if (reportData.summary?.overview) {
        doc.fontSize(16).text('Executive Summary', { underline: true });
        doc.moveDown(0.5);
        doc.fontSize(11).text(reportData.summary.overview, { align: 'justify' });
        doc.moveDown(2);
      }
      
      // Key Metrics
      doc.fontSize(16).text('Key Metrics', { underline: true });
      doc.moveDown(0.5);
      doc.fontSize(11);
      const metrics = reportData.metrics;
      doc.text(`Total Shifts: ${metrics.totalShifts} (${metrics.completedShifts} completed, ${metrics.openShifts} open)`);
      doc.text(`Completion Rate: ${metrics.completionRate}%`);
      doc.text(`Callouts: ${metrics.totalCallouts} (${metrics.calloutRate}% rate)`);
      doc.text(`Incidents: ${metrics.totalIncidents} (${metrics.openIncidents} open)`);
      doc.text(`Operational Events: ${metrics.totalEvents} (${metrics.highSeverityEvents} high-severity)`);
      doc.moveDown(2);
      
      // Highlights
      if (reportData.summary?.highlights && reportData.summary.highlights.length > 0) {
        doc.fontSize(16).text('Highlights', { underline: true });
        doc.moveDown(0.5);
        doc.fontSize(11);
        reportData.summary.highlights.forEach(highlight => {
          doc.text(`• ${highlight}`);
        });
        doc.moveDown(2);
      }
      
      // Recommendations
      if (reportData.summary?.recommendations && reportData.summary.recommendations.length > 0) {
        doc.fontSize(16).text('Recommendations', { underline: true });
        doc.moveDown(0.5);
        doc.fontSize(11);
        reportData.summary.recommendations.forEach(rec => {
          doc.text(`• ${rec}`);
        });
        doc.moveDown(2);
      }
      
      // Trends
      if (reportData.trends) {
        doc.fontSize(16).text('Trends', { underline: true });
        doc.moveDown(0.5);
        doc.fontSize(11);
        const trendEmoji = (trend) => trend === "INCREASING" ? "📈" : trend === "DECREASING" ? "📉" : "➡️";
        doc.text(`Shifts: ${trendEmoji(reportData.trends.shifts)} ${reportData.trends.shifts}`);
        doc.text(`Callouts: ${trendEmoji(reportData.trends.callouts)} ${reportData.trends.callouts}`);
        doc.text(`Incidents: ${trendEmoji(reportData.trends.incidents)} ${reportData.trends.incidents}`);
      }
      
      // Footer
      doc.fontSize(8)
        .fillColor('gray')
        .text('Generated by Abe Guard Admin Dashboard', 50, doc.page.height - 50, { align: 'center' });
      
      doc.end();
    });
  } catch (error) {
    console.error("❌ Error generating PDF:", error);
    // If pdfkit is not installed, return null to trigger error handling
    if (error.code === 'MODULE_NOT_FOUND') {
      throw new Error("PDF generation requires pdfkit package. Run: npm install pdfkit");
    }
    throw error;
  }
}

/**
 * Export report data to CSV format
 * @param {Object} reportData - Report data object
 * @returns {String} CSV formatted string
 */
function exportToCSV(reportData) {
  const { metrics, period, summary } = reportData;
  
  let csv = `Weekly Operational Report\n`;
  csv += `Period: ${new Date(period.startDate).toLocaleDateString()} - ${new Date(period.endDate).toLocaleDateString()}\n`;
  csv += `Generated: ${new Date(reportData.generatedAt).toLocaleString()}\n\n`;
  
  csv += `Metric,Value\n`;
  csv += `Total Shifts,${metrics.totalShifts}\n`;
  csv += `Completed Shifts,${metrics.completedShifts}\n`;
  csv += `Open Shifts,${metrics.openShifts}\n`;
  csv += `Total Callouts,${metrics.totalCallouts}\n`;
  csv += `Total Incidents,${metrics.totalIncidents}\n`;
  csv += `Open Incidents,${metrics.openIncidents}\n`;
  csv += `Total Events,${metrics.totalEvents}\n`;
  csv += `High Severity Events,${metrics.highSeverityEvents}\n`;
  csv += `Completion Rate,${metrics.completionRate}%\n`;
  csv += `Callout Rate,${metrics.calloutRate}%\n\n`;
  
  if (summary && summary.overview) {
    csv += `Summary\n`;
    csv += `${summary.overview.replace(/\n/g, ' ')}\n\n`;
  }
  
  if (summary && summary.highlights && summary.highlights.length > 0) {
    csv += `Highlights\n`;
    summary.highlights.forEach(highlight => {
      csv += `${highlight}\n`;
    });
    csv += `\n`;
  }
  
  if (summary && summary.recommendations && summary.recommendations.length > 0) {
    csv += `Recommendations\n`;
    summary.recommendations.forEach(rec => {
      csv += `${rec}\n`;
    });
  }
  
  return csv;
}

module.exports = {
  generateWeeklyReport,
  aggregateOperationalData,
  exportToCSV,
  exportToPDF,
};
