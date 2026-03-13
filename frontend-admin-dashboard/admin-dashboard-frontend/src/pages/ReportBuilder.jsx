import React, { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  listReportTemplates,
  createReportTemplate,
  updateReportTemplate,
  deleteReportTemplate,
  generateReport,
  listReportRuns,
  exportReport,
  listScheduledReports,
  createScheduledReport,
  updateScheduledReport,
  deleteScheduledReport,
  runScheduledReportNow,
} from "../services/api";
import Card from "../components/Card";

export default function ReportBuilder() {
  const queryClient = useQueryClient();
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [widgets, setWidgets] = useState([]);
  const [isEditing, setIsEditing] = useState(false);
  const [activeTab, setActiveTab] = useState("builder"); // "builder" | "history" | "scheduled"
  const [lastGeneratedReport, setLastGeneratedReport] = useState(null);

  // Fetch templates
  const {
    data: templatesRaw,
    isLoading: templatesLoading,
    isError: templatesError,
    error: templatesErrorDetail,
    refetch: refetchTemplates,
  } = useQuery({
    queryKey: ["reportTemplates"],
    queryFn: async () => {
      const response = await listReportTemplates();
      const data = response?.data;
      if (Array.isArray(data)) return data;
      if (data && typeof data === "object") {
        if (Array.isArray(data.templates)) return data.templates;
        if (Array.isArray(data.data)) return data.data;
        if (data.data && typeof data.data === "object" && Array.isArray(data.data.templates)) return data.data.templates;
      }
      return [];
    },
    retry: 1,
  });
  // Always an array — never .map on non-array (avoids "y.map is not a function")
  function getTemplatesArray() {
    const raw = templatesRaw;
    if (Array.isArray(raw)) return raw;
    if (raw && typeof raw === "object") {
      if (Array.isArray(raw.templates)) return raw.templates;
      if (Array.isArray(raw.data)) return raw.data;
      if (raw.data && typeof raw.data === "object" && Array.isArray(raw.data.templates)) return raw.data.templates;
    }
    return [];
  }
  const templates = getTemplatesArray();
  const templatesSafe = Array.isArray(templates) ? templates : [];

  // Create template mutation
  const createMutation = useMutation({
    mutationFn: createReportTemplate,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reportTemplates"] });
      setIsEditing(false);
      setWidgets([]);
    },
  });

  // Update template mutation
  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => updateReportTemplate(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reportTemplates"] });
      setIsEditing(false);
    },
  });

  // Delete template mutation
  const deleteMutation = useMutation({
    mutationFn: deleteReportTemplate,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reportTemplates"] });
      if (selectedTemplate?.id === deleteMutation.variables) {
        setSelectedTemplate(null);
        setWidgets([]);
      }
    },
  });

  // Generate report mutation
  const generateMutation = useMutation({
    mutationFn: generateReport,
    onSuccess: (data) => {
      console.log("✅ Report generated:", data.data);
      setLastGeneratedReport(data.data);
      queryClient.invalidateQueries({ queryKey: ["reportRuns"] });
      alert("✅ Report generated successfully! Check the History tab to export it.");
    },
    onError: (error) => {
      console.error("❌ Report generation error:", error);
      alert(`Failed to generate report: ${error?.response?.data?.message || error.message || "Unknown error"}`);
    },
  });

  // Only fetch report runs after templates have settled (avoids double 401 / flash)
  const templatesSettled = templatesRaw !== undefined || templatesError;
  const {
    data: reportRunsRaw,
    isLoading: runsLoading,
    isError: runsError,
    refetch: refetchRuns,
  } = useQuery({
    queryKey: ["reportRuns"],
    queryFn: async () => {
      const response = await listReportRuns();
      const data = response?.data;
      return Array.isArray(data) ? data : (data?.runs || data?.data || []);
    },
    retry: 1,
    enabled: !!templatesSettled,
  });
  const reportRuns = Array.isArray(reportRunsRaw) ? reportRunsRaw : [];

  // Export report function
  async function handleExport(reportId, format) {
    try {
      const response = await exportReport(reportId, format);
      
      // Create download link
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `report-${reportId}.${format}`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Export error:", error);
      alert(`Failed to export report: ${error.message}`);
    }
  }

  // Load template when selected — always set an array so .map() never throws
  useEffect(() => {
    if (selectedTemplate) {
      const w = selectedTemplate.widgets;
      setWidgets(Array.isArray(w) ? w : []);
    } else {
      setWidgets([]);
    }
  }, [selectedTemplate]);

  function handleAddWidget(type) {
    const newWidget = {
      id: `widget-${Date.now()}`,
      type,
      title: `${type} Widget`,
      config: getDefaultConfig(type),
    };

    setWidgets([...safeWidgets, newWidget]);
  }

  function getDefaultConfig(type) {
    switch (type) {
      case "kpi":
        return {
          kpiType: "coverage_rate",
          label: "Coverage Rate",
          format: "percentage",
        };
      case "chart":
        return {
          chartType: "bar",
          dataSource: "callouts_by_location",
          xAxis: "label",
          yAxis: "value",
        };
      case "table":
        return {
          dataSource: "open_shifts",
          columns: ["date", "time", "location"],
          limit: 10,
        };
      case "text":
        return {
          content: "Enter your text here...",
          dynamic: false,
        };
      default:
        return {};
    }
  }

  const safeWidgets = Array.isArray(widgets) ? widgets : [];

  function handleUpdateWidget(widgetId, updates) {
    setWidgets(
      safeWidgets.map((w) => (w.id === widgetId ? { ...w, ...updates } : w))
    );
  }

  function handleDeleteWidget(widgetId) {
    setWidgets(safeWidgets.filter((w) => w.id !== widgetId));
  }

  function handleSaveTemplate() {
    if (!selectedTemplate) {
      // Create new
      createMutation.mutate({
        name: `Report ${new Date().toLocaleDateString()}`,
        widgets,
        category: "custom",
      });
    } else {
      // Update existing
      updateMutation.mutate({
        id: selectedTemplate.id,
        data: {
          widgets,
        },
      });
    }
  }

  async function handleGenerateReport() {
    console.log("🔄 handleGenerateReport called");
    console.log("Selected template:", selectedTemplate);
    console.log("Widgets:", widgets);
    console.log("Widgets length:", widgets.length);

    // If no template selected but we have widgets, save template first
    if (!selectedTemplate && widgets.length > 0) {
      const shouldSave = window.confirm(
        "You need to save the template first before generating a report. Save now?"
      );
      if (shouldSave) {
        // Save template first, then generate
        try {
          console.log("💾 Saving template first...");
          const saveData = {
            name: `Report ${new Date().toLocaleDateString()}`,
            widgets,
            category: "custom",
          };
          
          const response = await createReportTemplate(saveData);
          const newTemplate = response.data;
          console.log("✅ Template saved:", newTemplate);
          
          setSelectedTemplate(newTemplate);
          
          // Now generate the report
          console.log("📊 Generating report with template:", newTemplate.id);
          generateMutation.mutate({
            templateId: newTemplate.id,
            dateRange: {
              start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
              end: new Date().toISOString(),
            },
          });
          
          queryClient.invalidateQueries({ queryKey: ["reportTemplates"] });
          return;
        } catch (error) {
          console.error("❌ Failed to save template:", error);
          alert(`Failed to save template: ${error?.response?.data?.message || error.message}`);
          return;
        }
      } else {
        return;
      }
    }

    if (!selectedTemplate) {
      alert("Please create a template with at least one widget first");
      return;
    }

    if (widgets.length === 0) {
      alert("Please add at least one widget to the template before generating a report");
      return;
    }

    console.log("📊 Generating report for template:", selectedTemplate.id);
    console.log("📊 Payload:", {
      templateId: selectedTemplate.id,
      dateRange: {
        start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
        end: new Date().toISOString(),
      },
    });
    
    try {
      generateMutation.mutate({
        templateId: selectedTemplate.id,
        dateRange: {
          start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
          end: new Date().toISOString(),
        },
      });
    } catch (error) {
      console.error("❌ Error calling generateMutation:", error);
      alert(`Error: ${error.message}`);
    }
  }

  // Initial load: show loading until we have data or error (avoids flash of full UI before 401 redirect)
  const hasTemplatesData = templatesRaw !== undefined;
  if (!hasTemplatesData && !templatesError) {
    return (
      <div className="container" style={{ padding: 48, textAlign: "center" }}>
        <h1 style={{ margin: "0 0 12px 0", fontSize: 26 }}>📊 Report Builder</h1>
        <p style={{ margin: 0, opacity: 0.8 }}>Loading reports…</p>
      </div>
    );
  }

  if (templatesError && !templates?.length) {
    return (
      <div className="container">
        <div style={{ marginBottom: 20 }}>
          <h1 style={{ margin: 0, fontSize: 26 }}>📊 Report Builder</h1>
        </div>
        <div style={{ padding: 24, background: "rgba(220, 80, 60, 0.1)", borderRadius: 8, border: "1px solid rgba(220,80,60,0.3)" }}>
          <p style={{ margin: "0 0 12px 0" }}>Could not load report templates. You may need to sign in again or the reports API may not be available.</p>
          <p style={{ margin: "0 0 12px 0", fontSize: 13, opacity: 0.8 }}>{templatesErrorDetail?.response?.data?.message || templatesErrorDetail?.message || "Network or server error"}</p>
          <button type="button" className="btn btnPrimary" onClick={() => refetchTemplates()}>Retry</button>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 26 }}>📊 Report Builder</h1>
        <div style={{ marginTop: 4, opacity: 0.7, fontSize: 13 }}>
          Create custom reports with drag-and-drop widgets
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
        <button
          className={`btn ${activeTab === "builder" ? "btnPrimary" : ""}`}
          onClick={() => setActiveTab("builder")}
        >
          📊 Builder
        </button>
        <button
          className={`btn ${activeTab === "history" ? "btnPrimary" : ""}`}
          onClick={() => {
            setActiveTab("history");
            refetchRuns();
          }}
        >
          📜 History
        </button>
        <button
          className={`btn ${activeTab === "scheduled" ? "btnPrimary" : ""}`}
          onClick={() => setActiveTab("scheduled")}
        >
          ⏰ Scheduled
        </button>
      </div>

      {activeTab === "scheduled" ? (
        <ScheduledReportsTab />
      ) : activeTab === "history" ? (
        <Card title="Report History">
          {runsLoading ? (
            <div>Loading report history...</div>
          ) : reportRuns?.length === 0 ? (
            <div style={{ padding: 40, textAlign: "center", opacity: 0.7 }}>
              No reports generated yet. Create and generate a report to see it here.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 15 }}>
              {(Array.isArray(reportRuns) ? reportRuns : []).filter(Boolean).map((run) => (
                <div
                  key={run?.id ?? run?.generated_at ?? Math.random()}
                  style={{
                    padding: 15,
                    background: "rgba(255, 255, 255, 0.05)",
                    borderRadius: 8,
                    border: "1px solid rgba(255, 255, 255, 0.1)",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: 10 }}>
                    <div>
                      <div style={{ fontWeight: 600, marginBottom: 5 }}>
                        Report #{String(run?.id || "").substring(0, 8)}...
                      </div>
                      <div style={{ fontSize: 12, opacity: 0.7 }}>
                        Generated: {run?.generated_at ? new Date(run.generated_at).toLocaleString() : "—"}
                      </div>
                      <div style={{ fontSize: 12, opacity: 0.7 }}>
                        Status: {run?.status ?? "—"}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button
                        className="btn"
                        onClick={() => handleExport(run.id, "pdf")}
                        style={{ fontSize: 12, padding: "6px 12px" }}
                      >
                        📄 PDF
                      </button>
                      <button
                        className="btn"
                        onClick={() => handleExport(run.id, "excel")}
                        style={{ fontSize: 12, padding: "6px 12px" }}
                      >
                        📊 Excel
                      </button>
                      <button
                        className="btn"
                        onClick={() => handleExport(run.id, "csv")}
                        style={{ fontSize: 12, padding: "6px 12px" }}
                      >
                        📋 CSV
                      </button>
                      <button
                        className="btn"
                        onClick={() => handleExport(run.id, "html")}
                        style={{ fontSize: 12, padding: "6px 12px" }}
                      >
                        🌐 HTML
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      ) : (
      <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: 20 }}>
        {/* Sidebar */}
        <div>
          <Card title="Templates">
            <div style={{ marginBottom: 15 }}>
              <button
                className="btn btnPrimary"
                onClick={() => {
                  setSelectedTemplate(null);
                  setWidgets([]);
                  setIsEditing(true);
                }}
                style={{ width: "100%" }}
              >
                + New Report
              </button>
            </div>

            {templatesLoading ? (
              <div>Loading templates...</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {templatesSafe.map((template) => (
                  <div
                    key={template?.id ?? template?.name ?? Math.random()}
                    style={{
                      padding: 12,
                      background:
                        selectedTemplate?.id === template.id
                          ? "rgba(59, 130, 246, 0.2)"
                          : "rgba(255, 255, 255, 0.05)",
                      borderRadius: 8,
                      cursor: "pointer",
                      border:
                        selectedTemplate?.id === template.id
                          ? "2px solid #3b82f6"
                          : "1px solid rgba(255, 255, 255, 0.1)",
                    }}
                    onClick={() => {
                      setSelectedTemplate(template);
                      setIsEditing(false);
                    }}
                  >
                    <div style={{ fontWeight: 600, marginBottom: 4 }}>
                      {template.name}
                    </div>
                    <div style={{ fontSize: 12, opacity: 0.7 }}>
                      {template.widgets?.length || 0} widgets
                    </div>
                    <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
                      <button
                        className="btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedTemplate(template);
                          setIsEditing(true);
                        }}
                        style={{ fontSize: 11, padding: "4px 8px" }}
                      >
                        Edit
                      </button>
                      <button
                        className="btn btnDanger"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (
                            window.confirm(
                              `Delete "${template.name}"?`
                            )
                          ) {
                            deleteMutation.mutate(template.id);
                          }
                        }}
                        style={{ fontSize: 11, padding: "4px 8px" }}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Widget Library */}
          {isEditing && (
            <Card title="Add Widgets" style={{ marginTop: 20 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <button
                  className="btn"
                  onClick={() => handleAddWidget("kpi")}
                  style={{ width: "100%", textAlign: "left" }}
                >
                  🎯 KPI Cards
                </button>
                <button
                  className="btn"
                  onClick={() => handleAddWidget("chart")}
                  style={{ width: "100%", textAlign: "left" }}
                >
                  📊 Chart
                </button>
                <button
                  className="btn"
                  onClick={() => handleAddWidget("table")}
                  style={{ width: "100%", textAlign: "left" }}
                >
                  📋 Data Table
                </button>
                <button
                  className="btn"
                  onClick={() => handleAddWidget("text")}
                  style={{ width: "100%", textAlign: "left" }}
                >
                  📝 Text Section
                </button>
              </div>
            </Card>
          )}
        </div>

        {/* Main Canvas */}
        <div>
          <Card
            title={
              selectedTemplate
                ? `Editing: ${selectedTemplate.name}`
                : "New Report"
            }
            right={
              <div style={{ display: "flex", gap: 10 }}>
                {isEditing && (
                  <>
                    <button
                      className="btn"
                      onClick={handleSaveTemplate}
                      disabled={
                        createMutation.isPending || updateMutation.isPending
                      }
                    >
                      {createMutation.isPending || updateMutation.isPending
                        ? "Saving..."
                        : "💾 Save Template"}
                    </button>
                    {widgets.length > 0 && (
                      <button
                        className="btn btnPrimary"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          console.log("🔘 Generate Report (from edit mode)");
                          handleGenerateReport();
                        }}
                        disabled={generateMutation.isPending}
                        title="Generate report (will save template first if needed)"
                      >
                        {generateMutation.isPending
                          ? "⏳ Generating..."
                          : "📊 Generate Report"}
                      </button>
                    )}
                    <button
                      className="btn"
                      onClick={() => setIsEditing(false)}
                    >
                      Cancel
                    </button>
                  </>
                )}
                {selectedTemplate && !isEditing && (
                  <>
                    <button
                      className="btn"
                      onClick={() => setIsEditing(true)}
                    >
                      ✏️ Edit
                    </button>
                    <button
                      className="btn btnPrimary"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        console.log("🔘 Generate Report button clicked");
                        console.log("Selected template:", selectedTemplate);
                        console.log("Widgets count:", widgets.length);
                        handleGenerateReport();
                      }}
                      disabled={generateMutation.isPending || widgets.length === 0}
                    >
                      {generateMutation.isPending
                        ? "⏳ Generating..."
                        : widgets.length === 0
                        ? "⚠️ Add Widgets First"
                        : "📊 Generate Report"}
                    </button>
                    {lastGeneratedReport && (
                      <div style={{ marginTop: 10, padding: 10, background: "rgba(34, 197, 94, 0.2)", borderRadius: 6 }}>
                        <div style={{ fontSize: 12, marginBottom: 8, color: "#22c55e" }}>
                          ✅ Report generated! Check History tab to export.
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            }
          >
            {widgets.length === 0 ? (
              <div
                style={{
                  padding: 60,
                  textAlign: "center",
                  color: "rgba(255, 255, 255, 0.5)",
                }}
              >
                {isEditing
                  ? "Click 'Add Widgets' in the sidebar to start building your report"
                  : "Select a template or create a new report to begin"}
              </div>
            ) : (
              <>
                <div style={{ display: "flex", flexDirection: "column", gap: 15 }}>
                  {(Array.isArray(widgets) ? widgets : []).map((widget) => (
                    <WidgetPreview
                      key={widget.id}
                      widget={widget}
                      onUpdate={(updates) =>
                        handleUpdateWidget(widget.id, updates)
                      }
                      onDelete={() => handleDeleteWidget(widget.id)}
                      isEditing={isEditing}
                    />
                  ))}
                </div>
                {/* Always show generate button when widgets exist */}
                {widgets.length > 0 && (
                  <div style={{ marginTop: 20, padding: 15, background: "rgba(59, 130, 246, 0.1)", borderRadius: 8, border: "1px solid rgba(59, 130, 246, 0.3)" }}>
                    <div style={{ marginBottom: 10, fontWeight: 600, color: "#3b82f6" }}>
                      Ready to Generate Report
                    </div>
                    <button
                      className="btn btnPrimary"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        console.log("🔘 Generate Report button clicked (from widget area)");
                        console.log("Selected template:", selectedTemplate);
                        console.log("Widgets:", widgets);
                        handleGenerateReport();
                      }}
                      disabled={generateMutation.isPending}
                      style={{ width: "100%" }}
                    >
                      {generateMutation.isPending
                        ? "⏳ Generating Report..."
                        : selectedTemplate
                        ? "📊 Generate Report from Template"
                        : "📊 Generate Report (Will Save Template First)"}
                    </button>
                    {generateMutation.isError && (
                      <div style={{ marginTop: 10, padding: 10, background: "rgba(239, 68, 68, 0.2)", borderRadius: 6, color: "#ef4444", fontSize: 12 }}>
                        ❌ Error: {generateMutation.error?.response?.data?.message || generateMutation.error?.message || "Failed to generate report"}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </Card>
        </div>
      </div>
      )}
    </div>
  );
}

// Widget Preview Component
// Scheduled Reports Tab Component
function ScheduledReportsTab() {
  const queryClient = useQueryClient();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState(null);
  const [formData, setFormData] = useState({
    templateId: "",
    name: "",
    frequency: "daily",
    scheduleConfig: { time: "09:00" },
    emailRecipients: [],
    emailSubject: "",
    emailMessage: "",
    exportFormat: "pdf",
    isActive: true,
  });

  const { data: scheduledReportsRaw, isLoading, refetch } = useQuery({
    queryKey: ["scheduledReports"],
    queryFn: async () => {
      const response = await listScheduledReports();
      const data = response?.data;
      return Array.isArray(data) ? data : (data?.schedules || data?.data || []);
    },
  });
  const scheduledReportsList = Array.isArray(scheduledReportsRaw) ? scheduledReportsRaw : [];

  const { data: templatesRaw } = useQuery({
    queryKey: ["reportTemplates"],
    queryFn: async () => {
      const response = await listReportTemplates();
      const data = response?.data;
      if (Array.isArray(data)) return data;
      if (data?.templates && Array.isArray(data.templates)) return data.templates;
      if (data?.data && Array.isArray(data.data)) return data.data;
      if (data?.data?.templates && Array.isArray(data.data.templates)) return data.data.templates;
      return [];
    },
  });
  const templatesList = Array.isArray(templatesRaw)
    ? templatesRaw
    : (templatesRaw && typeof templatesRaw === "object" && Array.isArray(templatesRaw.templates)
        ? templatesRaw.templates
        : []);

  const createMutation = useMutation({
    mutationFn: createScheduledReport,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["scheduledReports"] });
      setShowCreateModal(false);
      setFormData({
        templateId: "",
        name: "",
        frequency: "daily",
        scheduleConfig: { time: "09:00" },
        emailRecipients: [],
        emailSubject: "",
        emailMessage: "",
        exportFormat: "pdf",
        isActive: true,
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => updateScheduledReport(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["scheduledReports"] });
      setEditingSchedule(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteScheduledReport,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["scheduledReports"] });
    },
  });

  const runNowMutation = useMutation({
    mutationFn: runScheduledReportNow,
    onSuccess: () => {
      alert("✅ Report generated successfully!");
      queryClient.invalidateQueries({ queryKey: ["reportRuns"] });
    },
  });

  function handleSubmit(e) {
    e.preventDefault();
    if (editingSchedule) {
      updateMutation.mutate({ id: editingSchedule.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  }

  function handleEdit(schedule) {
    setEditingSchedule(schedule);
    setFormData({
      templateId: schedule.template_id,
      name: schedule.name,
      frequency: schedule.frequency,
      scheduleConfig: schedule.schedule_config || { time: "09:00" },
      emailRecipients: schedule.email_recipients || [],
      emailSubject: schedule.email_subject || "",
      emailMessage: schedule.email_message || "",
      exportFormat: schedule.export_format || "pdf",
      isActive: schedule.is_active,
    });
    setShowCreateModal(true);
  }

  function formatNextRun(nextRunAt) {
    if (!nextRunAt) return "Not scheduled";
    return new Date(nextRunAt).toLocaleString();
  }

  return (
    <div>
      <Card
        title="Scheduled Reports"
        right={
          <button
            className="btn btnPrimary"
            onClick={() => {
              setEditingSchedule(null);
              setFormData({
                templateId: "",
                name: "",
                frequency: "daily",
                scheduleConfig: { time: "09:00" },
                emailRecipients: [],
                emailSubject: "",
                emailMessage: "",
                exportFormat: "pdf",
                isActive: true,
              });
              setShowCreateModal(true);
            }}
          >
            + New Schedule
          </button>
        }
      >
        {isLoading ? (
          <div style={{ padding: 40, textAlign: "center" }}>Loading...</div>
        ) : scheduledReportsList.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", opacity: 0.7 }}>
            No scheduled reports. Create one to automate report generation.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {(Array.isArray(scheduledReportsList) ? scheduledReportsList : []).map((schedule) => (
              <div
                key={schedule.id}
                style={{
                  padding: 15,
                  background: schedule.is_active ? "rgba(34, 197, 94, 0.1)" : "rgba(107, 114, 128, 0.1)",
                  borderRadius: 8,
                  border: `1px solid ${schedule.is_active ? "rgba(34, 197, 94, 0.3)" : "rgba(107, 114, 128, 0.3)"}`,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
                  <div>
                    <div style={{ fontWeight: 600, marginBottom: 5 }}>{schedule.name}</div>
                    <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 5 }}>
                      Frequency: {schedule.frequency} | Format: {schedule.export_format}
                    </div>
                    <div style={{ fontSize: 12, opacity: 0.7 }}>
                      Next run: {formatNextRun(schedule.next_run_at)}
                      {schedule.last_run_at && ` | Last run: ${new Date(schedule.last_run_at).toLocaleString()}`}
                    </div>
                    {schedule.email_recipients?.length > 0 && (
                      <div style={{ fontSize: 12, opacity: 0.7, marginTop: 5 }}>
                        📧 {schedule.email_recipients.join(", ")}
                      </div>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: 5 }}>
                    <button
                      className="btn"
                      onClick={() => runNowMutation.mutate(schedule.id)}
                      disabled={runNowMutation.isPending}
                      style={{ fontSize: 11, padding: "4px 8px" }}
                    >
                      ▶️ Run Now
                    </button>
                    <button
                      className="btn"
                      onClick={() => handleEdit(schedule)}
                      style={{ fontSize: 11, padding: "4px 8px" }}
                    >
                      ✏️ Edit
                    </button>
                    <button
                      className="btn"
                      onClick={() => {
                        if (window.confirm("Delete this scheduled report?")) {
                          deleteMutation.mutate(schedule.id);
                        }
                      }}
                      style={{ fontSize: 11, padding: "4px 8px", background: "rgba(239, 68, 68, 0.2)", color: "#ef4444" }}
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {showCreateModal && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0,0,0,0.7)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: 20,
          }}
          onClick={() => setShowCreateModal(false)}
        >
          <Card
            title={editingSchedule ? "Edit Scheduled Report" : "Create Scheduled Report"}
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: 600, width: "100%", maxHeight: "90vh", overflow: "auto" }}
          >
            <form onSubmit={handleSubmit}>
              <div style={{ display: "flex", flexDirection: "column", gap: 15 }}>
                <div>
                  <label className="label">Template</label>
                  <select
                    className="input"
                    value={formData.templateId}
                    onChange={(e) => setFormData({ ...formData, templateId: e.target.value })}
                    required
                  >
                    <option value="">Select a template</option>
                    {(Array.isArray(templatesList) ? templatesList : []).map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="label">Schedule Name</label>
                  <input
                    className="input"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                  />
                </div>

                <div>
                  <label className="label">Frequency</label>
                  <select
                    className="input"
                    value={formData.frequency}
                    onChange={(e) => {
                      const freq = e.target.value;
                      let config = { ...formData.scheduleConfig };
                      if (freq === "daily") {
                        config = { time: config.time || "09:00" };
                      } else if (freq === "weekly") {
                        config = { dayOfWeek: config.dayOfWeek || 1, time: config.time || "09:00" };
                      } else if (freq === "monthly") {
                        config = { dayOfMonth: config.dayOfMonth || 1, time: config.time || "09:00" };
                      }
                      setFormData({ ...formData, frequency: freq, scheduleConfig: config });
                    }}
                  >
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                  </select>
                </div>

                {formData.frequency === "daily" && (
                  <div>
                    <label className="label">Time</label>
                    <input
                      className="input"
                      type="time"
                      value={formData.scheduleConfig.time || "09:00"}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          scheduleConfig: { ...formData.scheduleConfig, time: e.target.value },
                        })
                      }
                    />
                  </div>
                )}

                {formData.frequency === "weekly" && (
                  <>
                    <div>
                      <label className="label">Day of Week</label>
                      <select
                        className="input"
                        value={formData.scheduleConfig.dayOfWeek || 1}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            scheduleConfig: { ...formData.scheduleConfig, dayOfWeek: parseInt(e.target.value) },
                          })
                        }
                      >
                        <option value={0}>Sunday</option>
                        <option value={1}>Monday</option>
                        <option value={2}>Tuesday</option>
                        <option value={3}>Wednesday</option>
                        <option value={4}>Thursday</option>
                        <option value={5}>Friday</option>
                        <option value={6}>Saturday</option>
                      </select>
                    </div>
                    <div>
                      <label className="label">Time</label>
                      <input
                        className="input"
                        type="time"
                        value={formData.scheduleConfig.time || "09:00"}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            scheduleConfig: { ...formData.scheduleConfig, time: e.target.value },
                          })
                        }
                      />
                    </div>
                  </>
                )}

                {formData.frequency === "monthly" && (
                  <>
                    <div>
                      <label className="label">Day of Month</label>
                      <input
                        className="input"
                        type="number"
                        min="1"
                        max="31"
                        value={formData.scheduleConfig.dayOfMonth || 1}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            scheduleConfig: { ...formData.scheduleConfig, dayOfMonth: parseInt(e.target.value) },
                          })
                        }
                      />
                    </div>
                    <div>
                      <label className="label">Time</label>
                      <input
                        className="input"
                        type="time"
                        value={formData.scheduleConfig.time || "09:00"}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            scheduleConfig: { ...formData.scheduleConfig, time: e.target.value },
                          })
                        }
                      />
                    </div>
                  </>
                )}

                <div>
                  <label className="label">Export Format</label>
                  <select
                    className="input"
                    value={formData.exportFormat}
                    onChange={(e) => setFormData({ ...formData, exportFormat: e.target.value })}
                  >
                    <option value="pdf">PDF</option>
                    <option value="excel">Excel</option>
                    <option value="csv">CSV</option>
                    <option value="html">HTML</option>
                    <option value="all">All Formats</option>
                  </select>
                </div>

                <div>
                  <label className="label">Email Recipients (comma-separated)</label>
                  <input
                    className="input"
                    value={formData.emailRecipients.join(", ")}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        emailRecipients: e.target.value.split(",").map((e) => e.trim()).filter(Boolean),
                      })
                    }
                    placeholder="email1@example.com, email2@example.com"
                  />
                </div>

                <div>
                  <label className="label">Email Subject</label>
                  <input
                    className="input"
                    value={formData.emailSubject}
                    onChange={(e) => setFormData({ ...formData, emailSubject: e.target.value })}
                    placeholder="Scheduled Report: Weekly Summary"
                  />
                </div>

                <div>
                  <label className="label">Email Message</label>
                  <textarea
                    className="input"
                    value={formData.emailMessage}
                    onChange={(e) => setFormData({ ...formData, emailMessage: e.target.value })}
                    rows={3}
                    placeholder="Please find attached the scheduled report."
                  />
                </div>

                <div>
                  <label style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <input
                      type="checkbox"
                      checked={formData.isActive}
                      onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                    />
                    Active (enabled)
                  </label>
                </div>

                <div style={{ display: "flex", gap: 10 }}>
                  <button
                    type="submit"
                    className="btn btnPrimary"
                    disabled={createMutation.isPending || updateMutation.isPending}
                  >
                    {createMutation.isPending || updateMutation.isPending
                      ? "Saving..."
                      : editingSchedule
                      ? "Update Schedule"
                      : "Create Schedule"}
                  </button>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => {
                      setShowCreateModal(false);
                      setEditingSchedule(null);
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}

function WidgetPreview({ widget, onUpdate, onDelete, isEditing }) {
  const [isConfiguring, setIsConfiguring] = useState(false);

  return (
    <div
      style={{
        background: "rgba(255, 255, 255, 0.05)",
        border: "1px solid rgba(255, 255, 255, 0.1)",
        borderRadius: 8,
        padding: 15,
        position: "relative",
      }}
    >
      {isEditing && (
        <div
          style={{
            position: "absolute",
            top: 10,
            right: 10,
            display: "flex",
            gap: 5,
          }}
        >
          <button
            className="btn"
            onClick={() => setIsConfiguring(!isConfiguring)}
            style={{ fontSize: 12, padding: "4px 8px" }}
          >
            ⚙️
          </button>
          <button
            className="btn btnDanger"
            onClick={onDelete}
            style={{ fontSize: 12, padding: "4px 8px" }}
          >
            🗑️
          </button>
        </div>
      )}

      <div style={{ marginBottom: 10, fontWeight: 600 }}>{widget.title}</div>

      {widget.type === "kpi" && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 15,
          }}
        >
          <div
            style={{
              background: "rgba(59, 130, 246, 0.2)",
              padding: 20,
              borderRadius: 8,
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: 32, fontWeight: 900, color: "#3b82f6", marginBottom: 5 }}>
              {widget.config?.format === "percentage" 
                ? "94%" 
                : widget.config?.format === "currency" 
                ? "$45K" 
                : "1,234"}
            </div>
            <div style={{ fontSize: 12, opacity: 0.7, textTransform: "uppercase" }}>
              {widget.config?.label || widget.config?.kpiType?.replace(/_/g, " ") || "KPI"}
            </div>
          </div>
        </div>
      )}

      {widget.type === "chart" && (
        <div
          style={{
            height: 200,
            background: "linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%)",
            borderRadius: 8,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "white",
          }}
        >
          📊 {widget.config?.chartType || "bar"} Chart Preview
        </div>
      )}

      {widget.type === "table" && (
        <div
          style={{
            background: "rgba(0, 0, 0, 0.2)",
            borderRadius: 8,
            padding: 10,
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: 10,
              padding: 8,
              borderBottom: "1px solid rgba(255, 255, 255, 0.1)",
              fontWeight: 600,
            }}
          >
            <div>Date</div>
            <div>Location</div>
            <div>Status</div>
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: 10,
              padding: 8,
            }}
          >
            <div>2024-01-25</div>
            <div>Downtown</div>
            <div>Open</div>
          </div>
        </div>
      )}

      {widget.type === "text" && (
        <div style={{ padding: 15, background: "rgba(0, 0, 0, 0.2)", borderRadius: 8 }}>
          {widget.config?.content || "Text content..."}
        </div>
      )}

      {isConfiguring && (
        <div
          style={{
            marginTop: 15,
            padding: 15,
            background: "rgba(0, 0, 0, 0.3)",
            borderRadius: 8,
          }}
        >
          <div style={{ marginBottom: 10, fontWeight: 600 }}>
            Configure Widget
          </div>
          <input
            className="input"
            placeholder="Widget Title"
            value={widget.title}
            onChange={(e) => onUpdate({ title: e.target.value })}
            style={{ marginBottom: 10, width: "100%" }}
          />
          
          {widget.type === "kpi" && (
            <>
              <select
                className="select"
                value={widget.config?.kpiType || "coverage_rate"}
                onChange={(e) => onUpdate({ config: { ...widget.config, kpiType: e.target.value } })}
                style={{ marginBottom: 10, width: "100%" }}
              >
                <option value="coverage_rate">Coverage Rate</option>
                <option value="open_shifts">Open Shifts</option>
                <option value="total_callouts">Total Callouts</option>
                <option value="labor_costs">Labor Costs</option>
              </select>
              <select
                className="select"
                value={widget.config?.format || "number"}
                onChange={(e) => onUpdate({ config: { ...widget.config, format: e.target.value } })}
                style={{ marginBottom: 10, width: "100%" }}
              >
                <option value="number">Number</option>
                <option value="percentage">Percentage</option>
                <option value="currency">Currency</option>
              </select>
              <input
                className="input"
                placeholder="Custom Label"
                value={widget.config?.label || ""}
                onChange={(e) => onUpdate({ config: { ...widget.config, label: e.target.value } })}
                style={{ width: "100%" }}
              />
            </>
          )}

          {widget.type === "chart" && (
            <>
              <select
                className="select"
                value={widget.config?.chartType || "bar"}
                onChange={(e) => onUpdate({ config: { ...widget.config, chartType: e.target.value } })}
                style={{ marginBottom: 10, width: "100%" }}
              >
                <option value="bar">Bar Chart</option>
                <option value="line">Line Chart</option>
                <option value="pie">Pie Chart</option>
              </select>
              <select
                className="select"
                value={widget.config?.dataSource || "callouts_by_location"}
                onChange={(e) => onUpdate({ config: { ...widget.config, dataSource: e.target.value } })}
                style={{ width: "100%" }}
              >
                <option value="callouts_by_location">Callouts by Location</option>
                <option value="shifts_by_day">Shifts by Day</option>
              </select>
            </>
          )}

          {widget.type === "table" && (
            <>
              <select
                className="select"
                value={widget.config?.dataSource || "open_shifts"}
                onChange={(e) => onUpdate({ config: { ...widget.config, dataSource: e.target.value } })}
                style={{ marginBottom: 10, width: "100%" }}
              >
                <option value="high_risk_shifts">High-Risk Shifts</option>
                <option value="open_shifts">Open Shifts</option>
              </select>
              <input
                className="input"
                type="number"
                placeholder="Row Limit"
                value={widget.config?.limit || 10}
                onChange={(e) => onUpdate({ config: { ...widget.config, limit: parseInt(e.target.value) || 10 } })}
                style={{ width: "100%" }}
              />
            </>
          )}

          {widget.type === "text" && (
            <textarea
              className="input"
              placeholder="Text Content"
              value={widget.config?.content || ""}
              onChange={(e) => onUpdate({ config: { ...widget.config, content: e.target.value } })}
              rows={4}
              style={{ width: "100%" }}
            />
          )}
        </div>
      )}
    </div>
  );
}
