/**
 * Report Builder Service
 * 
 * Core service for generating reports from templates
 * - Renders widgets (charts, tables, KPIs)
 * - Aggregates data based on widget configuration
 * - Generates report output in multiple formats
 */

const { Op } = require("sequelize");
const analyticsService = require("./analytics.service");
const calloutRiskService = require("./calloutRiskPrediction.service");

/**
 * Generate report data from template
 * @param {Object} template - Report template with widgets
 * @param {Object} models - Sequelize models
 * @param {Object} options - { tenantId, dateRange, filters }
 * @returns {Promise<Object>} Generated report data
 */
async function generateReportData(template, models, options = {}) {
  const { tenantId, dateRange, filters = {} } = options;
  const { widgets = [] } = template;

  const reportData = {
    templateId: template.id,
    templateName: template.name,
    generatedAt: new Date().toISOString(),
    period: dateRange || {
      start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
      end: new Date().toISOString(),
    },
    widgets: [],
  };

  // Process each widget
  for (const widget of widgets) {
    try {
      const widgetData = await renderWidget(widget, models, {
        tenantId,
        dateRange,
        filters,
      });

      reportData.widgets.push({
        id: widget.id,
        type: widget.type,
        title: widget.title,
        config: widget.config,
        data: widgetData,
      });
    } catch (error) {
      console.error(`Error rendering widget ${widget.id}:`, error.message);
      reportData.widgets.push({
        id: widget.id,
        type: widget.type,
        title: widget.title,
        error: error.message,
        data: null,
      });
    }
  }

  return reportData;
}

/**
 * Render a single widget based on its type
 * @param {Object} widget - Widget configuration
 * @param {Object} models - Sequelize models
 * @param {Object} options - Context options
 * @returns {Promise<Object>} Widget data
 */
async function renderWidget(widget, models, options) {
  const { type, config } = widget;
  const { tenantId, dateRange, filters } = options;

  switch (type) {
    case "kpi":
      return await renderKPIWidget(config, models, options);

    case "chart":
      return await renderChartWidget(config, models, options);

    case "table":
      return await renderTableWidget(config, models, options);

    case "text":
      return await renderTextWidget(config, models, options);

    default:
      throw new Error(`Unknown widget type: ${type}`);
  }
}

/**
 * Render KPI widget
 * @param {Object} config - KPI configuration
 * @param {Object} models - Sequelize models
 * @param {Object} options - Context options
 * @returns {Promise<Object>} KPI data
 */
async function renderKPIWidget(config, models, options) {
  const { kpiType, label } = config;
  const { tenantId, dateRange } = options;

  let value = 0;
  let trend = null;

  switch (kpiType) {
    case "coverage_rate":
      // Calculate coverage rate
      const { sequelize } = models;
      const [coverageData] = await sequelize.query(`
        SELECT 
          COUNT(*) FILTER (WHERE guard_id IS NOT NULL) as assigned,
          COUNT(*) as total
        FROM shifts
        WHERE tenant_id = $1
          AND shift_date >= $2::date
          AND shift_date <= $3::date
          AND status IN ('OPEN', 'CLOSED')
      `, {
        bind: [
          tenantId,
          dateRange?.start?.split('T')[0] || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          dateRange?.end?.split('T')[0] || new Date().toISOString().split('T')[0],
        ],
      });

      if (coverageData[0]?.total > 0) {
        value = Math.round((coverageData[0].assigned / coverageData[0].total) * 100);
      }
      break;

    case "open_shifts":
      const { Shift } = models;
      const openShifts = await Shift.count({
        where: {
          tenant_id: tenantId,
          status: "OPEN",
        },
      });
      value = openShifts;
      break;

    case "total_callouts":
      const { CallOut, sequelize: seqCallOut } = models;
      // Use raw query since CallOut uses created_at (snake_case)
      const [calloutData] = await seqCallOut.query(`
        SELECT COUNT(*) as count
        FROM callouts
        WHERE tenant_id = $1::uuid
          AND created_at >= $2::timestamp
          AND created_at <= $3::timestamp
      `, {
        bind: [
          tenantId,
          dateRange?.start || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
          dateRange?.end || new Date().toISOString(),
        ],
      });
      value = parseInt(calloutData[0]?.count || 0);
      break;

    case "labor_costs":
      // Estimate labor costs (simplified)
      const { sequelize: seq } = models;
      const [costData] = await seq.query(`
        SELECT COUNT(*) as shift_count
        FROM shifts
        WHERE tenant_id = $1
          AND shift_date >= $2::date
          AND shift_date <= $3::date
          AND status = 'CLOSED'
      `, {
        bind: [
          tenantId,
          dateRange?.start?.split('T')[0] || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          dateRange?.end?.split('T')[0] || new Date().toISOString().split('T')[0],
        ],
      });

      // Estimate: 8 hours per shift × $15/hour
      value = Math.round((costData[0]?.shift_count || 0) * 8 * 15);
      break;

    default:
      value = 0;
  }

  return {
    value,
    label: label || kpiType,
    format: config.format || "number", // 'number', 'percentage', 'currency'
    trend,
  };
}

/**
 * Render chart widget
 * @param {Object} config - Chart configuration
 * @param {Object} models - Sequelize models
 * @param {Object} options - Context options
 * @returns {Promise<Object>} Chart data
 */
async function renderChartWidget(config, models, options) {
  const { chartType, dataSource, xAxis, yAxis, groupBy } = config;
  const { tenantId, dateRange } = options;

  let chartData = [];

  switch (dataSource) {
    case "callouts_by_location":
      const { sequelize } = models;
      try {
        // Get callouts with location from shifts
        const [calloutData] = await sequelize.query(`
          SELECT 
            COALESCE(s.location, 'Unknown') as location,
            COUNT(*) as count
          FROM callouts c
          LEFT JOIN shifts s ON s.id = c.shift_id
          WHERE (s.tenant_id = $1::uuid OR c.tenant_id = $1::uuid)
            AND c.created_at >= $2::timestamp
            AND c.created_at <= $3::timestamp
          GROUP BY s.location
          ORDER BY count DESC
          LIMIT 10
        `, {
          bind: [
            tenantId,
            dateRange?.start || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
            dateRange?.end || new Date().toISOString(),
          ],
        });

        if (calloutData && calloutData.length > 0) {
          chartData = calloutData.map((row) => ({
            label: row.location || "Unknown",
            value: parseInt(row.count || 0),
          }));
        } else {
          // Fallback: provide sample data or empty with message
          chartData = [
            { label: "No callouts found", value: 0 }
          ];
        }
      } catch (error) {
        console.error("Error fetching callouts by location:", error);
        chartData = [
          { label: "Error loading data", value: 0 }
        ];
      }
      break;

    case "shifts_by_day":
      try {
        const { sequelize: seq } = models;
        const startDate = dateRange?.start?.split('T')[0] || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const endDate = dateRange?.end?.split('T')[0] || new Date().toISOString().split('T')[0];
        
        const [shiftData] = await seq.query(`
          SELECT 
            shift_date,
            COUNT(*) as count
          FROM shifts
          WHERE tenant_id = $1::uuid
            AND shift_date >= $2::date
            AND shift_date <= $3::date
          GROUP BY shift_date
          ORDER BY shift_date ASC
        `, {
          bind: [tenantId, startDate, endDate],
        });

        if (shiftData && shiftData.length > 0) {
          chartData = shiftData.map((row) => ({
            label: new Date(row.shift_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
            value: parseInt(row.count || 0),
          }));
        } else {
          // Fallback: provide sample data
          chartData = [
            { label: "No shifts found", value: 0 }
          ];
        }
      } catch (error) {
        console.error("Error fetching shifts by day:", error);
        chartData = [
          { label: "Error loading data", value: 0 }
        ];
      }
      break;

    default:
      chartData = [];
  }

  return {
    type: chartType || "bar",
    data: chartData,
    xAxis: xAxis || "label",
    yAxis: yAxis || "value",
  };
}

/**
 * Render table widget
 * @param {Object} config - Table configuration
 * @param {Object} models - Sequelize models
 * @param {Object} options - Context options
 * @returns {Promise<Object>} Table data
 */
async function renderTableWidget(config, models, options) {
  const { dataSource, columns, limit = 10 } = config;
  const { tenantId, dateRange } = options;

  let tableData = [];

  switch (dataSource) {
    case "high_risk_shifts":
      try {
        const risks = await calloutRiskService.batchCalculateRisks(
          models,
          7 // 7 days ahead
        );

        tableData = risks
          .filter((item) => item.risk.score >= 60) // High risk only
          .slice(0, limit)
          .map((item) => ({
            date: item.shift.shift_date,
            location: item.shift.location,
            guard: item.risk.guardName || "Unassigned",
            riskScore: item.risk.score,
            recommendation: item.risk.recommendation,
          }));
      } catch (error) {
        console.error("Error fetching high-risk shifts:", error);
        tableData = [];
      }
      break;

    case "open_shifts":
      const { Shift } = models;
      const openShifts = await Shift.findAll({
        where: {
          tenant_id: tenantId,
          status: "OPEN",
        },
        limit,
        order: [["shift_date", "ASC"]],
        attributes: ["id", "shift_date", "shift_start", "shift_end", "location"],
      });

      tableData = openShifts.map((shift) => ({
        date: shift.shift_date,
        time: `${shift.shift_start} - ${shift.shift_end}`,
        location: shift.location || "Unknown",
        status: shift.status,
      }));
      break;

    default:
      tableData = [];
  }

  return {
    columns: columns || Object.keys(tableData[0] || {}),
    rows: tableData,
  };
}

/**
 * Render text widget
 * @param {Object} config - Text configuration
 * @param {Object} models - Sequelize models
 * @param {Object} options - Context options
 * @returns {Promise<Object>} Text data
 */
async function renderTextWidget(config, models, options) {
  const { content, dynamic = false } = config;

  if (!dynamic) {
    return {
      content,
    };
  }

  // For dynamic text, we could inject data here
  // For now, return static content
  return {
    content,
  };
}

module.exports = {
  generateReportData,
  renderWidget,
  renderKPIWidget,
  renderChartWidget,
  renderTableWidget,
  renderTextWidget,
};
