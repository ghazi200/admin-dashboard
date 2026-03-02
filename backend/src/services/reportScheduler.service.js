const reportBuilderService = require("./reportBuilder.service");
const reportExportService = require("./reportExport.service");
const emailService = require("./email.service");
const { v4: uuidv4 } = require("uuid");

/**
 * Report Scheduler Service
 * Handles automated report generation based on scheduled reports
 */

/**
 * Process all scheduled reports that are due to run
 */
async function processScheduledReports(models) {
  try {
    const { sequelize, ReportTemplate, ReportRun, ScheduledReport } = models;
    const now = new Date();

    // Find all active scheduled reports where next_run_at <= now
    const [dueReports] = await sequelize.query(`
      SELECT * FROM scheduled_reports
      WHERE is_active = TRUE
        AND next_run_at IS NOT NULL
        AND next_run_at <= $1
      ORDER BY next_run_at ASC
    `, {
      bind: [now],
    });

    console.log(`📅 Found ${dueReports.length} scheduled reports due to run`);

    for (const scheduled of dueReports) {
      try {
        await processScheduledReport(scheduled, models);
      } catch (error) {
        console.error(`❌ Error processing scheduled report ${scheduled.id}:`, error);
        // Continue with other reports even if one fails
      }
    }

    return { processed: dueReports.length };
  } catch (error) {
    console.error("❌ Error in processScheduledReports:", error);
    throw error;
  }
}

/**
 * Process a single scheduled report
 */
async function processScheduledReport(scheduled, models) {
  const { sequelize, ReportTemplate, ReportRun } = models;

  console.log(`🔄 Processing scheduled report: ${scheduled.name} (${scheduled.id})`);

  // Get template
  const template = await ReportTemplate.findByPk(scheduled.template_id);
  if (!template) {
    console.error(`❌ Template not found for scheduled report ${scheduled.id}`);
    return;
  }

  // Generate report data
  const reportData = await reportBuilderService.generateReportData(
    template,
    models,
    {
      tenantId: scheduled.tenant_id,
      dateRange: "last_7_days", // Can be customized per scheduled report
    }
  );

  // Export report in requested format(s)
  const exportFormats = scheduled.export_format === "all" 
    ? ["pdf", "excel", "csv", "html"]
    : [scheduled.export_format || "pdf"];

  const fileBuffers = {}; // Store actual file buffers for email attachments
  const filePaths = {}; // Store file paths for database
  for (const format of exportFormats) {
    try {
      let fileBuffer;
      switch (format) {
        case "pdf":
          fileBuffer = await reportExportService.exportToPDF(reportData);
          break;
        case "excel":
          fileBuffer = await reportExportService.exportToExcel(reportData);
          break;
        case "csv":
          fileBuffer = await reportExportService.exportToCSV(reportData);
          break;
        case "html":
          fileBuffer = await reportExportService.exportToHTML(reportData);
          break;
        default:
          console.warn(`⚠️  Unknown export format: ${format}`);
          continue;
      }
      
      if (!fileBuffer) {
        console.warn(`⚠️  No file buffer returned for format: ${format}`);
        continue;
      }

      fileBuffers[format] = fileBuffer;
      // In a production system, you would save files to disk or cloud storage
      // For now, we'll just store the buffer reference
      filePaths[format] = `generated_${scheduled.id}_${Date.now()}.${format}`;
    } catch (error) {
      console.error(`❌ Error exporting report in ${format} format:`, error);
    }
  }

  // Save report run
  const reportRun = await ReportRun.create({
    id: uuidv4(),
    tenant_id: scheduled.tenant_id,
    template_id: scheduled.template_id,
    scheduled_report_id: scheduled.id,
    report_data: reportData,
    status: "completed",
    formats: exportFormats,
    file_paths: filePaths,
    generated_by: null,
    generated_at: new Date(),
  });

  // Send email if recipients configured
  if (scheduled.email_recipients && scheduled.email_recipients.length > 0) {
    try {
      const emailResult = await emailService.sendScheduledReportEmail(
        scheduled,
        reportData,
        fileBuffers,
        exportFormats
      );
      if (emailResult.success) {
        console.log(`📧 Email sent successfully to ${scheduled.email_recipients.join(", ")}`);
      } else {
        console.warn(`⚠️  Email sending failed: ${emailResult.error}`);
      }
    } catch (error) {
      console.error(`❌ Error sending email for scheduled report ${scheduled.id}:`, error);
      // Don't fail the whole process if email fails
    }
  }

  // Calculate next run time
  const nextRunAt = calculateNextRunAt(scheduled.frequency, scheduled.schedule_config);

  // Update scheduled report
  await sequelize.query(`
    UPDATE scheduled_reports
    SET last_run_at = NOW(),
        next_run_at = $1,
        updated_at = NOW()
    WHERE id = $2::uuid
  `, {
    bind: [nextRunAt, scheduled.id],
  });

  console.log(`✅ Scheduled report ${scheduled.name} processed successfully. Next run: ${nextRunAt}`);
}


/**
 * Calculate next run time based on frequency
 */
function calculateNextRunAt(frequency, scheduleConfig = {}) {
  const now = new Date();
  const nextRun = new Date(now);

  switch (frequency) {
    case "daily":
      const time = scheduleConfig.time || "09:00";
      const [hours, minutes] = time.split(":").map(Number);
      nextRun.setHours(hours, minutes, 0, 0);
      if (nextRun <= now) {
        nextRun.setDate(nextRun.getDate() + 1);
      }
      break;

    case "weekly":
      const dayOfWeek = scheduleConfig.dayOfWeek !== undefined ? scheduleConfig.dayOfWeek : 1;
      const timeWeekly = scheduleConfig.time || "09:00";
      const [hoursWeekly, minutesWeekly] = timeWeekly.split(":").map(Number);
      nextRun.setHours(hoursWeekly, minutesWeekly, 0, 0);
      
      const currentDay = nextRun.getDay();
      let daysUntilNext = (dayOfWeek - currentDay + 7) % 7;
      if (daysUntilNext === 0 && nextRun <= now) {
        daysUntilNext = 7;
      }
      nextRun.setDate(nextRun.getDate() + daysUntilNext);
      break;

    case "monthly":
      const dayOfMonth = scheduleConfig.dayOfMonth !== undefined ? scheduleConfig.dayOfMonth : 1;
      const timeMonthly = scheduleConfig.time || "09:00";
      const [hoursMonthly, minutesMonthly] = timeMonthly.split(":").map(Number);
      nextRun.setDate(dayOfMonth);
      nextRun.setHours(hoursMonthly, minutesMonthly, 0, 0);
      if (nextRun <= now) {
        nextRun.setMonth(nextRun.getMonth() + 1);
      }
      break;

    default:
      nextRun.setHours(9, 0, 0, 0);
      if (nextRun <= now) {
        nextRun.setDate(nextRun.getDate() + 1);
      }
  }

  return nextRun;
}

module.exports = {
  processScheduledReports,
  processScheduledReport,
  calculateNextRunAt,
};
