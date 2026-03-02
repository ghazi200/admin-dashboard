/**
 * Test Script: Create and Send Scheduled Report Email
 * 
 * This script:
 * 1. Creates a test report template
 * 2. Creates a scheduled report
 * 3. Runs it immediately to test email delivery
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

async function testScheduledReportEmail() {
  try {
    await sequelize.authenticate();
    console.log("✅ Connected to database");

    // Get or create a tenant_id (use first admin's tenant_id or create a test one)
    const [admins] = await sequelize.query(`
      SELECT tenant_id FROM admins LIMIT 1
    `);
    
    const tenantId = admins?.[0]?.tenant_id || uuidv4();
    console.log(`📋 Using tenant_id: ${tenantId}`);

    // Step 1: Create a test report template
    console.log("\n📊 Step 1: Creating test report template...");
    const templateId = uuidv4();
    const testTemplate = {
      id: templateId,
      tenant_id: tenantId,
      name: "Test Weekly Summary Report",
      description: "Test report for email delivery",
      category: "test",
      widgets: JSON.stringify([
        {
          id: `widget-${Date.now()}`,
          type: "kpi",
          title: "Coverage Rate",
          config: {
            kpiType: "coverage_rate",
            label: "Coverage Rate",
            format: "percentage",
          },
        },
        {
          id: `widget-${Date.now() + 1}`,
          type: "text",
          title: "Report Summary",
          config: {
            content: "This is a test report generated for Ghazi. The scheduled report system is working correctly!",
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
        "Test Report for Ghazi - Weekly",
        "daily",
        JSON.stringify(scheduleConfig),
        ["techworldstarzllc@gmail.com"], // Array, not JSON string
        "Test Report: Weekly Summary for Ghazi",
        "Hello Ghazi,\n\nThis is a test scheduled report. The automated report system is working correctly!\n\nBest regards,\nAdmin Dashboard",
        "pdf",
        true,
        nextRunAt,
      ],
    });

    console.log(`✅ Created scheduled report: Test Report for Ghazi - Weekly (${scheduledId})`);
    console.log(`   📧 Email recipient: techworldstarzllc@gmail.com`);
    console.log(`   📅 Frequency: Daily at 09:00`);

    // Step 3: Run the scheduled report immediately
    console.log("\n🚀 Step 3: Running scheduled report now...");
    console.log("   (This will generate the report and send the email)");

    // Import the scheduler service
    const reportSchedulerService = require("../services/reportScheduler.service");
    
    // Load models properly
    const models = require("../models");
    
    // Verify models are loaded
    if (!models || !models.ReportTemplate || !models.ReportRun) {
      console.error("❌ Models not loaded correctly");
      console.error("Available models:", Object.keys(models || {}));
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
    console.log("   The email should contain a PDF attachment with the test report.");
    console.log("\n💡 Note: Make sure SMTP settings are configured in .env file");
    console.log("   See EMAIL_CONFIGURATION.md for setup instructions");

  } catch (error) {
    console.error("\n❌ Error:", error);
    console.error(error.stack);
  } finally {
    await sequelize.close();
  }
}

// Run the test
testScheduledReportEmail();
