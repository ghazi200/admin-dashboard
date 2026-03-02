/**
 * AI AGENT 24 Controller
 * Handles chat interactions, task execution, guard reports, and advanced search.
 */

const assistantService = require("../services/assistant.service");
const guardReportService = require("../services/guardReport.service");
const globalSearchService = require("../services/globalSearch.service");

/**
 * POST /api/admin/assistant/chat
 * Chat with AI AGENT 24 - supports Q&A and task execution
 */
exports.chat = async (req, res) => {
  try {
    const { message, history = [] } = req.body;
    const adminId = req.admin?.id;
    const adminRole = req.admin?.role || "admin";
    const permissions = req.admin?.permissions || [];

    if (!message || !message.trim()) {
      return res.status(400).json({
        ok: false,
        message: "Message is required",
      });
    }

    // Process chat message with context
    const result = await assistantService.processChatMessage(
      {
        message: message.trim(),
        history,
        adminId,
        adminRole,
        permissions,
        tenantId: req.admin?.tenant_id,
      },
      req.app.locals.models,
      req.app
    );

    return res.json({
      ok: true,
      response: result.response,
      answer: result.response, // Alias for compatibility
      citations: result.citations || [],
      actions: result.actions || [],
      data: result.data || null,
      confidence: result.confidence || null,
    });
  } catch (error) {
    console.error("Assistant chat error:", error);
    return res.status(500).json({
      ok: false,
      message: "Failed to process chat message",
      error: error.message,
    });
  }
};

/**
 * GET /api/admin/assistant/report/export-pdf?guardId=...&tenantId=...
 * Export guard report as PDF (Option C: regenerate on download).
 */
exports.exportGuardReportPDF = async (req, res) => {
  try {
    const guardId = req.query.guardId || req.body?.guardId;
    const tenantId = req.query.tenantId || req.body?.tenantId;
    const adminTenantId = req.admin?.tenant_id;

    if (!guardId) {
      return res.status(400).json({ ok: false, message: "guardId is required" });
    }

    const models = req.app.locals.models;
    const reportData = await guardReportService.getGuardReportData(guardId, tenantId || adminTenantId, models);
    if (!reportData || !reportData.guard) {
      return res.status(404).json({ ok: false, message: "Guard not found or no report data" });
    }

    const tenantScope = adminTenantId && reportData.guard.tenant_id && reportData.guard.tenant_id !== adminTenantId;
    if (req.admin?.role !== "super_admin" && tenantScope) {
      return res.status(403).json({ ok: false, message: "Access denied to that tenant" });
    }

    const pdfBuffer = await guardReportService.buildGuardReportPDF(reportData);
    const guardName = (reportData.guard.name || "guard").replace(/\s+/g, "-");
    const filename = `report-${guardName}-${new Date().toISOString().split("T")[0]}.pdf`;

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    return res.send(pdfBuffer);
  } catch (error) {
    console.error("Export guard report PDF error:", error);
    return res.status(500).json({
      ok: false,
      message: error.message || "Failed to export report as PDF",
    });
  }
};

// ===== ADVANCED SEARCH & FILTERS (#31) =====

/**
 * GET /api/admin/assistant/search?q=...&entityTypes=guard,shift&...
 */
exports.search = async (req, res) => {
  try {
    const q = (req.query.q || req.query.query || "").trim();
    const tenantId = req.admin?.tenant_id || null;
    const isSuperAdmin = req.admin?.role === "super_admin";
    let entityTypes = req.query.entityTypes;
    if (typeof entityTypes === "string") entityTypes = entityTypes.split(",").map((s) => s.trim().toLowerCase());
    const dateFrom = req.query.dateFrom || null;
    const dateTo = req.query.dateTo || null;
    const status = req.query.status || null;
    const active = req.query.active;
    const filters = {};
    if (dateFrom) filters.dateFrom = dateFrom;
    if (dateTo) filters.dateTo = dateTo;
    if (status) filters.status = status;
    if (active !== undefined && active !== "") filters.active = active === "true" || active === "1";

    const result = await globalSearchService.search(
      {
        query: q,
        tenantId,
        isSuperAdmin,
        entityTypes: entityTypes && entityTypes.length ? entityTypes : undefined,
        filters: Object.keys(filters).length ? filters : undefined,
      },
      req.app.locals.models
    );

    if (req.admin?.id && q) globalSearchService.addSearchHistory(req.admin.id, q, filters);

    return res.json({
      ok: true,
      data: result.results,
      totalByType: result.totalByType,
      query: result.query,
    });
  } catch (error) {
    console.error("Assistant search error:", error);
    return res.status(500).json({
      ok: false,
      message: error.message || "Search failed",
    });
  }
};

/**
 * GET /api/admin/assistant/search/history
 */
exports.searchHistory = async (req, res) => {
  try {
    const adminId = req.admin?.id;
    const list = globalSearchService.getSearchHistory(adminId);
    return res.json({ ok: true, data: list });
  } catch (error) {
    return res.status(500).json({ ok: false, message: error.message || "Failed to get history" });
  }
};

/**
 * GET /api/admin/assistant/saved-searches
 */
exports.getSavedSearches = async (req, res) => {
  try {
    const { SavedSearch } = req.app.locals.models;
    const list = await SavedSearch.findAll({
      where: { admin_id: req.admin.id },
      order: [["created_at", "DESC"]],
      attributes: ["id", "name", "query", "filters", "created_at"],
    });
    return res.json({ ok: true, data: list });
  } catch (error) {
    console.error("Get saved searches error:", error);
    return res.status(500).json({ ok: false, message: error.message || "Failed to get saved searches" });
  }
};

/**
 * POST /api/admin/assistant/saved-searches
 * Body: { name, query?, filters? }
 */
exports.createSavedSearch = async (req, res) => {
  try {
    const { name, query, filters } = req.body || {};
    if (!name || !name.trim()) {
      return res.status(400).json({ ok: false, message: "name is required" });
    }
    const { SavedSearch } = req.app.locals.models;
    const row = await SavedSearch.create({
      admin_id: req.admin.id,
      name: name.trim(),
      query: (query || "").trim() || null,
      filters: filters && typeof filters === "object" ? filters : {},
    });
    return res.status(201).json({ ok: true, data: row });
  } catch (error) {
    console.error("Create saved search error:", error);
    return res.status(500).json({ ok: false, message: error.message || "Failed to save search" });
  }
};

/**
 * DELETE /api/admin/assistant/saved-searches/:id
 */
exports.deleteSavedSearch = async (req, res) => {
  try {
    const { id } = req.params;
    const { SavedSearch } = req.app.locals.models;
    const row = await SavedSearch.findOne({ where: { id, admin_id: req.admin.id } });
    if (!row) return res.status(404).json({ ok: false, message: "Saved search not found" });
    await row.destroy();
    return res.json({ ok: true });
  } catch (error) {
    return res.status(500).json({ ok: false, message: error.message || "Failed to delete" });
  }
};
