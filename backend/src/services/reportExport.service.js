/**
 * Report Export Service
 * 
 * Handles exporting reports to various formats:
 * - PDF (using PDFKit)
 * - Excel (using xlsx)
 * - CSV
 * - HTML
 */

const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");
const { v4: uuidv4 } = require("uuid");

/**
 * Export report to PDF
 * @param {Object} reportData - Generated report data
 * @param {Object} options - Export options (title, logo, etc.)
 * @returns {Promise<Buffer>} PDF buffer
 */
async function exportToPDF(reportData, options = {}) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: "A4",
        margins: { top: 50, bottom: 50, left: 50, right: 50 },
      });

      const chunks = [];
      doc.on("data", (chunk) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      // Header
      doc.fontSize(20).font("Helvetica-Bold").text(reportData.templateName || reportData.title || "Report", {
        align: "center",
      });

      doc.moveDown(0.5);
      doc.fontSize(10).font("Helvetica").fillColor("gray");
      
      // Format date safely
      let generatedDate = "Unknown";
      try {
        if (reportData.generatedAt) {
          const date = new Date(reportData.generatedAt);
          if (!isNaN(date.getTime())) {
            generatedDate = date.toLocaleString();
          }
        }
      } catch (e) {
        generatedDate = new Date().toLocaleString();
      }
      
      doc.text(`Generated: ${generatedDate}`, { align: "center" });
      
      // Add period if available
      if (reportData.period) {
        let periodText = "";
        try {
          // Try different date property names
          const startDateStr = reportData.period.startDate || reportData.period.start || null;
          const endDateStr = reportData.period.endDate || reportData.period.end || null;
          
          if (startDateStr && endDateStr) {
            const startDate = new Date(startDateStr);
            const endDate = new Date(endDateStr);
            
            if (!isNaN(startDate.getTime()) && !isNaN(endDate.getTime())) {
              periodText = `Period: ${startDate.toLocaleDateString()} - ${endDate.toLocaleDateString()}`;
            }
          }
          
          // Fallback to dateRange string if dates don't parse
          if (!periodText && reportData.period.dateRange) {
            periodText = `Period: ${reportData.period.dateRange}`;
          }
        } catch (e) {
          // Skip period if error
          console.warn("Error formatting period:", e.message);
        }
        
        if (periodText) {
          doc.text(periodText, { align: "center" });
        }
      }

      doc.moveDown(1);
      doc.fillColor("black");

      // Process each widget
      for (const widget of reportData.widgets || []) {
        renderWidgetToPDF(doc, widget);
        doc.moveDown(1);
      }

      doc.end();
      
      // Add footer after document is finalized (simpler approach - skip for now)
      // Footer can be added in a post-processing step if needed
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Render a widget to PDF
 */
function renderWidgetToPDF(doc, widget) {
  // Ensure we start at the left margin
  const margin = 50;
  doc.x = margin;
  
  doc.fontSize(14).font("Helvetica-Bold");
  doc.text(widget.title || "Widget", { 
    x: margin,
    underline: true 
  });
  doc.moveDown(0.5);
  doc.fontSize(10).font("Helvetica");
  
  // Reset x position after title
  doc.x = margin;

  switch (widget.type) {
    case "kpi":
      if (widget.data) {
        const value = widget.data.value !== undefined ? widget.data.value : 0;
        const label = widget.config?.label || widget.data.label || widget.title || "KPI";
        const format = widget.config?.format || "number";

        let displayValue = value;
        if (format === "percentage") {
          displayValue = `${(value || 0).toFixed(2)}%`;
        } else if (format === "currency") {
          displayValue = `$${(value || 0).toFixed(2)}`;
        } else {
          displayValue = (value || 0).toLocaleString();
        }

        // Draw a box around the KPI for better visibility
        const kpiX = doc.x;
        const kpiY = doc.y;
        const kpiWidth = 200;
        const kpiHeight = 80;
        
        doc.rect(kpiX, kpiY, kpiWidth, kpiHeight).stroke();
        
        doc.fontSize(32).font("Helvetica-Bold").fillColor("#3b82f6");
        doc.text(displayValue, kpiX + 10, kpiY + 10, { width: kpiWidth - 20 });
        
        doc.fontSize(12).font("Helvetica").fillColor("#666");
        doc.text(label, kpiX + 10, kpiY + 50, { width: kpiWidth - 20 });
        
        doc.fillColor("black");
        doc.y = kpiY + kpiHeight + 10;
      } else {
        doc.text("No data available for this KPI");
      }
      break;

    case "chart":
      doc.fontSize(14).font("Helvetica-Bold");
      doc.text(`${widget.config?.chartType || "Bar"} Chart: ${widget.title || "Chart"}`);
      doc.moveDown(0.5);
      doc.fontSize(10).font("Helvetica");
      
      // Get chart data - check multiple possible structures
      let chartData = null;
      if (widget.data?.data && Array.isArray(widget.data.data)) {
        chartData = widget.data.data;
      } else if (widget.data && Array.isArray(widget.data)) {
        chartData = widget.data;
      } else if (widget.data?.chartData && Array.isArray(widget.data.chartData)) {
        chartData = widget.data.chartData;
      }
      
      if (chartData && chartData.length > 0) {
        // Draw a simple bar chart representation
        const maxValue = Math.max(...chartData.map(item => item.value || 0), 1);
        const barWidth = 400;
        const barHeight = 15;
        const spacing = 5;
        const margin = 50;
        
        // Ensure we're at the left margin
        doc.x = margin;
        
        chartData.slice(0, 10).forEach((item, index) => {
          const value = item.value || 0;
          const label = item.label || item.name || "N/A";
          const barLength = (value / maxValue) * barWidth;
          
          const yPos = doc.y;
          const xPos = margin;
          
          // Draw bar
          doc.rect(xPos, yPos, barLength, barHeight)
            .fillColor("#3b82f6")
            .fill()
            .stroke();
          
          // Label and value text
          doc.fillColor("black");
          doc.fontSize(9);
          const labelText = `${label}: ${value}`;
          doc.text(labelText, xPos + barLength + 10, yPos + 3, {
            width: 150,
          });
          
          doc.y = yPos + barHeight + spacing;
          doc.x = margin; // Reset x position
        });
      } else {
        // No data available - show message
        doc.text("No chart data available for this period.", {
          x: margin,
          width: doc.page.width - (margin * 2),
        });
        doc.moveDown(0.3);
        doc.fontSize(9).fillColor("gray");
        doc.text("This may be because there is no data in the selected date range.", {
          x: margin,
          width: doc.page.width - (margin * 2),
        });
      }
      break;

    case "table":
      if (widget.data?.rows && Array.isArray(widget.data.rows)) {
        const columns = widget.data.columns || [];
        const rows = widget.data.rows.slice(0, 20); // Limit for PDF

        // Table header
        doc.font("Helvetica-Bold");
        columns.forEach((col, idx) => {
          doc.text(col, { continued: idx < columns.length - 1 });
        });
        doc.moveDown(0.3);
        doc.font("Helvetica");

        // Table rows
        rows.forEach((row) => {
          columns.forEach((col, idx) => {
            const value = row[col] || "";
            doc.text(String(value).substring(0, 30), {
              continued: idx < columns.length - 1,
            });
          });
          doc.moveDown(0.3);
        });
      }
      break;

    case "text":
      if (widget.data?.content) {
        const text = String(widget.data.content || "").trim();
        doc.fontSize(11).font("Helvetica");
        
        // Calculate available width (page width minus margins)
        const pageWidth = doc.page.width;
        const margin = 50;
        const textWidth = pageWidth - (margin * 2);
        
        // Ensure we're at the left margin
        doc.x = margin;
        
        // Split text into paragraphs (double newlines)
        const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 0);
        
        if (paragraphs.length === 0) {
          // Single paragraph - render with proper word wrapping
          const cleanText = text.replace(/\n/g, " ").trim(); // Replace single newlines with spaces
          doc.text(cleanText, {
            x: margin,
            width: textWidth,
            align: "left",
            lineGap: 3,
          });
        } else {
          // Multiple paragraphs
          paragraphs.forEach((paragraph, index) => {
            if (index > 0) {
              doc.moveDown(0.5); // Space between paragraphs
            }
            
            // Clean paragraph - replace single newlines with spaces for proper wrapping
            const cleanParagraph = paragraph.replace(/\n/g, " ").trim();
            
            // Ensure we're at the left margin for each paragraph
            doc.x = margin;
            
            doc.text(cleanParagraph, {
              x: margin,
              width: textWidth,
              align: "left",
              lineGap: 3,
            });
          });
        }
      } else {
        doc.text("No content available", { x: margin });
      }
      break;

    default:
      doc.text(`Widget type: ${widget.type}`);
  }
}

/**
 * Export report to Excel
 * @param {Object} reportData - Generated report data
 * @param {Object} options - Export options
 * @returns {Promise<Buffer>} Excel buffer
 */
async function exportToExcel(reportData, options = {}) {
  try {
    const XLSX = require("xlsx");
    const workbook = XLSX.utils.book_new();

    // Summary sheet
    const summaryData = [
      ["Report Name", reportData.templateName || "Report"],
      ["Generated At", new Date(reportData.generatedAt).toLocaleString()],
      ["Period", (() => {
        try {
          const start = reportData.period?.startDate || reportData.period?.start;
          const end = reportData.period?.endDate || reportData.period?.end;
          if (start && end) {
            const startDate = new Date(start);
            const endDate = new Date(end);
            if (!isNaN(startDate.getTime()) && !isNaN(endDate.getTime())) {
              return `${startDate.toLocaleDateString()} to ${endDate.toLocaleDateString()}`;
            }
          }
          return reportData.period?.dateRange || "N/A";
        } catch (e) {
          return "N/A";
        }
      })()],
    ];
    const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(workbook, summarySheet, "Summary");

    // Create a sheet for each widget
    reportData.widgets?.forEach((widget, index) => {
      let sheetData = [];

      switch (widget.type) {
        case "kpi":
          sheetData = [
            [widget.title || "KPI"],
            ["Value", widget.data?.value || 0],
            ["Label", widget.data?.label || ""],
            ["Format", widget.config?.format || "number"],
          ];
          break;

        case "chart":
          if (widget.data?.data && Array.isArray(widget.data.data)) {
            sheetData = [
              [widget.title || "Chart"],
              ["Label", "Value"],
              ...widget.data.data.map((item) => [item.label || "", item.value || 0]),
            ];
          }
          break;

        case "table":
          if (widget.data?.rows && Array.isArray(widget.data.rows)) {
            const columns = widget.data.columns || [];
            sheetData = [
              [widget.title || "Table"],
              columns,
              ...widget.data.rows.map((row) =>
                columns.map((col) => row[col] || "")
              ),
            ];
          }
          break;

        case "text":
          sheetData = [
            [widget.title || "Text"],
            [widget.data?.content || ""],
          ];
          break;
      }

      if (sheetData.length > 0) {
        const sheet = XLSX.utils.aoa_to_sheet(sheetData);
        const sheetName = (widget.title || `Widget ${index + 1}`).substring(0, 31);
        XLSX.utils.book_append_sheet(workbook, sheet, sheetName);
      }
    });

    // Generate buffer
    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
    return buffer;
  } catch (error) {
    // If xlsx is not installed, return error
    if (error.code === "MODULE_NOT_FOUND") {
      throw new Error(
        "Excel export requires 'xlsx' package. Install with: npm install xlsx"
      );
    }
    throw error;
  }
}

/**
 * Export report to CSV
 * @param {Object} reportData - Generated report data
 * @param {Object} options - Export options
 * @returns {Promise<string>} CSV string
 */
async function exportToCSV(reportData, options = {}) {
  const lines = [];

  // Header
  lines.push(`Report: ${reportData.templateName || "Report"}`);
  lines.push(`Generated: ${new Date(reportData.generatedAt).toLocaleString()}`);
  lines.push("");

  // Process widgets
  reportData.widgets?.forEach((widget) => {
    lines.push(`=== ${widget.title || "Widget"} ===`);

    switch (widget.type) {
      case "kpi":
        lines.push("Metric,Value");
        lines.push(`${widget.data?.label || "Value"},${widget.data?.value || 0}`);
        break;

      case "chart":
        if (widget.data?.data && Array.isArray(widget.data.data)) {
          lines.push("Label,Value");
          widget.data.data.forEach((item) => {
            lines.push(`${item.label || ""},${item.value || 0}`);
          });
        }
        break;

      case "table":
        if (widget.data?.rows && Array.isArray(widget.data.rows)) {
          const columns = widget.data.columns || [];
          lines.push(columns.join(","));
          widget.data.rows.forEach((row) => {
            lines.push(
              columns.map((col) => `"${String(row[col] || "").replace(/"/g, '""')}"`).join(",")
            );
          });
        }
        break;

      case "text":
        lines.push(widget.data?.content || "");
        break;
    }

    lines.push("");
  });

  return lines.join("\n");
}

/**
 * Export report to HTML
 * @param {Object} reportData - Generated report data
 * @param {Object} options - Export options
 * @returns {Promise<string>} HTML string
 */
async function exportToHTML(reportData, options = {}) {
  let html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${reportData.templateName || "Report"}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 40px; background: #f5f5f5; }
    .container { background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
    h1 { color: #333; border-bottom: 3px solid #3b82f6; padding-bottom: 10px; }
    .meta { color: #666; font-size: 12px; margin-bottom: 30px; }
    .widget { margin-bottom: 40px; padding: 20px; background: #f9f9f9; border-radius: 6px; }
    .widget-title { font-size: 18px; font-weight: bold; color: #3b82f6; margin-bottom: 15px; }
    .kpi-value { font-size: 48px; font-weight: bold; color: #3b82f6; }
    .kpi-label { font-size: 14px; color: #666; margin-top: 5px; }
    table { width: 100%; border-collapse: collapse; margin-top: 10px; }
    th, td { padding: 10px; text-align: left; border-bottom: 1px solid #ddd; }
    th { background: #3b82f6; color: white; }
    tr:hover { background: #f5f5f5; }
    .chart-placeholder { padding: 40px; text-align: center; background: #e0e0e0; border-radius: 4px; }
  </style>
</head>
<body>
  <div class="container">
    <h1>${reportData.templateName || "Report"}</h1>
    <div class="meta">
      Generated: ${(() => {
        try {
          if (reportData.generatedAt) {
            const date = new Date(reportData.generatedAt);
            if (!isNaN(date.getTime())) {
              return date.toLocaleString();
            }
          }
          return new Date().toLocaleString();
        } catch (e) {
          return new Date().toLocaleString();
        }
      })()}<br>
      Period: ${(() => {
        try {
          const start = reportData.period?.startDate || reportData.period?.start;
          const end = reportData.period?.endDate || reportData.period?.end;
          if (start && end) {
            const startDate = new Date(start);
            const endDate = new Date(end);
            if (!isNaN(startDate.getTime()) && !isNaN(endDate.getTime())) {
              return `${startDate.toLocaleDateString()} to ${endDate.toLocaleDateString()}`;
            }
          }
          return reportData.period?.dateRange || "N/A";
        } catch (e) {
          return "N/A";
        }
      })()}
    </div>
`;

  // Render widgets
  reportData.widgets?.forEach((widget) => {
    html += `    <div class="widget">\n`;
    html += `      <div class="widget-title">${widget.title || "Widget"}</div>\n`;

    switch (widget.type) {
      case "kpi":
        if (widget.data) {
          const value = widget.data.value || 0;
          const format = widget.config?.format || "number";
          let displayValue = value;
          if (format === "percentage") {
            displayValue = `${value}%`;
          } else if (format === "currency") {
            displayValue = `$${value.toLocaleString()}`;
          } else {
            displayValue = value.toLocaleString();
          }
          html += `      <div class="kpi-value">${displayValue}</div>\n`;
          html += `      <div class="kpi-label">${widget.data.label || ""}</div>\n`;
        }
        break;

      case "chart":
        html += `      <div class="chart-placeholder">📊 ${widget.config?.chartType || "bar"} Chart</div>\n`;
        if (widget.data?.data && Array.isArray(widget.data.data)) {
          html += `      <table>\n`;
          html += `        <tr><th>Label</th><th>Value</th></tr>\n`;
          widget.data.data.slice(0, 20).forEach((item) => {
            html += `        <tr><td>${item.label || ""}</td><td>${item.value || 0}</td></tr>\n`;
          });
          html += `      </table>\n`;
        }
        break;

      case "table":
        if (widget.data?.rows && Array.isArray(widget.data.rows)) {
          const columns = widget.data.columns || [];
          html += `      <table>\n`;
          html += `        <tr>${columns.map((col) => `<th>${col}</th>`).join("")}</tr>\n`;
          widget.data.rows.forEach((row) => {
            html += `        <tr>${columns.map((col) => `<td>${row[col] || ""}</td>`).join("")}</tr>\n`;
          });
          html += `      </table>\n`;
        }
        break;

      case "text":
        if (widget.data?.content) {
          html += `      <div>${widget.data.content.replace(/\n/g, "<br>")}</div>\n`;
        }
        break;
    }

    html += `    </div>\n`;
  });

  html += `  </div>
</body>
</html>`;

  return html;
}

/**
 * Save exported file to disk
 * @param {Buffer|string} content - File content
 * @param {string} format - File format (pdf, xlsx, csv, html)
 * @param {string} reportId - Report ID for filename
 * @returns {Promise<string>} File path
 */
async function saveExportFile(content, format, reportId) {
  const exportsDir = path.join(__dirname, "../../exports");
  if (!fs.existsSync(exportsDir)) {
    fs.mkdirSync(exportsDir, { recursive: true });
  }

  const filename = `${reportId}.${format}`;
  const filepath = path.join(exportsDir, filename);

  if (typeof content === "string") {
    fs.writeFileSync(filepath, content, "utf8");
  } else {
    fs.writeFileSync(filepath, content);
  }

  return filepath;
}

module.exports = {
  exportToPDF,
  exportToExcel,
  exportToCSV,
  exportToHTML,
  saveExportFile,
};
