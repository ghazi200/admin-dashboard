/**
 * Test Script: Create and Send Report with KPIs and Charts
 * 
 * Creates a comprehensive report with:
 * - KPI cards (coverage rate, open shifts, callouts, etc.)
 * - Charts (bar charts, line charts)
 * - Sends via email
 */

require("dotenv").config();
const { Sequelize, DataTypes } = require("sequelize");
const { v4: uuidv4 } = require("uuid");

const isTest = process.env.NODE_ENV === "test";

const sequelize = isTest
  ? new Sequelize({
      dialect: "sqlite",
      storage: "file::memory:",
      logging: false,
    })
  : new Sequelize(
      process.env.DB_NAME,
      process.env.DB_USER,
      process.env.DB_PASS,
      {
        host: process.env.DB_HOST,
        dialect: "postgres",
        logging: console.log,
      }
    );

async function testReportWithKPIsAndCharts() {
  try {
    await sequelize.authenticate();
    console.log("✅ Connected to database");

    // Get tenant_id
    const [admins] = await sequelize.query(`
      SELECT tenant_id FROM admins LIMIT 1
    `);
    
    const tenantId = admins?.[0]?.tenant_id || uuidv4();
    console.log(`📋 Using tenant_id: ${tenantId}`);

    // Step 1: Create a comprehensive report template with KPIs and Charts
    console.log("\n📊 Step 1: Creating report template with KPIs and Charts...");
    const templateId = uuidv4();
    const testTemplate = {
      id: templateId,
      tenant_id: tenantId,
      name: "Weekly Performance Report with KPIs & Charts",
      description: "Comprehensive report with KPI cards and interactive charts",
      category: "performance",
      widgets: JSON.stringify([
        // KPI Widget 1: Coverage Rate
        {
          id: `widget-kpi-1-${Date.now()}`,
          type: "kpi",
          title: "Coverage Rate",
          config: {
            kpiType: "coverage_rate",
            label: "Coverage Rate",
            format: "percentage",
          },
        },
        // KPI Widget 2: Open Shifts
        {
          id: `widget-kpi-2-${Date.now()}`,
          type: "kpi",
          title: "Open Shifts",
          config: {
            kpiType: "open_shifts",
            label: "Open Shifts",
            format: "number",
          },
        },
        // KPI Widget 3: Total Callouts
        {
          id: `widget-kpi-3-${Date.now()}`,
          type: "kpi",
          title: "Total Callouts",
          config: {
            kpiType: "total_callouts",
            label: "Total Callouts",
            format: "number",
          },
        },
        // KPI Widget 4: Labor Costs
        {
          id: `widget-kpi-4-${Date.now()}`,
          type: "kpi",
          title: "Labor Costs",
          config: {
            kpiType: "labor_costs",
            label: "Total Labor Costs",
            format: "currency",
          },
        },
        // Chart Widget 1: Callouts by Location (Bar Chart)
        {
          id: `widget-chart-1-${Date.now()}`,
          type: "chart",
          title: "Callouts by Location",
          config: {
            chartType: "bar",
            dataSource: "callouts_by_location",
            xAxis: "label",
            yAxis: "value",
          },
        },
        // Chart Widget 2: Shifts by Day (Line Chart)
        {
          id: `widget-chart-2-${Date.now()}`,
          type: "chart",
          title: "Shifts by Day",
          config: {
            chartType: "line",
            dataSource: "shifts_by_day",
            xAxis: "label",
            yAxis: "value",
          },
        },
        // Text Widget: Summary
        {
          id: `widget-text-${Date.now()}`,
          type: "text",
          title: "Executive Summary",
          config: {
            content: "This comprehensive weekly report includes key performance indicators (KPIs) and visual charts showing callout trends and shift distribution. The data provides insights into operational efficiency and coverage metrics.",
          },
        },
      ]),
      settings: JSON.stringify({}),
      is_public: false,
      is_default: false,
      created_by: null,
    };

    await sequelize.query(`
      INSERT INTO report_templates (
        id, tenant_id, name, description, category, widgets, settings,
        is_public, is_default, created_by, created_at
      )
      VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6::jsonb, $7::jsonb, $8, $9, NULL, NOW())
      ON CONFLICT (id) DO NOTHING
    `, {
      bind: [
        testTemplate.id,
        testTemplate.tenant_id,
        testTemplate.name,
        testTemplate.description,
        testTemplate.category,
        testTemplate.widgets,
        testTemplate.settings,
        testTemplate.is_public,
        testTemplate.is_default,
      ],
    });

    console.log(`✅ Created template: ${testTemplate.name} (${templateId})`);
    console.log(`   📊 Widgets: 4 KPIs + 2 Charts + 1 Text Summary`);

    // Step 2: Create a scheduled report
    console.log("\n⏰ Step 2: Creating scheduled report...");
    const scheduledId = uuidv4();
    const scheduleConfig = {
      time: "09:00",
    };
    const nextRunAt = new Date();
    nextRunAt.setHours(9, 0, 0, 0);
    if (nextRunAt <= new Date()) {
      nextRunAt.setDate(nextRunAt.getDate() + 1);
    }

    await sequelize.query(`
      INSERT INTO scheduled_reports (
        id, tenant_id, template_id, name, frequency, schedule_config,
        email_recipients, email_subject, email_message, export_format,
        is_active, next_run_at, created_at
      )
      VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6::jsonb, $7::text[], $8, $9, $10, $11, $12, NOW())
      ON CONFLICT (id) DO NOTHING
    `, {
      bind: [
        scheduledId,
        tenantId,
        templateId,
        "Weekly Performance Report - KPIs & Charts",
        "daily",
        JSON.stringify(scheduleConfig),
        ["techworldstarzllc@gmail.com"],
        "Weekly Performance Report: KPIs & Charts for Ghazi",
        "Hello Ghazi,\n\nPlease find attached your weekly performance report with comprehensive KPIs and visual charts.\n\nThis report includes:\n• Coverage Rate Metrics\n• Open Shifts Analysis\n• Callout Trends\n• Labor Cost Overview\n• Interactive Charts\n\nBest regards,\nAdmin Dashboard",
        "pdf",
        true,
        nextRunAt,
      ],
    });

    console.log(`✅ Created scheduled report: Weekly Performance Report - KPIs & Charts (${scheduledId})`);
    console.log(`   📧 Email recipient: techworldstarzllc@gmail.com`);
    console.log(`   📅 Frequency: Daily at 09:00`);

    // Step 3: Run the scheduled report immediately
    console.log("\n🚀 Step 3: Generating report with KPIs and Charts...");
    console.log("   (This will generate the report and send the email)");

    // Import the scheduler service
    const reportSchedulerService = require("../services/reportScheduler.service");
    const models = require("../models");
    
    // Verify models are loaded
    if (!models || !models.ReportTemplate || !models.ReportRun) {
      console.error("❌ Models not loaded correctly");
      throw new Error("Failed to load models");
    }
    
    console.log("✅ Models loaded:", Object.keys(models).filter(k => k.includes("Report") || k.includes("Scheduled")).join(", "));

    // Get the scheduled report
    const [scheduled] = await sequelize.query(`
      SELECT * FROM scheduled_reports WHERE id = $1::uuid LIMIT 1
    `, {
      bind: [scheduledId],
    });

    if (!scheduled || scheduled.length === 0) {
      throw new Error("Scheduled report not found");
    }

    // Process it
    await reportSchedulerService.processScheduledReport(scheduled[0], models);

    console.log("\n✅ Test completed!");
    console.log("\n📧 Check the email inbox for: techworldstarzllc@gmail.com");
    console.log("   The email should contain a PDF with:");
    console.log("   • 4 KPI Cards (Coverage Rate, Open Shifts, Callouts, Labor Costs)");
    console.log("   • 2 Charts (Callouts by Location, Shifts by Day)");
    console.log("   • Executive Summary");

  } catch (error) {
    console.error("\n❌ Error:", error);
    console.error(error.stack);
  } finally {
    await sequelize.close();
  }
}

// Run the test
testReportWithKPIsAndCharts();
