/**
 * Report Builder Controller
 * Handles API endpoints for report management
 */

const reportBuilderService = require("../services/reportBuilder.service");
const { v4: uuidv4 } = require("uuid");

/**
 * GET /api/admin/reports/templates
 * List all report templates
 */
exports.listTemplates = async (req, res) => {
  try {
    const { sequelize, ReportTemplate } = req.app.locals.models;
    const { tenantId } = req.query;
    const adminId = req.admin?.id;
    const currentTenantId = req.admin?.tenant_id || tenantId;

    // Use raw SQL to handle UUID comparisons properly
    let query = `
      SELECT * FROM report_templates
      WHERE (
        is_public = true
    `;

    const bindParams = [];

    // Add tenant filter
    if (currentTenantId) {
      query += ` OR tenant_id = $${bindParams.length + 1}::uuid`;
      bindParams.push(currentTenantId);
    } else {
      query += ` OR tenant_id IS NULL`;
    }

    // Add user's templates (cast to text for comparison)
    if (adminId) {
      const adminIdStr = String(adminId);
      query += ` OR created_by::text = $${bindParams.length + 1}::text`;
      bindParams.push(adminIdStr);
    }

    query += `) ORDER BY created_at DESC`;

    const [templates] = await sequelize.query(query, {
      bind: bindParams,
    });

    return res.json(templates);
  } catch (e) {
    console.error("listTemplates error:", e);
    return res.status(500).json({
      message: "Failed to list templates",
      error: e.message,
    });
  }
};

/**
 * GET /api/admin/reports/templates/:id
 * Get a specific template
 */
exports.getTemplate = async (req, res) => {
  try {
    const { ReportTemplate } = req.app.locals.models;
    const templateId = req.params.id;

    const template = await ReportTemplate.findByPk(templateId);

    if (!template) {
      return res.status(404).json({ message: "Template not found" });
    }

    return res.json(template);
  } catch (e) {
    console.error("getTemplate error:", e);
    return res.status(500).json({
      message: "Failed to get template",
      error: e.message,
    });
  }
};

/**
 * POST /api/admin/reports/templates
 * Create a new report template
 */
exports.createTemplate = async (req, res) => {
  try {
    const { sequelize, ReportTemplate } = req.app.locals.models;
    const { name, description, widgets, settings, category, is_public } = req.body;
    const adminId = req.admin?.id;
    const tenantId = req.admin?.tenant_id;

    if (!name || !widgets || !Array.isArray(widgets)) {
      return res.status(400).json({
        message: "Name and widgets array are required",
      });
    }

    // Use raw SQL to handle UUID properly
    const templateId = uuidv4();
    // Admin ID is INTEGER (default Sequelize primary key), but created_by is UUID
    // Since created_by allows NULL, we'll set it to null for integer admin IDs
    // This is a design decision: we can't convert integer to UUID, so we store null
    const adminIdUuid = null; // Admin.id is INTEGER, created_by is UUID - set to null
    const tenantIdStr = tenantId ? String(tenantId) : null;

    // Build the query with conditional created_by handling
    const [result] = await sequelize.query(`
      INSERT INTO report_templates (
        id, tenant_id, name, description, category, widgets, settings, 
        is_public, is_default, created_by, created_at
      )
      VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6::jsonb, $7::jsonb, $8, $9, NULL, NOW())
      RETURNING *
    `, {
      bind: [
        templateId,
        tenantIdStr,
        name,
        description || null,
        category || "custom",
        JSON.stringify(widgets),
        JSON.stringify(settings || {}),
        is_public || false,
        false,
        // Note: created_by is set to NULL in SQL directly since adminId is INTEGER, not UUID
      ],
    });

    const template = result[0];

    return res.status(201).json(template);
  } catch (e) {
    console.error("createTemplate error:", e);
    return res.status(500).json({
      message: "Failed to create template",
      error: e.message,
    });
  }
};

/**
 * PUT /api/admin/reports/templates/:id
 * Update a report template
 */
exports.updateTemplate = async (req, res) => {
  try {
    const { sequelize, ReportTemplate } = req.app.locals.models;
    const templateId = req.params.id;
    const updates = req.body;

    // Check if template exists
    const [existing] = await sequelize.query(`
      SELECT * FROM report_templates WHERE id = $1::uuid LIMIT 1
    `, {
      bind: [templateId]
    });

    if (!existing || existing.length === 0) {
      return res.status(404).json({ message: "Template not found" });
    }

    // Build update query dynamically
    const updateFields = [];
    const bindParams = [];
    let paramIndex = 1;

    if (updates.name !== undefined) {
      updateFields.push(`name = $${paramIndex}`);
      bindParams.push(updates.name);
      paramIndex++;
    }

    if (updates.description !== undefined) {
      updateFields.push(`description = $${paramIndex}`);
      bindParams.push(updates.description);
      paramIndex++;
    }

    if (updates.widgets !== undefined) {
      updateFields.push(`widgets = $${paramIndex}::jsonb`);
      bindParams.push(JSON.stringify(updates.widgets));
      paramIndex++;
    }

    if (updates.settings !== undefined) {
      updateFields.push(`settings = $${paramIndex}::jsonb`);
      bindParams.push(JSON.stringify(updates.settings || {}));
      paramIndex++;
    }

    if (updates.category !== undefined) {
      updateFields.push(`category = $${paramIndex}`);
      bindParams.push(updates.category);
      paramIndex++;
    }

    if (updates.is_public !== undefined) {
      updateFields.push(`is_public = $${paramIndex}`);
      bindParams.push(updates.is_public);
      paramIndex++;
    }

    if (updateFields.length === 0) {
      return res.status(400).json({ message: "No valid fields to update" });
    }

    updateFields.push(`updated_at = NOW()`);
    bindParams.push(templateId);

    const query = `
      UPDATE report_templates
      SET ${updateFields.join(", ")}
      WHERE id = $${paramIndex}::uuid
      RETURNING *
    `;

    const [result] = await sequelize.query(query, {
      bind: bindParams,
    });

    return res.json(result[0]);
  } catch (e) {
    console.error("updateTemplate error:", e);
    return res.status(500).json({
      message: "Failed to update template",
      error: e.message,
    });
  }
};

/**
 * DELETE /api/admin/reports/templates/:id
 * Delete a report template
 */
exports.deleteTemplate = async (req, res) => {
  try {
    const { ReportTemplate } = req.app.locals.models;
    const templateId = req.params.id;

    const template = await ReportTemplate.findByPk(templateId);

    if (!template) {
      return res.status(404).json({ message: "Template not found" });
    }

    await template.destroy();

    return res.json({ message: "Template deleted successfully" });
  } catch (e) {
    console.error("deleteTemplate error:", e);
    return res.status(500).json({
      message: "Failed to delete template",
      error: e.message,
    });
  }
};

/**
 * POST /api/admin/reports/generate
 * Generate a report from a template
 */
exports.generateReport = async (req, res) => {
  try {
    const { ReportTemplate, ReportRun } = req.app.locals.models;
    const { templateId, dateRange, filters } = req.body;
    const adminId = req.admin?.id;
    const tenantId = req.admin?.tenant_id;

    if (!templateId) {
      return res.status(400).json({ message: "templateId is required" });
    }

    const template = await ReportTemplate.findByPk(templateId);

    if (!template) {
      return res.status(404).json({ message: "Template not found" });
    }

    // Generate report data
    const reportData = await reportBuilderService.generateReportData(
      template,
      req.app.locals.models,
      {
        tenantId,
        dateRange,
        filters,
      }
    );

    // Save report run
    // Note: generated_by is UUID, but adminId is INTEGER - set to null
    const reportRun = await ReportRun.create({
      id: uuidv4(),
      tenant_id: tenantId,
      template_id: templateId,
      report_data: reportData,
      status: "completed",
      formats: [],
      generated_by: null, // Admin.id is INTEGER, generated_by is UUID - set to null
      generated_at: new Date(),
    });

    return res.json({
      reportId: reportRun.id,
      data: reportData,
      generatedAt: reportRun.generated_at,
    });
  } catch (e) {
    console.error("generateReport error:", e);
    return res.status(500).json({
      message: "Failed to generate report",
      error: e.message,
    });
  }
};

/**
 * GET /api/admin/reports/runs
 * List report runs (history)
 */
exports.listReportRuns = async (req, res) => {
  try {
    const { ReportRun } = req.app.locals.models;
    const tenantId = req.admin?.tenant_id;
    const limit = parseInt(req.query.limit || 50, 10);

    const runs = await ReportRun.findAll({
      where: {
        tenant_id: tenantId,
      },
      order: [["generated_at", "DESC"]],
      limit,
    });

    return res.json(runs);
  } catch (e) {
    console.error("listReportRuns error:", e);
    return res.status(500).json({
      message: "Failed to list report runs",
      error: e.message,
    });
  }
};

/**
 * GET /api/admin/reports/runs/:id
 * Get a specific report run
 */
exports.getReportRun = async (req, res) => {
  try {
    const { ReportRun } = req.app.locals.models;
    const runId = req.params.id;

    const run = await ReportRun.findByPk(runId);

    if (!run) {
      return res.status(404).json({ message: "Report run not found" });
    }

    return res.json(run);
  } catch (e) {
    console.error("getReportRun error:", e);
    return res.status(500).json({
      message: "Failed to get report run",
      error: e.message,
    });
  }
};

/**
 * GET /api/admin/reports/runs/:id/export
 * Export a report run to specified format
 */
exports.exportReport = async (req, res) => {
  try {
    const { ReportRun } = req.app.locals.models;
    const runId = req.params.id;
    const format = req.query.format || "pdf"; // pdf, excel, csv, html

    const run = await ReportRun.findByPk(runId);

    if (!run) {
      return res.status(404).json({ message: "Report run not found" });
    }

    const reportExportService = require("../services/reportExport.service");
    const reportData = run.report_data;

    let content;
    let contentType;
    let filename;

    switch (format.toLowerCase()) {
      case "pdf":
        content = await reportExportService.exportToPDF(reportData);
        contentType = "application/pdf";
        filename = `${run.id}.pdf`;
        break;

      case "excel":
      case "xlsx":
        content = await reportExportService.exportToExcel(reportData);
        contentType =
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
        filename = `${run.id}.xlsx`;
        break;

      case "csv":
        content = await reportExportService.exportToCSV(reportData);
        contentType = "text/csv";
        filename = `${run.id}.csv`;
        break;

      case "html":
        content = await reportExportService.exportToHTML(reportData);
        contentType = "text/html";
        filename = `${run.id}.html`;
        break;

      default:
        return res.status(400).json({
          message: `Unsupported format: ${format}. Supported: pdf, excel, csv, html`,
        });
    }

    // Update file paths in report run
    const filePaths = run.file_paths || {};
    filePaths[format] = `/exports/${filename}`;
    await run.update({
      file_paths: filePaths,
      formats: [...new Set([...(run.formats || []), format])],
    });

    // Set response headers
    res.setHeader("Content-Type", contentType);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${filename}"`
    );

    return res.send(content);
  } catch (e) {
    console.error("exportReport error:", e);
    return res.status(500).json({
      message: "Failed to export report",
      error: e.message,
    });
  }
};
