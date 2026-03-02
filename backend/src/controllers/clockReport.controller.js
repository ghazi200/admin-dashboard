/**
 * Clock Report API
 * GET /api/admin/clock-report — clock in/out report for the week (optional location filter)
 * GET /api/admin/clock-report/export — export as XLSX or CSV
 */

const { getTenantFilter } = require("../utils/tenantFilter");
const clockReportService = require("../services/clockReport.service");

/**
 * GET /api/admin/clock-report
 * Query: location (optional), weekStart (optional YYYY-MM-DD), weekEnd (optional YYYY-MM-DD)
 */
exports.getReport = async (req, res) => {
  try {
    const tenantId = getTenantFilter(req.admin);
    if (!tenantId) {
      return res.status(403).json({
        message: "Tenant context required. Sign in as admin or supervisor.",
      });
    }

    const location = req.query.location ? String(req.query.location).trim() : null;
    const weekStart = req.query.weekStart || null;
    const weekEnd = req.query.weekEnd || null;

    const report = await clockReportService.buildClockReport(
      {
        tenantId,
        location: location || undefined,
        weekStart: weekStart || undefined,
        weekEnd: weekEnd || undefined,
      },
      req.app.locals.models
    );

    if (report.error) {
      return res.status(400).json({ message: report.error });
    }

    return res.json({
      ok: true,
      data: report,
    });
  } catch (e) {
    console.error("clock-report getReport error:", e);
    return res.status(500).json({
      message: "Failed to generate clock report",
      error: e.message,
    });
  }
};

/**
 * GET /api/admin/clock-report/export
 * Query: format=xlsx|csv, location (optional), weekStart, weekEnd (optional)
 */
exports.exportReport = async (req, res) => {
  try {
    const tenantId = getTenantFilter(req.admin);
    if (!tenantId) {
      return res.status(403).json({ message: "Tenant context required." });
    }

    const format = (req.query.format || "xlsx").toLowerCase();
    const location = req.query.location ? String(req.query.location).trim() : null;
    const weekStart = req.query.weekStart || null;
    const weekEnd = req.query.weekEnd || null;

    const report = await clockReportService.buildClockReport(
      { tenantId, location: location || undefined, weekStart: weekStart || undefined, weekEnd: weekEnd || undefined },
      req.app.locals.models
    );

    if (report.error) {
      return res.status(400).json({ message: report.error });
    }

    const filenameBase = `clock-report-${report.weekStart}-to-${report.weekEnd}` + (location ? `-${location.replace(/\s+/g, "-")}` : "");

    if (format === "csv") {
      const rows = [];
      rows.push(["Clock In/Out Report", "", "", "", "", "", ""]);
      rows.push(["Week", `${report.weekStart} to ${report.weekEnd}`, "", "", "", "", ""]);
      rows.push([]);
      rows.push(["Location", "Guard", "Day", "Shift", "Clock In", "Break", "Clock Out", "Narrative"]);
      report.locations.forEach((loc) => {
        loc.narratives.forEach((n) => {
          rows.push([loc.location, n.guardName, n.dayName, n.shiftBand, n.clockIn, n.breakStart && n.breakEnd ? `${n.breakStart}-${n.breakEnd}` : "—", n.clockOut, n.text]);
        });
      });
      rows.push([]);
      rows.push(["Flags", "", "", "", "", "", ""]);
      rows.push(["Type", "Location", "Day", "Shift", "Guard(s)", "Message", "", ""]);
      report.locations.forEach((loc) => {
        loc.flags.forEach((f) => {
          rows.push([f.type, loc.location, f.dayName, f.shiftBand, f.guardName || (f.actualGuardName && f.scheduledGuardName ? `${f.actualGuardName}/${f.scheduledGuardName}` : "—"), f.message, "", ""]);
        });
      });
      rows.push([]);
      rows.push(["Summary", report.summary, "", "", "", "", ""]);
      rows.push(["Suggestions", "", "", "", "", "", ""]);
      (report.suggestions || []).forEach((s) => rows.push([s, "", "", "", "", "", ""]));
      const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${filenameBase}.csv"`);
      return res.send(csv);
    }

    // XLSX
    const XLSX = require("xlsx");
    const workbook = XLSX.utils.book_new();

    const summaryData = [
      ["Clock In/Out Report", ""],
      ["Week", `${report.weekStart} to ${report.weekEnd}`],
      ["Summary", report.summary],
      [],
      ["Suggestions", ""],
      ...(report.suggestions || []).map((s) => [s]),
    ];
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(summaryData), "Summary");

    const narrativeRows = [["Location", "Guard", "Day", "Shift", "Clock In", "Break Start", "Break End", "Clock Out", "Narrative"]];
    report.locations.forEach((loc) => {
      loc.narratives.forEach((n) => {
        narrativeRows.push([loc.location, n.guardName, n.dayName, n.shiftBand, n.clockIn, n.breakStart || "—", n.breakEnd || "—", n.clockOut, n.text]);
      });
    });
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(narrativeRows), "Narratives");

    const flagRows = [["Type", "Location", "Day", "Shift", "Guard/Message", "Message"]];
    report.locations.forEach((loc) => {
      loc.flags.forEach((f) => {
        flagRows.push([f.type, loc.location, f.dayName, f.shiftBand, f.guardName || "—", f.message]);
      });
    });
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(flagRows), "Flags");

    const otRows = [["Location", "Day", "Shift", "Guard", "Message"]];
    report.locations.forEach((loc) => {
      loc.otNotes.forEach((o) => {
        otRows.push([loc.location, o.dayName, o.shiftBand, o.guardName, o.message]);
      });
    });
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(otRows), "OT Notes");

    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${filenameBase}.xlsx"`);
    return res.send(buffer);
  } catch (e) {
    console.error("clock-report export error:", e);
    return res.status(500).json({ message: "Failed to export clock report", error: e.message });
  }
};
