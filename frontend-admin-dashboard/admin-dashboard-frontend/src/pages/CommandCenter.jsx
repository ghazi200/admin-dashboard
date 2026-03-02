/**
 * Command Center Page
 * 
 * AI Operations Command Center - Real-time operational intelligence
 */

import React, { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { connectSocket } from "../realtime/socket";
import Card from "../components/Card";
import {
  getCommandCenterFeed,
  getAtRiskShifts,
  generateBriefing,
  askCommandCenter,
  approveAction,
  rejectAction,
  getCommandCenterActions,
  getSiteHealth,
  getGuardReadiness,
  generateWeeklyReport,
  exportWeeklyReport,
  exportWeeklyReportPDF,
} from "../services/api";
import { listTenants } from "../services/superAdmin";
import { getAdminInfo } from "../utils/access";

export default function CommandCenter() {
  const [briefingData, setBriefingData] = useState(null);
  const [briefingLoading, setBriefingLoading] = useState(false);
  const [queryText, setQueryText] = useState("");
  const [queryAnswer, setQueryAnswer] = useState(null);
  const [queryLoading, setQueryLoading] = useState(false);
  const [actionStatuses, setActionStatuses] = useState({});
  const [actionLoadings, setActionLoadings] = useState({});
  const [showActionHistory, setShowActionHistory] = useState(false);
  const [actionHistoryFilter, setActionHistoryFilter] = useState("all"); // all, pending, approved, rejected, executed, failed
  const [showSiteHealth, setShowSiteHealth] = useState(false);
  const [selectedTenantId, setSelectedTenantId] = useState(""); // For super-admin tenant selection
  const [showGuardReadiness, setShowGuardReadiness] = useState(false);
  const [guardSearchQuery, setGuardSearchQuery] = useState("");
  const [guardFilterLevel, setGuardFilterLevel] = useState("ALL"); // ALL, EXCELLENT, GOOD, FAIR, POOR, CRITICAL
  const [showWeeklyReport, setShowWeeklyReport] = useState(false);
  const [weeklyReportData, setWeeklyReportData] = useState(null);
  const [weeklyReportLoading, setWeeklyReportLoading] = useState(false);
  const [weeklyReportError, setWeeklyReportError] = useState(null);
  const [reportDateRange, setReportDateRange] = useState({
    startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
    endDate: new Date().toISOString().split("T")[0],
  });

  // Query action history
  const {
    data: actionsData,
    isLoading: actionsLoading,
    error: actionsError,
    refetch: refetchActions,
  } = useQuery({
    queryKey: ["commandCenterActions", actionHistoryFilter],
    queryFn: () => getCommandCenterActions({ status: actionHistoryFilter === "all" ? undefined : actionHistoryFilter, limit: 50 }),
    enabled: showActionHistory,
    refetchInterval: 30000, // Refresh every 30 seconds when visible
  });

  // Get admin info to check if super-admin
  const adminInfo = getAdminInfo();
  const isSuperAdmin = adminInfo?.role === "super_admin";

  // Query tenants (for super-admin tenant selection)
  const {
    data: tenantsData,
    isLoading: tenantsLoading,
  } = useQuery({
    queryKey: ["tenants"],
    queryFn: async () => {
      const response = await listTenants();
      return response.data?.data || response.data || [];
    },
    enabled: isSuperAdmin && showSiteHealth, // Only fetch when super-admin and site health is visible
  });

  // Query site health
  const {
    data: siteHealthData,
    isLoading: siteHealthLoading,
    error: siteHealthError,
    refetch: refetchSiteHealth,
  } = useQuery({
    queryKey: ["siteHealth", selectedTenantId],
    queryFn: () => getSiteHealth({ 
      days: 30,
      ...(isSuperAdmin && selectedTenantId ? { tenantId: selectedTenantId } : {}),
    }),
    enabled: Boolean(showSiteHealth && (!isSuperAdmin || !!selectedTenantId)), // Only fetch if not super-admin OR if super-admin has selected a tenant
    refetchInterval: showSiteHealth ? 60000 : false, // Only refresh when visible
    retry: 1, // Retry once on error
  });

  // Query guard readiness
  const {
    data: guardReadinessData,
    isLoading: guardReadinessLoading,
    error: guardReadinessError,
    refetch: refetchGuardReadiness,
  } = useQuery({
    queryKey: ["guardReadiness"],
    queryFn: () => getGuardReadiness({ days: 30, minReliability: 0, limit: 50 }),
    enabled: showGuardReadiness,
    refetchInterval: showGuardReadiness ? 60000 : false, // Only refresh when visible
    retry: 1, // Retry once on error
  });

  // Query feed
  const {
    data: feedData,
    isLoading: feedLoading,
    error: feedError,
    refetch: refetchFeed,
  } = useQuery({
    queryKey: ["commandCenterFeed"],
    queryFn: () => getCommandCenterFeed({ limit: 50 }),
    refetchInterval: 30000, // Refresh every 30 seconds
    retry: 1,
  });

  // Query at-risk shifts
  const {
    data: atRiskData,
    isLoading: atRiskLoading,
    error: atRiskError,
    refetch: refetchAtRisk,
  } = useQuery({
    queryKey: ["atRiskShifts"],
    queryFn: () => getAtRiskShifts({ limit: 20, minRiskScore: 40 }),
    refetchInterval: 60000, // Refresh every minute
    retry: 1,
  });

  // Socket connection for real-time updates
  useEffect(() => {
    const socket = connectSocket();
    if (!socket) return;

    const handleNewEvent = () => {
      refetchFeed();
      refetchAtRisk();
    };

    // Listen for any operational events
    socket.on("incidents:new", handleNewEvent);
    socket.on("incidents:updated", handleNewEvent);
    socket.on("callout_started", handleNewEvent);
    socket.on("guard_clocked_in", handleNewEvent);
    socket.on("guard_clocked_out", handleNewEvent);

    return () => {
      socket.off("incidents:new", handleNewEvent);
      socket.off("incidents:updated", handleNewEvent);
      socket.off("callout_started", handleNewEvent);
      socket.off("guard_clocked_in", handleNewEvent);
      socket.off("guard_clocked_out", handleNewEvent);
    };
  }, [refetchFeed, refetchAtRisk]);

  // Generate briefing handler
  const handleGenerateBriefing = async () => {
    setBriefingLoading(true);
    try {
      const response = await generateBriefing({ timeRange: "24h" });
      setBriefingData(response.data);
    } catch (error) {
      console.error("Error generating briefing:", error);
    } finally {
      setBriefingLoading(false);
    }
  };

  // Ask query handler
  const handleAskQuery = async () => {
    if (!queryText.trim()) return;
    
    setQueryLoading(true);
    setQueryAnswer(null);
    try {
      const response = await askCommandCenter({ question: queryText.trim() });
      setQueryAnswer(response.data);
    } catch (error) {
      console.error("Error querying command center:", error);
      setQueryAnswer({
        answer: "Error querying operational data. Please try again.",
        citations: [],
        confidence: 0,
      });
    } finally {
      setQueryLoading(false);
    }
  };

  // Weekly report handler
  const handleGenerateWeeklyReport = async () => {
    setWeeklyReportLoading(true);
    setWeeklyReportError(null);
    setWeeklyReportData(null);
    
    try {
      const response = await generateWeeklyReport({
        startDate: reportDateRange.startDate,
        endDate: reportDateRange.endDate,
      });
      setWeeklyReportData(response.data);
    } catch (error) {
      console.error("Error generating weekly report:", error);
      setWeeklyReportError(error?.response?.data?.message || error?.message || "Failed to generate weekly report");
    } finally {
      setWeeklyReportLoading(false);
    }
  };

  // Export weekly report handler (CSV)
  const handleExportWeeklyReport = async () => {
    try {
      const response = await exportWeeklyReport({
        startDate: reportDateRange.startDate,
        endDate: reportDateRange.endDate,
      });
      
      // Create blob and download
      const blob = new Blob([response.data], { type: "text/csv" });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `weekly-report-${reportDateRange.startDate}-to-${reportDateRange.endDate}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Error exporting weekly report:", error);
      alert("Failed to export weekly report. Please try again.");
    }
  };

  // Export weekly report handler (PDF)
  const handleExportWeeklyReportPDF = async () => {
    try {
      const response = await exportWeeklyReportPDF({
        startDate: reportDateRange.startDate,
        endDate: reportDateRange.endDate,
      });
      
      // Create blob and download
      const blob = new Blob([response.data], { type: "application/pdf" });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `weekly-report-${reportDateRange.startDate}-to-${reportDateRange.endDate}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Error exporting weekly report as PDF:", error);
      const errorMsg = error?.response?.data?.message || error?.message || "Failed to export PDF";
      alert(`Failed to export weekly report as PDF: ${errorMsg}`);
    }
  };

  // Clear query handler
  const handleClearQuery = () => {
    setQueryText("");
    setQueryAnswer(null);
  };

  const feedEvents = Array.isArray(feedData?.data) ? feedData.data : [];
  const atRiskShifts = Array.isArray(atRiskData?.data) ? atRiskData.data : [];

  // Extract top risks for AI tiles (with safety checks)
  const criticalRisks = Array.isArray(atRiskShifts)
    ? atRiskShifts.filter((item) => item?.risk?.riskScore >= 70).slice(0, 3)
    : [];
  const highSeverityEvents = Array.isArray(feedEvents)
    ? feedEvents.filter((e) => e?.severity === "HIGH" || e?.severity === "CRITICAL").slice(0, 3)
    : [];

  return (
    <div style={{ padding: "24px", maxWidth: "1400px", margin: "0 auto" }}>
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 32, fontWeight: 900, marginBottom: 8, color: "#ffffff" }}>
          AI Operations Command Center
        </h1>
        <p style={{ color: "rgba(255,255,255,0.7)", fontSize: 14 }}>
          Real-time operational intelligence and actionable insights
        </p>
      </div>

      {/* Three AI Tiles */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 32 }}>
        {/* Tile 1: Right now — What needs attention */}
        <Card
          style={{
            padding: 20,
            background: "linear-gradient(135deg, rgba(59,130,246,0.1) 0%, rgba(139,92,246,0.1) 100%)",
            border: "1px solid rgba(59,130,246,0.3)",
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 700, color: "#60a5fa", marginBottom: 12, textTransform: "uppercase" }}>
            Right Now
          </div>
          <div style={{ fontSize: 20, fontWeight: 900, color: "#ffffff", marginBottom: 16 }}>
            What Needs Attention
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {criticalRisks.length > 0 ? (
              criticalRisks.map((item, idx) => (
                <div
                  key={idx}
                  style={{
                    padding: 10,
                    background: "rgba(239,68,68,0.1)",
                    borderRadius: 6,
                    border: "1px solid rgba(239,68,68,0.3)",
                    fontSize: 13,
                    color: "#ffffff",
                  }}
                >
                  ⚠️ {item.shift.shift_date} {item.shift.shift_start} - Risk: {item.risk.riskScore.toFixed(0)}
                </div>
              ))
            ) : (
              <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)" }}>
                ✅ No critical issues at this time
              </div>
            )}
            {highSeverityEvents.length > 0 && (
              <div style={{ fontSize: 13, color: "#ffffff", marginTop: 8 }}>
                🚨 {highSeverityEvents.length} high-severity event{highSeverityEvents.length > 1 ? "s" : ""}
              </div>
            )}
          </div>
        </Card>

        {/* Tile 2: Why it's happening */}
        <Card
          style={{
            padding: 20,
            background: "linear-gradient(135deg, rgba(139,92,246,0.1) 0%, rgba(236,72,153,0.1) 100%)",
            border: "1px solid rgba(139,92,246,0.3)",
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 700, color: "#a78bfa", marginBottom: 12, textTransform: "uppercase" }}>
            Analysis
          </div>
          <div style={{ fontSize: 20, fontWeight: 900, color: "#ffffff", marginBottom: 16 }}>
            Why It's Happening
          </div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", lineHeight: 1.6 }}>
            {criticalRisks.length > 0 ? (
              <div>
                {criticalRisks[0].risk.factors && (
                  <div>
                    {Object.keys(criticalRisks[0].risk.factors).slice(0, 3).map((factor) => (
                      <div key={factor} style={{ marginBottom: 8 }}>
                        • {factor.replace(/([A-Z])/g, " $1").trim()}:{" "}
                        {criticalRisks[0].risk.factors[factor]?.score?.toFixed(1) || "N/A"}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div>No high-risk patterns detected. Operations running smoothly.</div>
            )}
          </div>
        </Card>

        {/* Tile 3: What to do */}
        <Card
          style={{
            padding: 20,
            background: "linear-gradient(135deg, rgba(16,185,129,0.1) 0%, rgba(59,130,246,0.1) 100%)",
            border: "1px solid rgba(16,185,129,0.3)",
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 700, color: "#34d399", marginBottom: 12, textTransform: "uppercase" }}>
            Actions
          </div>
          <div style={{ fontSize: 20, fontWeight: 900, color: "#ffffff", marginBottom: 16 }}>
            What To Do
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {criticalRisks.length > 0 ? (
              <div style={{ fontSize: 13, color: "#ffffff" }}>
                • Request backup for high-risk shifts
                <br />
                • Review guard reliability patterns
                <br />
                • Escalate critical incidents
              </div>
            ) : (
              <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)" }}>
                ✅ No immediate actions required
              </div>
            )}
            <button
              onClick={handleGenerateBriefing}
              disabled={briefingLoading}
              style={{
                marginTop: 12,
                padding: "10px 16px",
                borderRadius: 8,
                border: "none",
                background: briefingLoading ? "rgba(148,163,184,0.3)" : "#3b82f6",
                color: "#ffffff",
                cursor: briefingLoading ? "not-allowed" : "pointer",
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              {briefingLoading ? "Generating..." : "📊 Generate Briefing"}
            </button>
          </div>
        </Card>
      </div>

      {/* Natural Language Query Section */}
      <Card style={{ marginBottom: 32, padding: 24 }}>
        <h2 style={{ fontSize: 20, fontWeight: 900, marginBottom: 16, color: "#ffffff" }}>
          🤖 Ask Command Center
        </h2>
        <p style={{ fontSize: 14, color: "rgba(255,255,255,0.6)", marginBottom: 16 }}>
          Ask questions about your operations in natural language. Examples: "Why did we miss coverage last week?", 
          "What incidents occurred today?", "Which guards called out this month?"
        </p>
        <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
          <input
            type="text"
            value={queryText}
            onChange={(e) => setQueryText(e.target.value)}
            onKeyPress={(e) => e.key === "Enter" && !queryLoading && handleAskQuery()}
            placeholder="Ask a question about operations..."
            style={{
              flex: 1,
              padding: 12,
              borderRadius: 8,
              border: "1px solid rgba(255,255,255,0.2)",
              background: "rgba(0,0,0,0.3)",
              color: "#ffffff",
              fontSize: 14,
            }}
          />
          <button
            onClick={handleAskQuery}
            disabled={queryLoading || !queryText.trim()}
            style={{
              padding: "12px 24px",
              borderRadius: 8,
              border: "none",
              background: queryLoading || !queryText.trim() ? "rgba(59,130,246,0.3)" : "#3b82f6",
              color: "#ffffff",
              cursor: queryLoading || !queryText.trim() ? "not-allowed" : "pointer",
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            {queryLoading ? "Querying..." : "Ask"}
          </button>
          {(queryAnswer || queryText.trim()) && (
            <button
              onClick={handleClearQuery}
              disabled={queryLoading}
              style={{
                padding: "12px 24px",
                borderRadius: 8,
                border: "1px solid rgba(255,255,255,0.2)",
                background: "rgba(255,255,255,0.1)",
                color: "#ffffff",
                cursor: queryLoading ? "not-allowed" : "pointer",
                fontSize: 14,
                fontWeight: 600,
              }}
            >
              Clear
            </button>
          )}
        </div>

        {queryAnswer && (
          <div
            style={{
              padding: 16,
              background: "rgba(139,92,246,0.1)",
              borderRadius: 8,
              border: "1px solid rgba(139,92,246,0.3)",
            }}
          >
            <div style={{ fontSize: 15, color: "#ffffff", marginBottom: 12, whiteSpace: "pre-wrap", lineHeight: 1.6 }}>
              {queryAnswer.answer}
            </div>
            {queryAnswer.confidence > 0 && (
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginBottom: 8 }}>
                Confidence: {(queryAnswer.confidence * 100).toFixed(0)}% • Sources: {queryAnswer.sources || 0}
              </div>
            )}
            {queryAnswer.citations && queryAnswer.citations.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#a78bfa", marginBottom: 8 }}>
                  Sources:
                </div>
                {queryAnswer.citations.map((citation, idx) => (
                  <div
                    key={idx}
                    style={{
                      padding: 8,
                      marginBottom: 6,
                      background: "rgba(139,92,246,0.1)",
                      borderRadius: 6,
                      fontSize: 12,
                      color: "rgba(255,255,255,0.8)",
                    }}
                  >
                    <div style={{ fontWeight: 600 }}>{citation.title}</div>
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>
                      {citation.type} • {new Date(citation.timestamp).toLocaleString()}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Briefing Section */}
      {briefingData && (
        <Card style={{ marginBottom: 32, padding: 24 }}>
          <h2 style={{ fontSize: 20, fontWeight: 900, marginBottom: 16, color: "#ffffff" }}>
            AI Briefing
          </h2>
          {briefingData.aiGenerated && (
            <div style={{ 
              marginBottom: 16, 
              padding: 8, 
              background: "rgba(139,92,246,0.1)", 
              borderRadius: 6,
              border: "1px solid rgba(139,92,246,0.3)",
              fontSize: 12,
              color: "#a78bfa",
            }}>
              🤖 AI-Generated Analysis
            </div>
          )}
          <div style={{ whiteSpace: "pre-wrap", color: "rgba(255,255,255,0.8)", marginBottom: 20, lineHeight: 1.6 }}>
            {briefingData.summary}
          </div>
          
          {/* AI Insights */}
          {briefingData.insights && briefingData.insights.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12, color: "#ffffff" }}>
                🧠 AI Insights
              </h3>
              {briefingData.insights.map((insight, idx) => (
                <div
                  key={idx}
                  style={{
                    padding: 12,
                    marginBottom: 8,
                    background: "rgba(139,92,246,0.1)",
                    borderRadius: 8,
                    border: "1px solid rgba(139,92,246,0.3)",
                    fontSize: 13,
                    color: "rgba(255,255,255,0.8)",
                  }}
                >
                  {insight}
                </div>
              ))}
            </div>
          )}

          {/* Top Risks */}
          {briefingData.topRisks && briefingData.topRisks.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12, color: "#ffffff" }}>
                ⚠️ Top Risks
              </h3>
              {briefingData.topRisks.map((risk, idx) => {
                const severityColors = {
                  CRITICAL: "#ef4444",
                  HIGH: "#f59e0b",
                  MEDIUM: "#fbbf24",
                  LOW: "#6b7280",
                };
                const color = severityColors[risk.severity] || "#6b7280";
                return (
                  <div
                    key={idx}
                    style={{
                      padding: 12,
                      marginBottom: 8,
                      background: `${color}15`,
                      borderRadius: 8,
                      border: `1px solid ${color}40`,
                    }}
                  >
                    <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
                      <span
                        style={{
                          padding: "2px 8px",
                          borderRadius: 6,
                          fontSize: 11,
                          fontWeight: 600,
                          background: `${color}30`,
                          color: color,
                        }}
                      >
                        {risk.severity}
                      </span>
                      <span style={{ fontSize: 14, fontWeight: 600, color: "#ffffff" }}>
                        {risk.title}
                      </span>
                    </div>
                    <div style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", marginBottom: 4 }}>
                      {risk.description}
                    </div>
                    {risk.impact && (
                      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", fontStyle: "italic" }}>
                        Impact: {risk.impact}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Recommended Actions */}
          {briefingData.recommendedActions && briefingData.recommendedActions.length > 0 && (
            <div>
              <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12, color: "#ffffff" }}>
                💡 Recommended Actions
              </h3>
              {briefingData.recommendedActions.map((action, idx) => {
                const priorityColors = {
                  CRITICAL: "#ef4444",
                  HIGH: "#f59e0b",
                  MEDIUM: "#3b82f6",
                  LOW: "#6b7280",
                };
                const color = priorityColors[action.priority] || "#3b82f6";
                const actionId = briefingData.storedActionIds?.[idx];
                const actionStatus = actionStatuses[actionId] || "PENDING";
                const actionLoading = actionLoadings[actionId] || false;

                const handleApprove = async () => {
                  if (!actionId) {
                    alert("Action ID not found. Action may not be stored yet.");
                    return;
                  }
                  setActionLoadings(prev => ({ ...prev, [actionId]: true }));
                  try {
                    await approveAction(actionId);
                    setActionStatuses(prev => ({ ...prev, [actionId]: "APPROVED" }));
                  } catch (error) {
                    console.error("Error approving action:", error);
                    alert("Failed to approve action. Please try again.");
                  } finally {
                    setActionLoadings(prev => ({ ...prev, [actionId]: false }));
                  }
                };

                const handleReject = async () => {
                  if (!actionId) {
                    alert("Action ID not found. Action may not be stored yet.");
                    return;
                  }
                  const reason = prompt("Reason for rejection (optional):");
                  setActionLoadings(prev => ({ ...prev, [actionId]: true }));
                  try {
                    await rejectAction(actionId, reason || "");
                    setActionStatuses(prev => ({ ...prev, [actionId]: "REJECTED" }));
                  } catch (error) {
                    console.error("Error rejecting action:", error);
                    alert("Failed to reject action. Please try again.");
                  } finally {
                    setActionLoadings(prev => ({ ...prev, [actionId]: false }));
                  }
                };

                return (
                  <div
                    key={idx}
                    style={{
                      padding: 12,
                      marginBottom: 8,
                      background: `${color}15`,
                      borderRadius: 8,
                      border: `1px solid ${color}40`,
                    }}
                  >
                    <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6, flexWrap: "wrap" }}>
                      <span
                        style={{
                          padding: "2px 8px",
                          borderRadius: 6,
                          fontSize: 11,
                          fontWeight: 600,
                          background: `${color}30`,
                          color: color,
                        }}
                      >
                        {action.priority}
                      </span>
                      <div style={{ fontSize: 14, fontWeight: 600, color: "#ffffff", flex: 1 }}>
                        {action.title}
                      </div>
                      {actionStatus === "PENDING" && actionId && (
                        <div style={{ display: "flex", gap: 8 }}>
                          <button
                            onClick={handleApprove}
                            disabled={actionLoading}
                            style={{
                              padding: "6px 12px",
                              borderRadius: 6,
                              border: "none",
                              background: "#10b981",
                              color: "#ffffff",
                              cursor: actionLoading ? "not-allowed" : "pointer",
                              fontSize: 12,
                              fontWeight: 600,
                            }}
                          >
                            {actionLoading ? "..." : "✓ Approve"}
                          </button>
                          <button
                            onClick={handleReject}
                            disabled={actionLoading}
                            style={{
                              padding: "6px 12px",
                              borderRadius: 6,
                              border: "none",
                              background: "#ef4444",
                              color: "#ffffff",
                              cursor: actionLoading ? "not-allowed" : "pointer",
                              fontSize: 12,
                              fontWeight: 600,
                            }}
                          >
                            {actionLoading ? "..." : "✗ Reject"}
                          </button>
                        </div>
                      )}
                      {actionStatus !== "PENDING" && (
                        <span
                          style={{
                            padding: "4px 8px",
                            borderRadius: 6,
                            fontSize: 11,
                            fontWeight: 600,
                            background: actionStatus === "APPROVED" ? "#10b98130" : "#ef4444430",
                            color: actionStatus === "APPROVED" ? "#10b981" : "#ef4444",
                          }}
                        >
                          {actionStatus}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 13, color: "rgba(255,255,255,0.7)" }}>{action.reason}</div>
                    {action.confidence && (
                      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 4 }}>
                        Confidence: {(action.confidence * 100).toFixed(0)}%
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Trends */}
          {briefingData.trends && Object.keys(briefingData.trends).length > 0 && (
            <div style={{ marginTop: 20, padding: 12, background: "rgba(16,185,129,0.1)", borderRadius: 8, border: "1px solid rgba(16,185,129,0.3)" }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 8, color: "#34d399" }}>
                📈 Trends
              </h3>
              <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                {Object.entries(briefingData.trends).map(([key, value]) => {
                  const trendEmoji = {
                    INCREASING: "📈",
                    DECREASING: "📉",
                    STABLE: "➡️",
                  }[value] || "➡️";
                  return (
                    <div key={key} style={{ fontSize: 12, color: "rgba(255,255,255,0.7)" }}>
                      {trendEmoji} {key}: {value}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Action History / Audit Log */}
      <Card style={{ marginBottom: 32, padding: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h2 style={{ fontSize: 20, fontWeight: 900, color: "#ffffff" }}>📋 Action History & Audit Log</h2>
          <button
            onClick={() => {
              setShowActionHistory(!showActionHistory);
              if (!showActionHistory) refetchActions();
            }}
            style={{
              padding: "8px 16px",
              borderRadius: 8,
              border: "1px solid rgba(255,255,255,0.2)",
              background: showActionHistory ? "rgba(59,130,246,0.2)" : "rgba(0,0,0,0.3)",
              color: "#ffffff",
              cursor: "pointer",
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            {showActionHistory ? "Hide" : "Show"} History
          </button>
        </div>

        {showActionHistory && (
          <div>
            {/* Filter Tabs */}
            <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
              {["all", "pending", "approved", "rejected", "executed", "failed"].map((status) => (
                <button
                  key={status}
                  onClick={() => setActionHistoryFilter(status)}
                  style={{
                    padding: "6px 12px",
                    borderRadius: 6,
                    border: "1px solid rgba(255,255,255,0.2)",
                    background: actionHistoryFilter === status ? "rgba(59,130,246,0.3)" : "rgba(0,0,0,0.2)",
                    color: "#ffffff",
                    cursor: "pointer",
                    fontSize: 12,
                    fontWeight: 600,
                    textTransform: "capitalize",
                  }}
                >
                  {status}
                </button>
              ))}
            </div>

            {/* Actions List */}
            {actionsLoading ? (
              <div style={{ padding: 40, textAlign: "center", color: "rgba(255,255,255,0.5)" }}>
                Loading actions...
              </div>
            ) : actionsError ? (
              <div style={{ padding: 40, textAlign: "center", color: "#ef4444" }}>
                Error loading actions. Please try again.
              </div>
            ) : actionsData?.data?.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {actionsData.data.map((action) => {
                  const statusColors = {
                    PENDING: { bg: "rgba(251,191,36,0.1)", border: "rgba(251,191,36,0.3)", text: "#fbbf24" },
                    APPROVED: { bg: "rgba(16,185,129,0.1)", border: "rgba(16,185,129,0.3)", text: "#10b981" },
                    REJECTED: { bg: "rgba(239,68,68,0.1)", border: "rgba(239,68,68,0.3)", text: "#ef4444" },
                    EXECUTED: { bg: "rgba(16,185,129,0.1)", border: "rgba(16,185,129,0.3)", text: "#10b981" },
                    FAILED: { bg: "rgba(239,68,68,0.1)", border: "rgba(239,68,68,0.3)", text: "#ef4444" },
                  };
                  const statusStyle = statusColors[action.status] || statusColors.PENDING;
                  
                  const actionTypeLabels = {
                    REQUEST_BACKUP: "📞 Request Backup",
                    ESCALATE_SUPERVISOR: "⚠️ Escalate",
                    TRIGGER_CALLOUT: "📱 Trigger Callout",
                    REQUEST_INSPECTION: "📸 Request Inspection",
                    NOTIFY_SUPERVISOR: "🔔 Notify Supervisor",
                  };

                  return (
                    <div
                      key={action.id}
                      style={{
                        padding: 16,
                        background: statusStyle.bg,
                        borderRadius: 8,
                        border: `1px solid ${statusStyle.border}`,
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8, flexWrap: "wrap", gap: 8 }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6, flexWrap: "wrap" }}>
                            <span
                              style={{
                                padding: "4px 8px",
                                borderRadius: 6,
                                fontSize: 11,
                                fontWeight: 600,
                                background: `${statusStyle.text}30`,
                                color: statusStyle.text,
                                textTransform: "uppercase",
                              }}
                            >
                              {action.status}
                            </span>
                            <span style={{ fontSize: 14, fontWeight: 600, color: "#ffffff" }}>
                              {actionTypeLabels[action.action_type] || action.action_type}
                            </span>
                            {action.recommended_by_ai && (
                              <span
                                style={{
                                  padding: "2px 6px",
                                  borderRadius: 4,
                                  fontSize: 10,
                                  fontWeight: 600,
                                  background: "rgba(139,92,246,0.3)",
                                  color: "#a78bfa",
                                }}
                              >
                                🤖 AI
                              </span>
                            )}
                            {action.confidence_score && (
                              <span style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>
                                Confidence: {(parseFloat(action.confidence_score) * 100).toFixed(0)}%
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.8)", marginBottom: 8 }}>
                            {action.recommendation_reason || action.description || "No description available"}
                          </div>
                          {action.rejected_reason && (
                            <div style={{ fontSize: 12, color: "#ef4444", marginBottom: 8 }}>
                              Rejected: {action.rejected_reason}
                            </div>
                          )}
                          {action.outcome_json && (
                            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", marginBottom: 8 }}>
                              Result: {action.outcome_json.message || JSON.stringify(action.outcome_json)}
                            </div>
                          )}
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 16, fontSize: 11, color: "rgba(255,255,255,0.5)", flexWrap: "wrap" }}>
                        <span>Created: {new Date(action.created_at).toLocaleString()}</span>
                        {action.approved_at && (
                          <span>Approved: {new Date(action.approved_at).toLocaleString()}</span>
                        )}
                        {action.executed_at && (
                          <span>Executed: {new Date(action.executed_at).toLocaleString()}</span>
                        )}
                        {action.rejected_at && (
                          <span>Rejected: {new Date(action.rejected_at).toLocaleString()}</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={{ padding: 40, textAlign: "center", color: "rgba(255,255,255,0.5)" }}>
                No actions found
                {actionHistoryFilter !== "all" && ` with status "${actionHistoryFilter}"`}
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Site Health Dashboard */}
      <Card style={{ marginBottom: 32, padding: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h2 style={{ fontSize: 20, fontWeight: 900, color: "#ffffff" }}>🏢 Site Health Dashboard</h2>
          <button
            onClick={() => {
              const newValue = !showSiteHealth;
              setShowSiteHealth(newValue);
              if (newValue && refetchSiteHealth) {
                // Only refetch if showing, and safely handle errors
                refetchSiteHealth().catch(err => {
                  console.warn("Error refetching site health:", err);
                });
              }
            }}
            style={{
              padding: "8px 16px",
              borderRadius: 8,
              border: "1px solid rgba(255,255,255,0.2)",
              background: showSiteHealth ? "rgba(59,130,246,0.2)" : "rgba(0,0,0,0.3)",
              color: "#ffffff",
              cursor: "pointer",
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            {showSiteHealth ? "Hide" : "Show"} Site Health
          </button>
        </div>

        {showSiteHealth && (
          <div>
            {/* Super-Admin Tenant Selector */}
            {isSuperAdmin && (
              <div style={{ marginBottom: 16, padding: 12, background: "rgba(59,130,246,0.1)", borderRadius: 8 }}>
                <label style={{ display: "block", marginBottom: 8, fontSize: 13, fontWeight: 600, color: "#ffffff" }}>
                  Select Tenant:
                </label>
                <select
                  value={selectedTenantId}
                  onChange={(e) => setSelectedTenantId(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    background: "rgba(0,0,0,0.3)",
                    border: "1px solid rgba(255,255,255,0.2)",
                    borderRadius: 6,
                    color: "#ffffff",
                    fontSize: 13,
                  }}
                  disabled={tenantsLoading}
                >
                  <option value="">-- Select a tenant --</option>
                  {tenantsData?.map((tenant) => (
                    <option key={tenant.id} value={tenant.id}>
                      {tenant.name || tenant.id} {tenant.location ? `(${tenant.location})` : ""}
                    </option>
                  ))}
                </select>
                {tenantsLoading && (
                  <div style={{ marginTop: 8, fontSize: 11, opacity: 0.7, color: "#ffffff" }}>
                    Loading tenants...
                  </div>
                )}
              </div>
            )}

            {siteHealthLoading ? (
              <div style={{ padding: 40, textAlign: "center", color: "rgba(255,255,255,0.5)" }}>
                Loading site health...
              </div>
            ) : isSuperAdmin && !selectedTenantId ? (
              <div style={{ padding: 40, textAlign: "center" }}>
                <div style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", marginBottom: 12 }}>
                  Please select a tenant above to view site health data.
                </div>
              </div>
            ) : siteHealthError ? (
              <div style={{ padding: 40, textAlign: "center" }}>
                <div style={{ color: "#ef4444", marginBottom: 8 }}>
                  ⚠️ Error loading site health
                </div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginBottom: 12 }}>
                  {siteHealthError?.response?.data?.message || siteHealthError?.message || "Unknown error"}
                </div>
                <button
                  onClick={() => refetchSiteHealth()}
                  style={{
                    marginTop: 12,
                    padding: "6px 12px",
                    background: "#3b82f6",
                    color: "white",
                    border: "none",
                    borderRadius: 6,
                    cursor: "pointer",
                    fontSize: 12,
                  }}
                >
                  Retry
                </button>
              </div>
            ) : siteHealthData?.message && !siteHealthData?.data?.length ? (
              <div style={{ padding: 40, textAlign: "center" }}>
                <div style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", marginBottom: 12 }}>
                  {siteHealthData.message}
                </div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>
                  {siteHealthData.message.includes("tenant") 
                    ? "Please contact an administrator to assign you to a tenant, or select a tenant if you are a super-admin."
                    : "Site health data will appear once sites have operational activity such as incidents, events, or shifts."}
                </div>
              </div>
            ) : siteHealthData?.data?.length > 0 ? (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 16 }}>
                {siteHealthData.data.map((siteHealth) => {
                  const healthColors = {
                    HEALTHY: { bg: "rgba(16,185,129,0.1)", border: "rgba(16,185,129,0.3)", text: "#10b981" },
                    WARNING: { bg: "rgba(251,191,36,0.1)", border: "rgba(251,191,36,0.3)", text: "#fbbf24" },
                    CAUTION: { bg: "rgba(245,158,11,0.1)", border: "rgba(245,158,11,0.3)", text: "#f59e0b" },
                    CRITICAL: { bg: "rgba(239,68,68,0.1)", border: "rgba(239,68,68,0.3)", text: "#ef4444" },
                  };
                  const healthStyle = healthColors[siteHealth.metrics.healthStatus] || healthColors.WARNING;

                  return (
                    <div
                      key={siteHealth.site.id}
                      style={{
                        padding: 16,
                        background: healthStyle.bg,
                        borderRadius: 8,
                        border: `1px solid ${healthStyle.border}`,
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 16, fontWeight: 700, color: "#ffffff", marginBottom: 4 }}>
                            {siteHealth.site.name}
                          </div>
                          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginBottom: 8 }}>
                            {siteHealth.site.address}
                          </div>
                        </div>
                        <span
                          style={{
                            padding: "4px 8px",
                            borderRadius: 6,
                            fontSize: 11,
                            fontWeight: 600,
                            background: `${healthStyle.text}30`,
                            color: healthStyle.text,
                            textTransform: "uppercase",
                          }}
                        >
                          {siteHealth.metrics.healthStatus}
                        </span>
                      </div>

                      <div style={{ marginBottom: 12 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                          <span style={{ fontSize: 13, color: "rgba(255,255,255,0.7)" }}>Health Score</span>
                          <span style={{ fontSize: 18, fontWeight: 700, color: healthStyle.text }}>
                            {siteHealth.metrics.healthScore}/100
                          </span>
                        </div>
                        <div
                          style={{
                            height: 6,
                            background: "rgba(0,0,0,0.3)",
                            borderRadius: 3,
                            overflow: "hidden",
                          }}
                        >
                          <div
                            style={{
                              width: `${siteHealth.metrics.healthScore}%`,
                              height: "100%",
                              background: healthStyle.text,
                              transition: "width 0.3s",
                            }}
                          />
                        </div>
                      </div>

                      <div style={{ display: "flex", gap: 16, fontSize: 12, color: "rgba(255,255,255,0.6)", flexWrap: "wrap" }}>
                        <div>
                          <span style={{ fontWeight: 600 }}>Incidents:</span> {siteHealth.metrics.incidents}
                        </div>
                        <div>
                          <span style={{ fontWeight: 600 }}>Open Shifts:</span> {siteHealth.metrics.openShifts}
                        </div>
                        <div>
                          <span style={{ fontWeight: 600 }}>Events:</span> {siteHealth.metrics.recentEvents}
                        </div>
                      </div>

                      {siteHealth.risk && (
                        <div style={{ marginTop: 12, fontSize: 11, color: "rgba(255,255,255,0.5)" }}>
                          Risk Level: {siteHealth.risk.riskLevel} ({siteHealth.risk.riskScore.toFixed(0)})
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={{ padding: 40, textAlign: "center", color: "rgba(255,255,255,0.5)" }}>
                <div style={{ marginBottom: 8, fontSize: 16 }}>
                  ℹ️ No site activity found
                </div>
                <div style={{ fontSize: 13, color: "rgba(255,255,255,0.6)" }}>
                  {siteHealthData?.message || "Site health data will appear once sites have operational activity such as incidents, events, or shifts."}
                </div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginTop: 12 }}>
                  This is normal if no operational events have occurred yet.
                </div>
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Guard Readiness Panel */}
      <Card style={{ marginBottom: 32, padding: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h2 style={{ fontSize: 20, fontWeight: 900, color: "#ffffff" }}>👤 Guard Readiness Panel</h2>
          <button
            onClick={() => {
              const newValue = !showGuardReadiness;
              setShowGuardReadiness(newValue);
              if (newValue && refetchGuardReadiness) {
                refetchGuardReadiness().catch(err => {
                  console.warn("Error refetching guard readiness:", err);
                });
              }
            }}
            style={{
              padding: "8px 16px",
              borderRadius: 8,
              border: "1px solid rgba(255,255,255,0.2)",
              background: showGuardReadiness ? "rgba(59,130,246,0.2)" : "rgba(0,0,0,0.3)",
              color: "#ffffff",
              cursor: "pointer",
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            {showGuardReadiness ? "Hide" : "Show"} Guard Readiness
          </button>
        </div>

        {showGuardReadiness && (
          <div>
            {/* Search and Filter Controls - Always visible when panel is open */}
            <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap", alignItems: "center" }}>
                <input
                  type="text"
                  placeholder="🔍 Search by name, email..."
                  value={guardSearchQuery}
                  onChange={(e) => setGuardSearchQuery(e.target.value)}
                  style={{
                    flex: 1,
                    minWidth: 200,
                    maxWidth: 400,
                    padding: "10px 14px",
                    borderRadius: 8,
                    border: "1px solid rgba(255,255,255,0.3)",
                    background: "rgba(255,255,255,0.1)",
                    color: "#ffffff",
                    fontSize: 14,
                  }}
                />
                <select
                  value={guardFilterLevel}
                  onChange={(e) => setGuardFilterLevel(e.target.value)}
                  style={{
                    padding: "10px 14px",
                    borderRadius: 8,
                    border: "1px solid rgba(255,255,255,0.3)",
                    background: "rgba(255,255,255,0.1)",
                    color: "#ffffff",
                    fontSize: 14,
                    cursor: "pointer",
                  }}
                >
                  <option value="ALL" style={{ color: "#000000" }}>All Levels</option>
                  <option value="EXCELLENT" style={{ color: "#000000" }}>Excellent</option>
                  <option value="GOOD" style={{ color: "#000000" }}>Good</option>
                  <option value="FAIR" style={{ color: "#000000" }}>Fair</option>
                  <option value="POOR" style={{ color: "#000000" }}>Poor</option>
                  <option value="CRITICAL" style={{ color: "#000000" }}>Critical</option>
                </select>
                {(guardSearchQuery || guardFilterLevel !== "ALL") && (
                  <button
                    onClick={() => {
                      setGuardSearchQuery("");
                      setGuardFilterLevel("ALL");
                    }}
                    style={{
                      padding: "10px 16px",
                      borderRadius: 8,
                      border: "1px solid rgba(239,68,68,0.5)",
                      background: "rgba(239,68,68,0.2)",
                      color: "#ef4444",
                      cursor: "pointer",
                      fontSize: 14,
                      fontWeight: 600,
                    }}
                  >
                    Clear Filters
                  </button>
                )}
              </div>

            {guardReadinessLoading ? (
              <div style={{ padding: 40, textAlign: "center", color: "rgba(255,255,255,0.5)" }}>
                Loading guard readiness...
              </div>
            ) : guardReadinessError ? (
              <div style={{ padding: 40, textAlign: "center" }}>
                <div style={{ color: "#ef4444", marginBottom: 8 }}>
                  ⚠️ Error loading guard readiness
                </div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginBottom: 12 }}>
                  {guardReadinessError?.response?.data?.message || guardReadinessError?.message || "Unknown error"}
                </div>
                <div style={{ fontSize: 13, color: "rgba(255,255,255,0.7)" }}>
                  {guardReadinessData?.message || "No guard readiness data available. This is normal if no guards have shifts or activity yet."}
                </div>
              </div>
            ) : guardReadinessData?.data?.length > 0 ? (
              <>
                {/* Guard Cards */}
                {(() => {
                  // Filter guards based on search query and reliability level
                  const filteredGuards = guardReadinessData.data.filter((guard) => {
                    // Search filter
                    const searchLower = guardSearchQuery.toLowerCase();
                    const matchesSearch = !guardSearchQuery || 
                      guard.guard?.name?.toLowerCase().includes(searchLower) ||
                      guard.guard?.email?.toLowerCase().includes(searchLower) ||
                      guard.guard?.phone?.toLowerCase().includes(searchLower);

                    // Reliability level filter
                    const matchesLevel = guardFilterLevel === "ALL" || 
                      guard.metrics.reliabilityLevel === guardFilterLevel;

                    return matchesSearch && matchesLevel;
                  });

                  if (filteredGuards.length === 0) {
                    return (
                      <div style={{ padding: 40, textAlign: "center", color: "rgba(255,255,255,0.5)" }}>
                        <div style={{ marginBottom: 8, fontSize: 16 }}>
                          🔍 No guards found
                        </div>
                        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.6)" }}>
                          {guardSearchQuery || guardFilterLevel !== "ALL"
                            ? "Try adjusting your search or filter criteria."
                            : "No guard readiness data available."}
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 16 }}>
                      {filteredGuards.map((guard) => {
                        const reliabilityColors = {
                          EXCELLENT: { bg: "rgba(16,185,129,0.1)", border: "rgba(16,185,129,0.3)", text: "#10b981" },
                          GOOD: { bg: "rgba(59,130,246,0.1)", border: "rgba(59,130,246,0.3)", text: "#3b82f6" },
                          FAIR: { bg: "rgba(251,191,36,0.1)", border: "rgba(251,191,36,0.3)", text: "#fbbf24" },
                          POOR: { bg: "rgba(245,158,11,0.1)", border: "rgba(245,158,11,0.3)", text: "#f59e0b" },
                          CRITICAL: { bg: "rgba(239,68,68,0.1)", border: "rgba(239,68,68,0.3)", text: "#ef4444" },
                        };
                        const reliabilityStyle = reliabilityColors[guard.metrics.reliabilityLevel] || reliabilityColors.FAIR;

                        const readinessStatus = guard.guard?.active === false 
                          ? "INACTIVE" 
                          : guard.guard?.availability === false 
                          ? "UNAVAILABLE" 
                          : guard.metrics.reliabilityScore < 50 
                          ? "AT_RISK" 
                          : guard.metrics.reliabilityScore < 70 
                          ? "CONCERN" 
                          : "READY";

                        const statusColors = {
                          READY: "#10b981",
                          CONCERN: "#fbbf24",
                          AT_RISK: "#f59e0b",
                          UNAVAILABLE: "#6b7280",
                          INACTIVE: "#ef4444",
                        };
                        const statusColor = statusColors[readinessStatus] || "#6b7280";

                        return (
                    <div
                      key={guard.guard.id}
                      style={{
                        padding: 16,
                        background: reliabilityStyle.bg,
                        borderRadius: 8,
                        border: `1px solid ${reliabilityStyle.border}`,
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 16, fontWeight: 700, color: "#ffffff", marginBottom: 4 }}>
                            {guard.guard.name}
                          </div>
                          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginBottom: 8 }}>
                            {guard.guard.email}
                          </div>
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-end" }}>
                          <span
                            style={{
                              padding: "4px 8px",
                              borderRadius: 6,
                              fontSize: 11,
                              fontWeight: 600,
                              background: `${reliabilityStyle.text}30`,
                              color: reliabilityStyle.text,
                              textTransform: "uppercase",
                            }}
                          >
                            {guard.metrics.reliabilityLevel}
                          </span>
                          <span
                            style={{
                              padding: "2px 6px",
                              borderRadius: 4,
                              fontSize: 10,
                              fontWeight: 600,
                              background: `${statusColor}30`,
                              color: statusColor,
                            }}
                          >
                            {readinessStatus.replace("_", " ")}
                          </span>
                        </div>
                      </div>

                      <div style={{ marginBottom: 12 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                          <span style={{ fontSize: 13, color: "rgba(255,255,255,0.7)" }}>Reliability Score</span>
                          <span style={{ fontSize: 18, fontWeight: 700, color: reliabilityStyle.text }}>
                            {guard.metrics.reliabilityScore}/100
                          </span>
                        </div>
                        <div
                          style={{
                            height: 6,
                            background: "rgba(0,0,0,0.3)",
                            borderRadius: 3,
                            overflow: "hidden",
                          }}
                        >
                          <div
                            style={{
                              width: `${guard.metrics.reliabilityScore}%`,
                              height: "100%",
                              background: reliabilityStyle.text,
                              transition: "width 0.3s",
                            }}
                          />
                        </div>
                      </div>

                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, fontSize: 12, color: "rgba(255,255,255,0.6)", marginBottom: 12 }}>
                        <div>
                          <span style={{ fontWeight: 600 }}>Shifts:</span> {guard.metrics.totalShifts}
                        </div>
                        <div>
                          <span style={{ fontWeight: 600 }}>Completed:</span> {guard.metrics.completedShifts}
                        </div>
                        <div>
                          <span style={{ fontWeight: 600 }}>Callouts:</span> {guard.metrics.callouts}
                        </div>
                        <div>
                          <span style={{ fontWeight: 600 }}>Callout Rate:</span> {(guard.metrics.calloutRate * 100).toFixed(0)}%
                        </div>
                      </div>

                      {guard.metrics.lateClockIns > 0 && (
                        <div style={{ fontSize: 11, color: "#f59e0b", marginTop: 8 }}>
                          ⚠️ {guard.metrics.lateClockIns} late clock-in{guard.metrics.lateClockIns > 1 ? "s" : ""}
                        </div>
                      )}

                      {guard.metrics.completionRate > 0 && (
                        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 4 }}>
                          Completion Rate: {guard.metrics.completionRate}%
                        </div>
                      )}
                    </div>
                  );
                      })}
                    </div>
                  );
                })()}
              </>
            ) : (
              <div style={{ padding: 40, textAlign: "center", color: "rgba(255,255,255,0.5)" }}>
                <div style={{ marginBottom: 8, fontSize: 16 }}>
                  ℹ️ No guard readiness data found
                </div>
                <div style={{ fontSize: 13, color: "rgba(255,255,255,0.6)" }}>
                  {guardReadinessData?.message || "Guard readiness data will appear once guards have shifts, callouts, or clock-in activity."}
                </div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginTop: 12 }}>
                  This is normal if no guards have operational activity yet.
                </div>
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Weekly Reports Section */}
      <Card style={{ marginBottom: 32, padding: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h2 style={{ fontSize: 20, fontWeight: 900, color: "#ffffff" }}>📊 Weekly Reports & AI Summaries</h2>
          <button
            onClick={() => setShowWeeklyReport(!showWeeklyReport)}
            style={{
              padding: "8px 16px",
              borderRadius: 8,
              border: "1px solid rgba(255,255,255,0.2)",
              background: showWeeklyReport ? "rgba(59,130,246,0.2)" : "rgba(0,0,0,0.3)",
              color: "#ffffff",
              cursor: "pointer",
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            {showWeeklyReport ? "Hide" : "Show"} Reports
          </button>
        </div>

        {showWeeklyReport && (
          <div>
            {/* Date Range Selector */}
            <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap", alignItems: "center" }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <label style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", fontWeight: 600 }}>Start Date:</label>
                <input
                  type="date"
                  value={reportDateRange.startDate}
                  onChange={(e) => setReportDateRange({ ...reportDateRange, startDate: e.target.value })}
                  style={{
                    padding: "8px 12px",
                    borderRadius: 6,
                    border: "1px solid rgba(255,255,255,0.3)",
                    background: "rgba(255,255,255,0.1)",
                    color: "#ffffff",
                    fontSize: 14,
                  }}
                />
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <label style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", fontWeight: 600 }}>End Date:</label>
                <input
                  type="date"
                  value={reportDateRange.endDate}
                  onChange={(e) => setReportDateRange({ ...reportDateRange, endDate: e.target.value })}
                  style={{
                    padding: "8px 12px",
                    borderRadius: 6,
                    border: "1px solid rgba(255,255,255,0.3)",
                    background: "rgba(255,255,255,0.1)",
                    color: "#ffffff",
                    fontSize: 14,
                  }}
                />
              </div>
              <button
                onClick={handleGenerateWeeklyReport}
                disabled={weeklyReportLoading}
                style={{
                  padding: "10px 20px",
                  borderRadius: 8,
                  border: "1px solid rgba(59,130,246,0.5)",
                  background: weeklyReportLoading ? "rgba(59,130,246,0.3)" : "rgba(59,130,246,0.2)",
                  color: "#60a5fa",
                  cursor: weeklyReportLoading ? "not-allowed" : "pointer",
                  fontSize: 14,
                  fontWeight: 600,
                }}
              >
                {weeklyReportLoading ? "Generating..." : "🤖 Generate AI Report"}
              </button>
              {weeklyReportData && (
                <>
                  <button
                    onClick={handleExportWeeklyReport}
                    style={{
                      padding: "10px 20px",
                      borderRadius: 8,
                      border: "1px solid rgba(16,185,129,0.5)",
                      background: "rgba(16,185,129,0.2)",
                      color: "#10b981",
                      cursor: "pointer",
                      fontSize: 14,
                      fontWeight: 600,
                    }}
                  >
                    📥 Export CSV
                  </button>
                  <button
                    onClick={handleExportWeeklyReportPDF}
                    style={{
                      padding: "10px 20px",
                      borderRadius: 8,
                      border: "1px solid rgba(239,68,68,0.5)",
                      background: "rgba(239,68,68,0.2)",
                      color: "#ef4444",
                      cursor: "pointer",
                      fontSize: 14,
                      fontWeight: 600,
                    }}
                  >
                    📄 Export PDF
                  </button>
                </>
              )}
            </div>

            {/* Report Display */}
            {weeklyReportLoading ? (
              <div style={{ padding: 40, textAlign: "center", color: "rgba(255,255,255,0.5)" }}>
                <div style={{ marginBottom: 12 }}>🤖 AI is analyzing operational data...</div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>This may take a few moments</div>
              </div>
            ) : weeklyReportError ? (
              <div style={{ padding: 40, textAlign: "center" }}>
                <div style={{ color: "#ef4444", marginBottom: 8 }}>⚠️ Error generating report</div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>{weeklyReportError}</div>
              </div>
            ) : weeklyReportData ? (
              <div>
                {/* Report Header */}
                <div style={{ marginBottom: 24, padding: 16, background: "rgba(59,130,246,0.1)", borderRadius: 8, border: "1px solid rgba(59,130,246,0.3)" }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: "#ffffff", marginBottom: 8 }}>
                    📊 Weekly Operational Report
                  </div>
                  <div style={{ fontSize: 13, color: "rgba(255,255,255,0.7)" }}>
                    Period: {new Date(weeklyReportData.period.startDate).toLocaleDateString()} - {new Date(weeklyReportData.period.endDate).toLocaleDateString()} ({weeklyReportData.period.days} days)
                  </div>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginTop: 4 }}>
                    Generated: {new Date(weeklyReportData.generatedAt).toLocaleString()}
                    {weeklyReportData.summary?.generatedByAI && (
                      <span style={{ marginLeft: 8, color: "#a78bfa" }}>🤖 AI-Generated</span>
                    )}
                  </div>
                </div>

                {/* AI Summary */}
                {weeklyReportData.summary && (
                  <div style={{ marginBottom: 24 }}>
                    <div style={{ fontSize: 16, fontWeight: 700, color: "#ffffff", marginBottom: 12 }}>
                      📝 Executive Summary
                    </div>
                    <div style={{ 
                      padding: 16, 
                      background: "rgba(0,0,0,0.3)", 
                      borderRadius: 8,
                      fontSize: 14,
                      color: "rgba(255,255,255,0.8)",
                      lineHeight: 1.7,
                      whiteSpace: "pre-wrap",
                    }}>
                      {weeklyReportData.summary.overview}
                    </div>
                  </div>
                )}

                {/* Key Metrics */}
                <div style={{ marginBottom: 24 }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: "#ffffff", marginBottom: 12 }}>
                    📈 Key Metrics
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
                    <div style={{ padding: 12, background: "rgba(0,0,0,0.3)", borderRadius: 8 }}>
                      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", marginBottom: 4 }}>Total Shifts</div>
                      <div style={{ fontSize: 20, fontWeight: 700, color: "#ffffff" }}>{weeklyReportData.metrics.totalShifts}</div>
                      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>{weeklyReportData.metrics.completedShifts} completed</div>
                    </div>
                    <div style={{ padding: 12, background: "rgba(0,0,0,0.3)", borderRadius: 8 }}>
                      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", marginBottom: 4 }}>Completion Rate</div>
                      <div style={{ fontSize: 20, fontWeight: 700, color: "#10b981" }}>{weeklyReportData.metrics.completionRate}%</div>
                    </div>
                    <div style={{ padding: 12, background: "rgba(0,0,0,0.3)", borderRadius: 8 }}>
                      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", marginBottom: 4 }}>Callouts</div>
                      <div style={{ fontSize: 20, fontWeight: 700, color: "#f59e0b" }}>{weeklyReportData.metrics.totalCallouts}</div>
                      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>{weeklyReportData.metrics.calloutRate}% rate</div>
                    </div>
                    <div style={{ padding: 12, background: "rgba(0,0,0,0.3)", borderRadius: 8 }}>
                      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", marginBottom: 4 }}>Incidents</div>
                      <div style={{ fontSize: 20, fontWeight: 700, color: "#ef4444" }}>{weeklyReportData.metrics.totalIncidents}</div>
                      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>{weeklyReportData.metrics.openIncidents} open</div>
                    </div>
                    <div style={{ padding: 12, background: "rgba(0,0,0,0.3)", borderRadius: 8 }}>
                      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", marginBottom: 4 }}>Operational Events</div>
                      <div style={{ fontSize: 20, fontWeight: 700, color: "#60a5fa" }}>{weeklyReportData.metrics.totalEvents}</div>
                      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>{weeklyReportData.metrics.highSeverityEvents} high-severity</div>
                    </div>
                  </div>
                </div>

                {/* Highlights */}
                {weeklyReportData.summary?.highlights && weeklyReportData.summary.highlights.length > 0 && (
                  <div style={{ marginBottom: 24 }}>
                    <div style={{ fontSize: 16, fontWeight: 700, color: "#ffffff", marginBottom: 12 }}>
                      ✨ Highlights
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {weeklyReportData.summary.highlights.map((highlight, idx) => (
                        <div key={idx} style={{ padding: 12, background: "rgba(16,185,129,0.1)", borderRadius: 8, border: "1px solid rgba(16,185,129,0.3)" }}>
                          <div style={{ fontSize: 14, color: "#ffffff" }}>• {highlight}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Recommendations */}
                {weeklyReportData.summary?.recommendations && weeklyReportData.summary.recommendations.length > 0 && (
                  <div style={{ marginBottom: 24 }}>
                    <div style={{ fontSize: 16, fontWeight: 700, color: "#ffffff", marginBottom: 12 }}>
                      💡 Recommendations
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {weeklyReportData.summary.recommendations.map((rec, idx) => (
                        <div key={idx} style={{ padding: 12, background: "rgba(251,191,36,0.1)", borderRadius: 8, border: "1px solid rgba(251,191,36,0.3)" }}>
                          <div style={{ fontSize: 14, color: "#ffffff" }}>• {rec}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Trends */}
                {weeklyReportData.trends && (
                  <div style={{ marginBottom: 24 }}>
                    <div style={{ fontSize: 16, fontWeight: 700, color: "#ffffff", marginBottom: 12 }}>
                      📊 Trends
                    </div>
                    <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                      <div style={{ fontSize: 13, color: "rgba(255,255,255,0.7)" }}>
                        Shifts: {weeklyReportData.trends.shifts === "INCREASING" ? "📈" : weeklyReportData.trends.shifts === "DECREASING" ? "📉" : "➡️"} {weeklyReportData.trends.shifts}
                      </div>
                      <div style={{ fontSize: 13, color: "rgba(255,255,255,0.7)" }}>
                        Callouts: {weeklyReportData.trends.callouts === "INCREASING" ? "📈" : weeklyReportData.trends.callouts === "DECREASING" ? "📉" : "➡️"} {weeklyReportData.trends.callouts}
                      </div>
                      <div style={{ fontSize: 13, color: "rgba(255,255,255,0.7)" }}>
                        Incidents: {weeklyReportData.trends.incidents === "INCREASING" ? "📈" : weeklyReportData.trends.incidents === "DECREASING" ? "📉" : "➡️"} {weeklyReportData.trends.incidents}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ padding: 40, textAlign: "center", color: "rgba(255,255,255,0.5)" }}>
                <div style={{ marginBottom: 8, fontSize: 16 }}>📊 Ready to Generate Report</div>
                <div style={{ fontSize: 13, color: "rgba(255,255,255,0.6)" }}>
                  Select a date range and click "Generate AI Report" to create a comprehensive weekly operational summary.
                </div>
              </div>
            )}
          </div>
        )}
      </Card>

      {/* At-Risk Shifts */}
      <Card style={{ marginBottom: 32, padding: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h2 style={{ fontSize: 20, fontWeight: 900, color: "#ffffff" }}>At-Risk Shifts</h2>
          {!atRiskError && (
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.7)" }}>
              {atRiskShifts.length} shift{atRiskShifts.length !== 1 ? "s" : ""} at risk
            </div>
          )}
        </div>
        {atRiskError ? (
          <div style={{ padding: 40, textAlign: "center" }}>
            <div style={{ color: "#ef4444", marginBottom: 8 }}>
              ⚠️ Error loading at-risk shifts
            </div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginBottom: 12 }}>
              {atRiskError?.response?.data?.message || atRiskError?.message || "Unknown error"}
            </div>
            <button
              onClick={() => refetchAtRisk()}
              style={{
                padding: "8px 16px",
                borderRadius: 8,
                border: "1px solid rgba(59,130,246,0.3)",
                background: "rgba(59,130,246,0.2)",
                color: "#60a5fa",
                cursor: "pointer",
                fontSize: 13,
              }}
            >
              Retry
            </button>
          </div>
        ) : atRiskLoading ? (
          <div style={{ padding: 40, textAlign: "center", color: "rgba(255,255,255,0.7)" }}>
            Loading at-risk shifts...
          </div>
        ) : atRiskShifts.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", color: "rgba(255,255,255,0.7)" }}>
            ✅ No shifts at risk
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {atRiskShifts.map((item, idx) => {
              const riskColor =
                item.risk.riskScore >= 80
                  ? "#ef4444"
                  : item.risk.riskScore >= 60
                  ? "#f59e0b"
                  : "#fbbf24";
              return (
                <div
                  key={idx}
                  style={{
                    padding: 16,
                    background: "rgba(15,23,42,0.6)",
                    borderRadius: 8,
                    border: `1px solid ${riskColor}40`,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 8 }}>
                        <span
                          style={{
                            padding: "4px 12px",
                            borderRadius: 12,
                            fontSize: 12,
                            fontWeight: 700,
                            background: `${riskColor}20`,
                            color: riskColor,
                          }}
                        >
                          Risk: {item.risk.riskScore.toFixed(0)} ({item.risk.riskLevel})
                        </span>
                        <span style={{ color: "rgba(255,255,255,0.7)", fontSize: 13 }}>
                          {item.shift.shift_date} {item.shift.shift_start} - {item.shift.shift_end}
                        </span>
                      </div>
                      {item.risk.factors && (
                        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", marginTop: 8 }}>
                          Factors: {Object.keys(item.risk.factors).join(", ")}
                        </div>
                      )}
                    </div>
                    <button
                      style={{
                        padding: "8px 16px",
                        borderRadius: 8,
                        border: "1px solid rgba(59,130,246,0.3)",
                        background: "rgba(59,130,246,0.2)",
                        color: "#60a5fa",
                        cursor: "pointer",
                        fontSize: 13,
                        fontWeight: 600,
                      }}
                    >
                      View Details
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Live Feed */}
      <Card style={{ padding: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h2 style={{ fontSize: 20, fontWeight: 900, color: "#ffffff" }}>Live Situation Room</h2>
          {!feedError && (
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.7)" }}>
              {feedEvents.length} recent events
            </div>
          )}
        </div>
        {feedError ? (
          <div style={{ padding: 40, textAlign: "center" }}>
            <div style={{ color: "#ef4444", marginBottom: 8 }}>
              ⚠️ Error loading feed
            </div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginBottom: 12 }}>
              {feedError?.response?.data?.message || feedError?.message || "Unknown error"}
            </div>
            <button
              onClick={() => refetchFeed()}
              style={{
                padding: "8px 16px",
                borderRadius: 8,
                border: "1px solid rgba(59,130,246,0.3)",
                background: "rgba(59,130,246,0.2)",
                color: "#60a5fa",
                cursor: "pointer",
                fontSize: 13,
              }}
            >
              Retry
            </button>
          </div>
        ) : feedLoading ? (
          <div style={{ padding: 40, textAlign: "center", color: "rgba(255,255,255,0.7)" }}>
            Loading feed...
          </div>
        ) : feedEvents.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", color: "rgba(255,255,255,0.7)" }}>
            No events yet. Events will appear here as they occur.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12, maxHeight: "600px", overflowY: "auto" }}>
            {feedEvents.map((event, idx) => {
              const severityColors = {
                CRITICAL: "#ef4444",
                HIGH: "#f59e0b",
                MEDIUM: "#fbbf24",
                LOW: "#6b7280",
              };
              const color = severityColors[event.severity] || "#6b7280";
              return (
                <div
                  key={event.id || idx}
                  style={{
                    padding: 12,
                    background: "rgba(15,23,42,0.6)",
                    borderRadius: 8,
                    borderLeft: `3px solid ${color}`,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 4 }}>
                        <span
                          style={{
                            padding: "2px 8px",
                            borderRadius: 6,
                            fontSize: 11,
                            fontWeight: 600,
                            background: `${color}20`,
                            color: color,
                          }}
                        >
                          {event.type}
                        </span>
                        <span
                          style={{
                            padding: "2px 8px",
                            borderRadius: 6,
                            fontSize: 11,
                            fontWeight: 600,
                            background: `${color}20`,
                            color: color,
                          }}
                        >
                          {event.severity}
                        </span>
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: "#ffffff", marginBottom: 4 }}>
                        {event.title}
                      </div>
                      {event.summary && (
                        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.7)" }}>{event.summary}</div>
                      )}
                      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 8 }}>
                        {new Date(event.created_at).toLocaleString()}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
