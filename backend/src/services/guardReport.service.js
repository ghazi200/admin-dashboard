/**
 * Guard Report Service
 * Fetches full report data for a guard and builds PDF (for AI Agent 24 and export).
 */

const { Op } = require("sequelize");

/**
 * Fetch full report data for a guard (for chat summary and PDF).
 * @param {string} guardId - Guard UUID
 * @param {string} tenantId - Tenant UUID (for scoping)
 * @param {Object} models - Sequelize models
 * @returns {Promise<Object>} Report data { guard, tenant, shifts, incidents, callouts, ... }
 */
async function getGuardReportData(guardId, tenantId, models) {
  const { Guard, Tenant, Shift, Incident, CallOut, ScheduleConfig, sequelize } = models;
  if (!Guard || !guardId) return null;

  const guard = await Guard.findByPk(guardId, {
    attributes: ["id", "name", "email", "phone", "tenant_id", "weekly_hours", "acceptance_rate", "reliability_score", "created_at"],
  });
  if (!guard) return null;

  const guardJson = guard.toJSON ? guard.toJSON() : guard;
  const tid = tenantId || guardJson.tenant_id;

  let tenant = null;
  if (tid && Tenant) {
    tenant = await Tenant.findByPk(tid, { attributes: ["id", "name", "domain"] });
  }
  const tenantJson = tenant ? (tenant.toJSON ? tenant.toJSON() : tenant) : null;

  // Pay rate (optional column – may not exist on guards table; try pay_rate or hourly_rate)
  let payRate = null;
  if (sequelize) {
    for (const col of ["pay_rate", "hourly_rate"]) {
      try {
        const [payRows] = await sequelize.query(
          `SELECT ${col} FROM guards WHERE id = :guardId LIMIT 1`,
          { replacements: { guardId }, type: sequelize.QueryTypes.SELECT }
        );
        const val = payRows && payRows[0] ? payRows[0][col] : null;
        if (val != null && val !== "") {
          payRate = val;
          break;
        }
      } catch (e) {
        continue;
      }
    }
  }
  guardJson.pay_rate = payRate;

  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const sinceStr = since.toISOString().split("T")[0];
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const todayStr = `${y}-${m}-${d}`;
  const scheduleEnd = new Date(now);
  scheduleEnd.setDate(scheduleEnd.getDate() + 30);
  const scheduleEndStr = `${scheduleEnd.getFullYear()}-${String(scheduleEnd.getMonth() + 1).padStart(2, "0")}-${String(scheduleEnd.getDate()).padStart(2, "0")}`;

  let shifts = [];
  if (Shift) {
    const shiftRows = await Shift.findAll({
      where: {
        guard_id: guardId,
        ...(tid ? { tenant_id: tid } : {}),
        shift_date: { [Op.gte]: since.toISOString().split("T")[0] },
      },
      order: [["shift_date", "DESC"], ["shift_start", "DESC"]],
      limit: 50,
      raw: true,
    });
    shifts = shiftRows;
  }

  // Late clock-ins: shifts marked running late for this guard
  let lateClockIns = [];
  if (sequelize && Shift) {
    try {
      const [lateRows] = await sequelize.query(
        `
        SELECT s.id, s.shift_date, s.shift_start, s.shift_end, s.location, s.ai_decision
        FROM shifts s
        WHERE s.guard_id = :guardId
          AND s.ai_decision->>'running_late' = 'true'
        ORDER BY (s.ai_decision->>'marked_late_at') DESC NULLS LAST
        LIMIT 20
        `,
        { replacements: { guardId }, type: sequelize.QueryTypes.SELECT }
      );
      lateClockIns = Array.isArray(lateRows) ? lateRows : [];
    } catch (e) {
      lateClockIns = [];
    }
  }

  // Unique locations where guard works (from shifts)
  const locations = [...new Set((shifts || []).map((s) => s.location).filter(Boolean))];

  // Overtime hours worked (last 30 days) from time_entries + shifts
  let overtimeHoursTotal = 0;
  if (sequelize) {
    try {
      const [otRows] = await sequelize.query(
        `
        SELECT 
          s.shift_date,
          CASE 
            WHEN te.clock_in_at IS NOT NULL AND te.clock_out_at IS NOT NULL 
            THEN EXTRACT(EPOCH FROM (te.clock_out_at - te.clock_in_at)) / 3600
            WHEN s.shift_start IS NOT NULL AND s.shift_end IS NOT NULL
            THEN EXTRACT(EPOCH FROM (
              (s.shift_date::date + s.shift_end::time)::timestamp - 
              (s.shift_date::date + s.shift_start::time)::timestamp
            )) / 3600
            ELSE NULL
          END as hours_worked
        FROM shifts s
        LEFT JOIN time_entries te ON s.id = te.shift_id
        WHERE s.guard_id = :guardId
          AND s.shift_date >= :sinceStr
        `,
        { replacements: { guardId, sinceStr }, type: sequelize.QueryTypes.SELECT }
      );
      const rows = Array.isArray(otRows) ? otRows : [];
      rows.forEach((r) => {
        const h = parseFloat(r.hours_worked) || 0;
        if (h > 12) overtimeHoursTotal += (h - 12) + 4; // double + OT
        else if (h > 8) overtimeHoursTotal += h - 8;
      });
      overtimeHoursTotal = Math.round(overtimeHoursTotal * 100) / 100;
    } catch (e) {
      overtimeHoursTotal = 0;
    }
  }

  // Full upcoming schedule (next 30 days, local date)
  let schedule = [];
  if (Shift) {
    const scheduleRows = await Shift.findAll({
      where: {
        guard_id: guardId,
        ...(tid ? { tenant_id: tid } : {}),
        shift_date: { [Op.gte]: todayStr, [Op.lte]: scheduleEndStr },
      },
      order: [["shift_date", "ASC"], ["shift_start", "ASC"]],
      limit: 100,
      raw: true,
    });
    schedule = scheduleRows || [];
  }

  // Weekly shift days from scheduling page (ScheduleConfig template)
  const dayOrder = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  let weeklyShiftDays = [];
  if (ScheduleConfig && guardJson.name) {
    try {
      let config = tid
        ? await ScheduleConfig.findOne({ where: { tenantId: tid }, order: [["createdAt", "DESC"]], attributes: ["scheduleTemplate"] })
        : null;
      if (!config) config = await ScheduleConfig.findOne({ order: [["createdAt", "DESC"]], attributes: ["scheduleTemplate"] });
      const template = config?.scheduleTemplate ?? config?.schedule_template;
      const arr = Array.isArray(template) ? template : [];
      const guardName = (guardJson.name || "").trim();
      dayOrder.forEach((dayName) => {
        const templateDay = arr.find((d) => (d.day || "").trim() === dayName);
        if (!templateDay || !Array.isArray(templateDay.shifts)) {
          weeklyShiftDays.push({ day: dayName, off: true });
          return;
        }
        const guardShift = templateDay.shifts.find(
          (s) => (s.scheduledGuard || "").trim().toLowerCase() === guardName.toLowerCase()
        );
        if (!guardShift) {
          weeklyShiftDays.push({ day: dayName, off: true });
          return;
        }
        const start = guardShift.start || guardShift.time?.split("-")[0]?.trim() || "";
        const end = guardShift.end || guardShift.time?.split("-")[1]?.trim() || "";
        const formatTime = (t) => {
          if (!t) return "";
          const s = String(t).trim();
          if (s.length <= 5 && /^\d{1,2}:\d{2}$/.test(s)) {
            const [h, m] = s.split(":").map(Number);
            const h12 = h % 12 || 12;
            return m === 0 ? `${h12}` : `${h12}:${String(m).padStart(2, "0")}`;
          }
          return s;
        };
        weeklyShiftDays.push({
          day: dayName,
          off: false,
          start,
          end,
          timeLabel: [formatTime(start), formatTime(end)].filter(Boolean).join("–") || `${start}–${end}`,
        });
      });
    } catch (e) {
      weeklyShiftDays = [];
    }
  }

  let incidents = [];
  if (Incident) {
    const incidentRows = await Incident.findAll({
      where: { guard_id: guardId },
      order: [["reportedAt", "DESC"]],
      limit: 20,
      raw: true,
    });
    incidents = incidentRows;
  }

  let callouts = [];
  if (CallOut) {
    const calloutRows = await CallOut.findAll({
      where: {
        guard_id: guardId,
        created_at: { [Op.gte]: since },
      },
      order: [["created_at", "DESC"]],
      limit: 20,
      raw: true,
    });
    callouts = calloutRows;
  }

  return {
    guard: guardJson,
    tenant: tenantJson,
    shifts,
    incidents,
    callouts,
    lateClockIns,
    locations,
    overtimeHoursTotal,
    schedule,
    weeklyShiftDays,
    generatedAt: new Date().toISOString(),
    periodDays: 30,
  };
}

/**
 * Build PDF buffer for guard report (Option C: used by export endpoint).
 * @param {Object} reportData - From getGuardReportData
 * @returns {Promise<Buffer>}
 */
async function buildGuardReportPDF(reportData) {
  const PDFDocument = require("pdfkit");
  const doc = new PDFDocument({ margin: 50, size: "A4" });
  const chunks = [];

  doc.on("data", (chunk) => chunks.push(chunk));

  return new Promise((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const guard = reportData.guard || {};
    const tenant = reportData.tenant || {};
    const guardName = guard.name || "Unknown Guard";
    const tenantName = tenant.name || "Unknown Tenant";

    doc.fontSize(20).font("Helvetica-Bold").text(`Guard Report: ${guardName}`, { align: "center" });
    doc.moveDown(0.5);
    doc.fontSize(10).font("Helvetica").fillColor("gray");
    doc.text(`Tenant: ${tenantName}  |  Generated: ${new Date(reportData.generatedAt).toLocaleString()}`, { align: "center" });
    doc.fillColor("black");
    doc.moveDown(1.5);

    doc.fontSize(14).font("Helvetica-Bold").text("Profile", { underline: true });
    doc.fontSize(10).font("Helvetica");
    doc.text(`Name: ${guard.name || "—"}`);
    doc.text(`Email: ${guard.email || "—"}`);
    doc.text(`Phone: ${guard.phone || "—"}`);
    if (guard.weekly_hours != null) doc.text(`Weekly hours: ${guard.weekly_hours}`);
    doc.text(`Pay rate: ${guard.pay_rate != null && guard.pay_rate !== "" ? guard.pay_rate : "—"}`);
    doc.moveDown(0.5);

    doc.fontSize(12).font("Helvetica-Bold").text("Overtime hours worked (last 30 days)", { underline: true });
    doc.fontSize(10).font("Helvetica");
    doc.text(`${reportData.overtimeHoursTotal != null ? reportData.overtimeHoursTotal : 0} hours`);
    doc.moveDown(0.5);

    if (reportData.weeklyShiftDays && reportData.weeklyShiftDays.length > 0) {
      doc.fontSize(12).font("Helvetica-Bold").text("Weekly schedule (from scheduling page)", { underline: true });
      doc.fontSize(10).font("Helvetica");
      reportData.weeklyShiftDays.forEach((w) => {
        if (w.off) doc.text(`• ${w.day}: off`);
        else doc.text(`• ${w.day}: ${w.timeLabel || `${w.start}–${w.end}`}`);
      });
      doc.moveDown(0.5);
    }

    doc.fontSize(12).font("Helvetica-Bold").text("Upcoming shifts (next 30 days)", { underline: true });
    doc.fontSize(10).font("Helvetica");
    if (reportData.schedule && reportData.schedule.length > 0) {
      reportData.schedule.forEach((s) => {
        const d = s.shift_date ? new Date(s.shift_date).toLocaleDateString() : "—";
        const loc = s.location || "—";
        const st = s.shift_start || ""; const en = s.shift_end || "";
        doc.text(`• ${d}  ${st}–${en}  |  ${loc}`);
      });
    } else {
      doc.text("No upcoming shifts.");
    }
    doc.moveDown(0.5);

    doc.fontSize(12).font("Helvetica-Bold").text("Rating", { underline: true });
    doc.fontSize(10).font("Helvetica");
    if (guard.reliability_score != null) doc.text(`Reliability score: ${guard.reliability_score}`);
    if (guard.acceptance_rate != null) doc.text(`Acceptance rate: ${guard.acceptance_rate}`);
    doc.moveDown(0.5);

    if (guard.created_at) {
      const start = new Date(guard.created_at);
      const now = new Date();
      const months = Math.max(0, Math.floor((now - start) / (30.44 * 24 * 60 * 60 * 1000)));
      const years = Math.floor(months / 12);
      const timeWithCompany = years >= 1 ? `${years} year(s) ${months % 12} month(s)` : `${months} month(s)`;
      doc.fontSize(12).font("Helvetica-Bold").text("Time with company", { underline: true });
      doc.fontSize(10).font("Helvetica");
      doc.text(`Since: ${start.toLocaleDateString()} (${timeWithCompany})`);
      doc.moveDown(0.5);
    }

    if (reportData.locations && reportData.locations.length > 0) {
      doc.fontSize(12).font("Helvetica-Bold").text("Locations worked", { underline: true });
      doc.fontSize(10).font("Helvetica");
      reportData.locations.slice(0, 15).forEach((loc) => doc.text(`• ${loc}`));
      if (reportData.locations.length > 15) doc.text(`... and ${reportData.locations.length - 15} more.`);
      doc.moveDown(0.5);
    }

    if (reportData.lateClockIns && reportData.lateClockIns.length > 0) {
      doc.fontSize(12).font("Helvetica-Bold").text("Late clock-ins (running late)", { underline: true });
      doc.fontSize(10).font("Helvetica");
      reportData.lateClockIns.slice(0, 10).forEach((s) => {
        const d = s.shift_date ? new Date(s.shift_date).toLocaleDateString() : "—";
        const loc = s.location || "—";
        let reason = "Running late";
        if (s.ai_decision) {
          const ad = typeof s.ai_decision === "string" ? (() => { try { return JSON.parse(s.ai_decision); } catch { return null; } })() : s.ai_decision;
          if (ad && ad.late_reason) reason = ad.late_reason;
        }
        doc.text(`• ${d} at ${loc}: ${reason}`);
      });
      if (reportData.lateClockIns.length > 10) doc.text(`... and ${reportData.lateClockIns.length - 10} more.`);
      doc.moveDown(0.5);
    }

    doc.fontSize(14).font("Helvetica-Bold").text(`Shifts (last ${reportData.periodDays} days)`, { underline: true });
    doc.fontSize(10).font("Helvetica");
    if (reportData.shifts.length === 0) {
      doc.text("No shifts in this period.");
    } else {
      reportData.shifts.slice(0, 15).forEach((s) => {
        const d = s.shift_date ? new Date(s.shift_date).toLocaleDateString() : "—";
        const loc = s.location || "—";
        const st = s.shift_start || ""; const en = s.shift_end || "";
        doc.text(`• ${d}  ${st}–${en}  |  Location: ${loc}`);
      });
      if (reportData.shifts.length > 15) doc.text(`... and ${reportData.shifts.length - 15} more.`);
    }
    doc.moveDown(1);

    doc.fontSize(14).font("Helvetica-Bold").text("Incidents", { underline: true });
    doc.fontSize(10).font("Helvetica");
    if (reportData.incidents.length === 0) {
      doc.text("No incidents.");
    } else {
      reportData.incidents.slice(0, 10).forEach((i) => {
        const d = i.reported_at ? new Date(i.reported_at).toLocaleDateString() : "—";
        doc.text(`• ${i.title || "Incident"} (${d}) ${i.type || ""}`);
      });
      if (reportData.incidents.length > 10) doc.text(`... and ${reportData.incidents.length - 10} more.`);
    }
    doc.moveDown(1);

    doc.fontSize(14).font("Helvetica-Bold").text("Callouts", { underline: true });
    doc.fontSize(10).font("Helvetica");
    if (reportData.callouts.length === 0) {
      doc.text("No callouts in this period.");
    } else {
      reportData.callouts.slice(0, 10).forEach((c) => {
        const d = c.created_at ? new Date(c.created_at).toLocaleDateString() : "—";
        doc.text(`• ${d} – ${c.reason || "No reason"}`);
      });
      if (reportData.callouts.length > 10) doc.text(`... and ${reportData.callouts.length - 10} more.`);
    }

    doc.fontSize(8).fillColor("gray").text("Generated by AI Agent 24 – Abe Guard Admin Dashboard", 50, doc.page.height - 50, { align: "center" });
    doc.end();
  });
}

module.exports = {
  getGuardReportData,
  buildGuardReportPDF,
};
