const { v4: uuidv4 } = require("uuid");
const reportBuilderService = require("../services/reportBuilder.service");
const reportExportService = require("../services/reportExport.service");

/**
 * GET /api/admin/reports/scheduled
 * List all scheduled reports for the current tenant
 */
exports.listScheduledReports = async (req, res) => {
  try {
    const { sequelize } = req.app.locals.models;
    const tenantId = req.admin?.tenant_id;

    let whereClause = "";
    const bindParams = [];

    if (tenantId) {
      whereClause = "WHERE tenant_id = $1::uuid";
      bindParams.push(tenantId);
    }

    const [scheduledReports] = await sequelize.query(`
      SELECT * FROM scheduled_reports
      ${whereClause}
      ORDER BY created_at DESC
    `, {
      bind: bindParams,
    });

    return res.json(scheduledReports);
  } catch (e) {
    console.error("listScheduledReports error:", e);
    return res.status(500).json({
      message: "Failed to list scheduled reports",
      error: e.message,
    });
  }
};

/**
 * POST /api/admin/reports/scheduled
 * Create a new scheduled report
 */
exports.createScheduledReport = async (req, res) => {
  try {
    const { sequelize } = req.app.locals.models;
    const { templateId, name, frequency, scheduleConfig, emailRecipients, emailSubject, emailMessage, exportFormat } = req.body;
    const tenantId = req.admin?.tenant_id;

    if (!templateId || !name || !frequency) {
      return res.status(400).json({
        message: "templateId, name, and frequency are required",
      });
    }

    // Validate template exists
    const [templateCheck] = await sequelize.query(`
      SELECT id FROM report_templates WHERE id = $1::uuid LIMIT 1
    `, {
      bind: [templateId],
    });

    if (!templateCheck || templateCheck.length === 0) {
      return res.status(404).json({ message: "Template not found" });
    }

    // Calculate next_run_at based on frequency
    const nextRunAt = calculateNextRunAt(frequency, scheduleConfig);

    const scheduledId = uuidv4();
    const [result] = await sequelize.query(`
      INSERT INTO scheduled_reports (
        id, tenant_id, template_id, name, frequency, schedule_config,
        email_recipients, email_subject, email_message, export_format,
        is_active, next_run_at, created_at
      )
      VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6::jsonb, $7::text[], $8, $9, $10, $11, $12, NOW())
      RETURNING *
    `, {
      bind: [
        scheduledId,
        tenantId,
        templateId,
        name,
        frequency,
        JSON.stringify(scheduleConfig || {}),
        emailRecipients || [], // Array, not JSON string
        emailSubject || null,
        emailMessage || null,
        exportFormat || "pdf",
        true,
        nextRunAt,
      ],
    });

    return res.status(201).json(result[0]);
  } catch (e) {
    console.error("createScheduledReport error:", e);
    return res.status(500).json({
      message: "Failed to create scheduled report",
      error: e.message,
    });
  }
};

/**
 * PUT /api/admin/reports/scheduled/:id
 * Update a scheduled report
 */
exports.updateScheduledReport = async (req, res) => {
  try {
    const { sequelize } = req.app.locals.models;
    const scheduledId = req.params.id;
    const updates = req.body;

    // Check if exists
    const [existing] = await sequelize.query(`
      SELECT * FROM scheduled_reports WHERE id = $1::uuid LIMIT 1
    `, {
      bind: [scheduledId],
    });

    if (!existing || existing.length === 0) {
      return res.status(404).json({ message: "Scheduled report not found" });
    }

    // Build update query
    const updateFields = [];
    const bindParams = [];
    let paramIndex = 1;

    if (updates.name !== undefined) {
      updateFields.push(`name = $${paramIndex}`);
      bindParams.push(updates.name);
      paramIndex++;
    }

    if (updates.frequency !== undefined) {
      updateFields.push(`frequency = $${paramIndex}`);
      bindParams.push(updates.frequency);
      paramIndex++;
    }

    if (updates.scheduleConfig !== undefined) {
      updateFields.push(`schedule_config = $${paramIndex}::jsonb`);
      bindParams.push(JSON.stringify(updates.scheduleConfig));
      paramIndex++;
    }

    if (updates.emailRecipients !== undefined) {
      updateFields.push(`email_recipients = $${paramIndex}::jsonb`);
      bindParams.push(JSON.stringify(updates.emailRecipients));
      paramIndex++;
    }

    if (updates.emailSubject !== undefined) {
      updateFields.push(`email_subject = $${paramIndex}`);
      bindParams.push(updates.emailSubject);
      paramIndex++;
    }

    if (updates.emailMessage !== undefined) {
      updateFields.push(`email_message = $${paramIndex}`);
      bindParams.push(updates.emailMessage);
      paramIndex++;
    }

    if (updates.exportFormat !== undefined) {
      updateFields.push(`export_format = $${paramIndex}`);
      bindParams.push(updates.exportFormat);
      paramIndex++;
    }

    if (updates.isActive !== undefined) {
      updateFields.push(`is_active = $${paramIndex}`);
      bindParams.push(updates.isActive);
      paramIndex++;
    }

    // Recalculate next_run_at if frequency or scheduleConfig changed
    if (updates.frequency !== undefined || updates.scheduleConfig !== undefined) {
      const frequency = updates.frequency || existing[0].frequency;
      const scheduleConfig = updates.scheduleConfig || existing[0].schedule_config;
      const nextRunAt = calculateNextRunAt(frequency, scheduleConfig);
      updateFields.push(`next_run_at = $${paramIndex}`);
      bindParams.push(nextRunAt);
      paramIndex++;
    }

    if (updateFields.length === 0) {
      return res.status(400).json({ message: "No valid fields to update" });
    }

    updateFields.push(`updated_at = NOW()`);
    bindParams.push(scheduledId);

    const query = `
      UPDATE scheduled_reports
      SET ${updateFields.join(", ")}
      WHERE id = $${paramIndex}::uuid
      RETURNING *
    `;

    const [result] = await sequelize.query(query, {
      bind: bindParams,
    });

    return res.json(result[0]);
  } catch (e) {
    console.error("updateScheduledReport error:", e);
    return res.status(500).json({
      message: "Failed to update scheduled report",
      error: e.message,
    });
  }
};

/**
 * DELETE /api/admin/reports/scheduled/:id
 * Delete a scheduled report
 */
exports.deleteScheduledReport = async (req, res) => {
  try {
    const { sequelize } = req.app.locals.models;
    const scheduledId = req.params.id;

    const [result] = await sequelize.query(`
      DELETE FROM scheduled_reports
      WHERE id = $1::uuid
      RETURNING id
    `, {
      bind: [scheduledId],
    });

    if (!result || result.length === 0) {
      return res.status(404).json({ message: "Scheduled report not found" });
    }

    return res.json({ message: "Scheduled report deleted successfully" });
  } catch (e) {
    console.error("deleteScheduledReport error:", e);
    return res.status(500).json({
      message: "Failed to delete scheduled report",
      error: e.message,
    });
  }
};

/**
 * POST /api/admin/reports/scheduled/:id/run-now
 * Manually trigger a scheduled report
 */
exports.runScheduledReportNow = async (req, res) => {
  try {
    const { sequelize, ReportTemplate, ReportRun } = req.app.locals.models;
    const scheduledId = req.params.id;
    const tenantId = req.admin?.tenant_id;

    // Get scheduled report
    const [scheduled] = await sequelize.query(`
      SELECT * FROM scheduled_reports WHERE id = $1::uuid LIMIT 1
    `, {
      bind: [scheduledId],
    });

    if (!scheduled || scheduled.length === 0) {
      return res.status(404).json({ message: "Scheduled report not found" });
    }

    const scheduledReport = scheduled[0];

    // Get template
    const template = await ReportTemplate.findByPk(scheduledReport.template_id);
    if (!template) {
      return res.status(404).json({ message: "Template not found" });
    }

    // Generate report
    const reportData = await reportBuilderService.generateReportData(
      template,
      req.app.locals.models,
      {
        tenantId,
        dateRange: "last_7_days", // Default, can be customized
      }
    );

    // Save report run
    const reportRun = await ReportRun.create({
      id: uuidv4(),
      tenant_id: tenantId,
      template_id: scheduledReport.template_id,
      scheduled_report_id: scheduledId,
      report_data: reportData,
      status: "completed",
      formats: [scheduledReport.export_format || "pdf"],
      generated_by: null,
      generated_at: new Date(),
    });

    // TODO: Send email if emailRecipients configured
    // This will be implemented in the cron job service

    return res.json({
      message: "Report generated successfully",
      reportId: reportRun.id,
      data: reportData,
    });
  } catch (e) {
    console.error("runScheduledReportNow error:", e);
    return res.status(500).json({
      message: "Failed to run scheduled report",
      error: e.message,
    });
  }
};

/**
 * Helper function to calculate next_run_at based on frequency
 */
function calculateNextRunAt(frequency, scheduleConfig = {}) {
  const now = new Date();
  const nextRun = new Date(now);

  switch (frequency) {
    case "daily":
      // Run at specified time (default 9:00 AM)
      const time = scheduleConfig.time || "09:00";
      const [hours, minutes] = time.split(":").map(Number);
      nextRun.setHours(hours, minutes, 0, 0);
      if (nextRun <= now) {
        nextRun.setDate(nextRun.getDate() + 1);
      }
      break;

    case "weekly":
      // Run on specified day of week (0 = Sunday, 1 = Monday, etc.)
      const dayOfWeek = scheduleConfig.dayOfWeek !== undefined ? scheduleConfig.dayOfWeek : 1; // Monday
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
      // Run on specified day of month (default 1st)
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
      // Default to daily at 9 AM
      nextRun.setHours(9, 0, 0, 0);
      if (nextRun <= now) {
        nextRun.setDate(nextRun.getDate() + 1);
      }
  }

  return nextRun;
}
