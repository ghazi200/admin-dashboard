import React, { useEffect, useState } from "react";
import { listIncidents, updateIncident, listSites, summarizeIncident } from "../services/api";
import { connectSocket } from "../realtime/socket";
import { getGuardAiOrigin } from "../api/apiOrigin";
import Card from "../components/Card";

export default function Incidents() {
  const [incidents, setIncidents] = useState([]);
  const [sites, setSites] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [summarizingId, setSummarizingId] = useState(null);
  
  // Filters
  const [filters, setFilters] = useState({
    status: "",
    severity: "",
    type: "",
    siteId: "",
  });

  // Selected incident for update modal
  const [selectedIncident, setSelectedIncident] = useState(null);
  const [updateForm, setUpdateForm] = useState({
    status: "",
    ai_summary: "",
  });

  useEffect(() => {
    loadSites();
    loadIncidents();
    
    // Set up real-time listener for new incidents
    const socket = connectSocket();
    if (socket) {
      const handleNewIncident = (incident) => {
        console.log("🆕 New incident received:", incident);
        loadIncidents();
      };
      
      const handleUpdatedIncident = () => {
        console.log("🔄 Incident updated");
        loadIncidents();
      };
      
      socket.on("incidents:new", handleNewIncident);
      socket.on("incidents:updated", handleUpdatedIncident);
      
      return () => {
        socket.off("incidents:new", handleNewIncident);
        socket.off("incidents:updated", handleUpdatedIncident);
      };
    }
  }, []);

  useEffect(() => {
    loadIncidents();
  }, [filters]);

  async function loadSites() {
    try {
      const res = await listSites();
      const raw = res?.data;
      const list = Array.isArray(raw) ? raw : (raw?.sites ?? raw?.data ?? []);
      setSites(Array.isArray(list) ? list : []);
    } catch (err) {
      console.error("Error loading sites:", err);
    }
  }

  async function loadIncidents() {
    setLoading(true);
    setError("");
    try {
      const params = {};
      
      if (filters.status) params.status = filters.status;
      if (filters.severity) params.severity = filters.severity;
      if (filters.type) params.type = filters.type;
      if (filters.siteId) params.siteId = filters.siteId;
      
      params.limit = 50; // Default limit

      const res = await listIncidents(params);
      const raw = res?.data;
      const list = Array.isArray(raw) ? raw : (raw?.incidents ?? raw?.data ?? []);
      const incidentsData = Array.isArray(list) ? list : [];
      console.log("📋 Loaded incidents:", incidentsData.length);
      setIncidents(incidentsData);
    } catch (err) {
      console.error("Error loading incidents:", err);
      setError(err.response?.data?.message || "Failed to load incidents");
    } finally {
      setLoading(false);
    }
  }

  async function handleUpdateIncident(incidentId) {
    try {
      const data = {};
      if (updateForm.status) data.status = updateForm.status;
      if (updateForm.ai_summary) data.ai_summary = updateForm.ai_summary;

      await updateIncident(incidentId, data);
      setSelectedIncident(null);
      setUpdateForm({ status: "", ai_summary: "" });
      loadIncidents();
    } catch (err) {
      console.error("Error updating incident:", err);
      setError(err.response?.data?.message || "Failed to update incident");
    }
  }

  async function handleSummarize(incidentId) {
    setSummarizingId(incidentId);
    setError("");
    try {
      const res = await summarizeIncident(incidentId);
      // Reload incidents to get updated data
      await loadIncidents();
    } catch (err) {
      console.error("Error summarizing incident:", err);
      setError(err.response?.data?.message || "Failed to generate AI summary");
    } finally {
      setSummarizingId(null);
    }
  }

  const getSeverityColor = (severity) => {
    switch (severity?.toUpperCase()) {
      case "HIGH":
        return "#ef4444";
      case "MEDIUM":
        return "#f59e0b";
      case "LOW":
        return "#10b981";
      default:
        return "#6b7280";
    }
  };

  const getStatusColor = (status) => {
    switch (status?.toUpperCase()) {
      case "OPEN":
        return "#3b82f6";
      case "ACKNOWLEDGED":
        return "#8b5cf6";
      case "RESOLVED":
        return "#10b981";
      default:
        return "#6b7280";
    }
  };

  const sitesList = Array.isArray(sites) ? sites : [];
  const incidentsList = Array.isArray(incidents) ? incidents : [];
  const siteById = sitesList.reduce((acc, site) => {
    acc[site.id] = site;
    return acc;
  }, {});

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 28, fontWeight: 900, marginBottom: 8, color: "#ffffff" }}>
          Incidents
        </h1>
        <p style={{ color: "rgba(255,255,255,0.7)", fontSize: 14 }}>
          View and manage incident reports from guards
        </p>
      </div>

      {/* Filters */}
      <Card style={{ marginBottom: 24, padding: 16 }}>
        {/* Status Toggle Buttons */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "block", marginBottom: 8, fontSize: 12, color: "rgba(255,255,255,0.7)", fontWeight: 600 }}>
            Filter by Status
          </label>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              onClick={() => setFilters({ ...filters, status: "" })}
              style={{
                padding: "10px 20px",
                borderRadius: 8,
                border: filters.status === "" 
                  ? "2px solid #3b82f6" 
                  : "1px solid rgba(148,163,184,0.3)",
                background: filters.status === "" 
                  ? "rgba(59,130,246,0.2)" 
                  : "rgba(15,23,42,0.8)",
                color: filters.status === "" ? "#60a5fa" : "rgba(255,255,255,0.7)",
                cursor: "pointer",
                fontSize: 14,
                fontWeight: filters.status === "" ? 700 : 600,
                transition: "all 0.2s ease",
              }}
            >
              All
            </button>
            <button
              onClick={() => setFilters({ ...filters, status: "OPEN" })}
              style={{
                padding: "10px 20px",
                borderRadius: 8,
                border: filters.status === "OPEN" 
                  ? "2px solid #3b82f6" 
                  : "1px solid rgba(148,163,184,0.3)",
                background: filters.status === "OPEN" 
                  ? "rgba(59,130,246,0.2)" 
                  : "rgba(15,23,42,0.8)",
                color: filters.status === "OPEN" ? "#60a5fa" : "rgba(255,255,255,0.7)",
                cursor: "pointer",
                fontSize: 14,
                fontWeight: filters.status === "OPEN" ? 700 : 600,
                transition: "all 0.2s ease",
              }}
            >
              Open
            </button>
            <button
              onClick={() => setFilters({ ...filters, status: "ACKNOWLEDGED" })}
              style={{
                padding: "10px 20px",
                borderRadius: 8,
                border: filters.status === "ACKNOWLEDGED" 
                  ? "2px solid #8b5cf6" 
                  : "1px solid rgba(148,163,184,0.3)",
                background: filters.status === "ACKNOWLEDGED" 
                  ? "rgba(139,92,246,0.2)" 
                  : "rgba(15,23,42,0.8)",
                color: filters.status === "ACKNOWLEDGED" ? "#a78bfa" : "rgba(255,255,255,0.7)",
                cursor: "pointer",
                fontSize: 14,
                fontWeight: filters.status === "ACKNOWLEDGED" ? 700 : 600,
                transition: "all 0.2s ease",
              }}
            >
              Acknowledged
            </button>
            <button
              onClick={() => setFilters({ ...filters, status: "RESOLVED" })}
              style={{
                padding: "10px 20px",
                borderRadius: 8,
                border: filters.status === "RESOLVED" 
                  ? "2px solid #10b981" 
                  : "1px solid rgba(148,163,184,0.3)",
                background: filters.status === "RESOLVED" 
                  ? "rgba(16,185,129,0.2)" 
                  : "rgba(15,23,42,0.8)",
                color: filters.status === "RESOLVED" ? "#34d399" : "rgba(255,255,255,0.7)",
                cursor: "pointer",
                fontSize: 14,
                fontWeight: filters.status === "RESOLVED" ? 700 : 600,
                transition: "all 0.2s ease",
              }}
            >
              Resolved
            </button>
          </div>
        </div>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>

          <div style={{ flex: 1, minWidth: 150 }}>
            <label style={{ display: "block", marginBottom: 6, fontSize: 12, color: "rgba(255,255,255,0.7)" }}>
              Severity
            </label>
            <select
              value={filters.severity}
              onChange={(e) => setFilters({ ...filters, severity: e.target.value })}
              style={{
                width: "100%",
                padding: "8px 12px",
                borderRadius: 8,
                border: "1px solid rgba(148,163,184,0.3)",
                background: "rgba(15,23,42,0.8)",
                color: "#ffffff",
              }}
            >
              <option value="">All Severities</option>
              <option value="HIGH">High</option>
              <option value="MEDIUM">Medium</option>
              <option value="LOW">Low</option>
            </select>
          </div>

          <div style={{ flex: 1, minWidth: 150 }}>
            <label style={{ display: "block", marginBottom: 6, fontSize: 12, color: "rgba(255,255,255,0.7)" }}>
              Type
            </label>
            <select
              value={filters.type}
              onChange={(e) => setFilters({ ...filters, type: e.target.value })}
              style={{
                width: "100%",
                padding: "8px 12px",
                borderRadius: 8,
                border: "1px solid rgba(148,163,184,0.3)",
                background: "rgba(15,23,42,0.8)",
                color: "#ffffff",
              }}
            >
              <option value="">All Types</option>
              <option value="TRESPASS">Trespass</option>
              <option value="THEFT">Theft</option>
              <option value="VANDALISM">Vandalism</option>
              <option value="MEDICAL">Medical</option>
              <option value="OTHER">Other</option>
            </select>
          </div>

          <div style={{ flex: 1, minWidth: 150 }}>
            <label style={{ display: "block", marginBottom: 6, fontSize: 12, color: "rgba(255,255,255,0.7)" }}>
              Site
            </label>
            <select
              value={filters.siteId}
              onChange={(e) => setFilters({ ...filters, siteId: e.target.value })}
              style={{
                width: "100%",
                padding: "8px 12px",
                borderRadius: 8,
                border: "1px solid rgba(148,163,184,0.3)",
                background: "rgba(15,23,42,0.8)",
                color: "#ffffff",
              }}
            >
              <option value="">All Sites</option>
              {sitesList.map((site) => (
                <option key={site.id} value={site.id}>
                  {site.name}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={() => setFilters({ status: "", severity: "", type: "", siteId: "" })}
            style={{
              padding: "8px 16px",
              borderRadius: 8,
              border: "1px solid rgba(148,163,184,0.3)",
              background: "rgba(15,23,42,0.8)",
              color: "#ffffff",
              cursor: "pointer",
            }}
          >
            Clear
          </button>
        </div>
      </Card>

      {error && (
        <div
          style={{
            padding: 12,
            borderRadius: 8,
            background: "rgba(239,68,68,0.2)",
            color: "#ef4444",
            marginBottom: 16,
          }}
        >
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ padding: 40, textAlign: "center", color: "rgba(255,255,255,0.7)" }}>
          Loading incidents...
        </div>
      ) : incidentsList.length === 0 ? (
        <Card style={{ padding: 40, textAlign: "center" }}>
          <p style={{ color: "rgba(255,255,255,0.7)" }}>No incidents found</p>
        </Card>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {incidentsList.map((incident, idx) => {
            const site = incident?.site_id ? siteById[incident.site_id] : null;
            if (!incident?.id) {
              console.warn("⚠️ Incident missing ID:", incident);
            }
            return (
              <Card key={incident?.id ?? idx} style={{ padding: 20 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, marginBottom: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 8 }}>
                      <span
                        style={{
                          padding: "4px 12px",
                          borderRadius: 12,
                          fontSize: 12,
                          fontWeight: 700,
                          background: getSeverityColor(incident.severity) + "20",
                          color: getSeverityColor(incident.severity),
                        }}
                      >
                        {incident.severity}
                      </span>
                      <span
                        style={{
                          padding: "4px 12px",
                          borderRadius: 12,
                          fontSize: 12,
                          fontWeight: 700,
                          background: getStatusColor(incident.status) + "20",
                          color: getStatusColor(incident.status),
                        }}
                      >
                        {incident.status}
                      </span>
                      <span style={{ color: "rgba(255,255,255,0.7)", fontSize: 13 }}>
                        {incident.type}
                      </span>
                    </div>
                    <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8, color: "#ffffff" }}>
                      {incident.description?.substring(0, 100)}
                      {incident.description?.length > 100 ? "..." : ""}
                    </h3>
                    {site && (
                      <div style={{ marginBottom: 8, color: "rgba(255,255,255,0.7)", fontSize: 13 }}>
                        📍 {site.name}
                        {site.address_1 && ` - ${site.address_1}`}
                        {site.city && `, ${site.city}`}
                      </div>
                    )}
                    {incident.location_text && !site && (
                      <div style={{ marginBottom: 8, color: "rgba(255,255,255,0.7)", fontSize: 13 }}>
                        📍 {incident.location_text}
                      </div>
                    )}
                    <p style={{ color: "rgba(255,255,255,0.6)", fontSize: 13, lineHeight: 1.5 }}>
                      {incident.description}
                    </p>
                    {incident.ai_summary && (
                      <div
                        style={{
                          marginTop: 12,
                          padding: 12,
                          borderRadius: 8,
                          background: "rgba(59,130,246,0.1)",
                          border: "1px solid rgba(59,130,246,0.2)",
                        }}
                      >
                        <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6, color: "#60a5fa" }}>
                          AI Summary
                        </div>
                        <p style={{ color: "rgba(255,255,255,0.8)", fontSize: 13 }}>
                          {incident.ai_summary}
                        </p>
                      </div>
                    )}
                    {incident.ai_tags_json && (
                      <>
                        {incident.ai_tags_json.riskCategory && (
                          <div
                            style={{
                              marginTop: 12,
                              padding: 12,
                              borderRadius: 8,
                              background: "rgba(139,92,246,0.1)",
                              border: "1px solid rgba(139,92,246,0.2)",
                            }}
                          >
                            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6, color: "#a78bfa" }}>
                              Risk Category
                            </div>
                            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                              <span
                                style={{
                                  padding: "4px 12px",
                                  borderRadius: 12,
                                  fontSize: 12,
                                  fontWeight: 600,
                                  background: "rgba(139,92,246,0.2)",
                                  color: "#a78bfa",
                                }}
                              >
                                {incident.ai_tags_json.riskCategory}
                              </span>
                              {incident.ai_tags_json.riskLevel && (
                                <span
                                  style={{
                                    padding: "4px 12px",
                                    borderRadius: 12,
                                    fontSize: 12,
                                    fontWeight: 600,
                                    background: getSeverityColor(incident.ai_tags_json.riskLevel) + "20",
                                    color: getSeverityColor(incident.ai_tags_json.riskLevel),
                                  }}
                                >
                                  {incident.ai_tags_json.riskLevel} Risk
                                </span>
                              )}
                              {incident.ai_tags_json.urgency && (
                                <span
                                  style={{
                                    padding: "4px 12px",
                                    borderRadius: 12,
                                    fontSize: 12,
                                    fontWeight: 600,
                                    background: "rgba(251,191,36,0.2)",
                                    color: "#fbbf24",
                                  }}
                                >
                                  {incident.ai_tags_json.urgency} Urgency
                                </span>
                              )}
                            </div>
                          </div>
                        )}
                        {incident.ai_tags_json.timeline && Array.isArray(incident.ai_tags_json.timeline) && incident.ai_tags_json.timeline.length > 0 && (
                          <div
                            style={{
                              marginTop: 12,
                              padding: 12,
                              borderRadius: 8,
                              background: "rgba(16,185,129,0.1)",
                              border: "1px solid rgba(16,185,129,0.2)",
                            }}
                          >
                            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8, color: "#34d399" }}>
                              Timeline
                            </div>
                            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                              {incident.ai_tags_json.timeline.map((item, idx) => (
                                <div key={idx} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                                  <div
                                    style={{
                                      width: 8,
                                      height: 8,
                                      borderRadius: "50%",
                                      background: "#34d399",
                                      marginTop: 6,
                                      flexShrink: 0,
                                    }}
                                  />
                                  <div style={{ flex: 1 }}>
                                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginBottom: 2 }}>
                                      {new Date(item.timestamp).toLocaleString()}
                                    </div>
                                    <div style={{ fontSize: 13, color: "rgba(255,255,255,0.8)" }}>
                                      {item.event}
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        {incident.ai_tags_json.recommendedActions && Array.isArray(incident.ai_tags_json.recommendedActions) && incident.ai_tags_json.recommendedActions.length > 0 && (
                          <div
                            style={{
                              marginTop: 12,
                              padding: 12,
                              borderRadius: 8,
                              background: "rgba(245,158,11,0.1)",
                              border: "1px solid rgba(245,158,11,0.2)",
                            }}
                          >
                            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6, color: "#fbbf24" }}>
                              Recommended Actions
                            </div>
                            <ul style={{ margin: 0, paddingLeft: 20, color: "rgba(255,255,255,0.8)", fontSize: 13 }}>
                              {incident.ai_tags_json.recommendedActions.map((action, idx) => (
                                <li key={idx} style={{ marginBottom: 4 }}>
                                  {action}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </>
                    )}
                    {incident.attachments_json && Array.isArray(incident.attachments_json) && incident.attachments_json.length > 0 && (
                      <div style={{ marginTop: 12 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6, color: "rgba(255,255,255,0.7)" }}>
                          Attachments ({incident.attachments_json.length})
                        </div>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          {incident.attachments_json.map((att, idx) => (
                            <a
                              key={idx}
                              href={getGuardAiOrigin() ? `${getGuardAiOrigin()}${att.url}` : att.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{
                                padding: "6px 12px",
                                borderRadius: 6,
                                background: "rgba(59,130,246,0.2)",
                                color: "#60a5fa",
                                textDecoration: "none",
                                fontSize: 12,
                              }}
                            >
                              {att.file_name}
                            </a>
                          ))}
                        </div>
                      </div>
                    )}
                    <div style={{ marginTop: 12, fontSize: 12, color: "rgba(255,255,255,0.5)" }}>
                      Reported: {new Date(incident.reported_at).toLocaleString()}
                      {incident.occurred_at && ` • Occurred: ${new Date(incident.occurred_at).toLocaleString()}`}
                    </div>
                  </div>
                  <div 
                    style={{ 
                      display: "flex", 
                      gap: 8, 
                      flexDirection: "column", 
                      flexShrink: 0, 
                      minWidth: 120,
                      position: "relative",
                      zIndex: 1,
                    }}
                  >
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleSummarize(incident.id);
                      }}
                      disabled={summarizingId === incident.id}
                      style={{
                        padding: "8px 16px",
                        borderRadius: 8,
                        border: "1px solid rgba(148,163,184,0.3)",
                        background: summarizingId === incident.id 
                          ? "rgba(148,163,184,0.2)" 
                          : "rgba(139,92,246,0.2)",
                        color: summarizingId === incident.id 
                          ? "rgba(255,255,255,0.5)" 
                          : "#a78bfa",
                        cursor: summarizingId === incident.id ? "not-allowed" : "pointer",
                        fontSize: 13,
                        fontWeight: 600,
                        opacity: summarizingId === incident.id ? 0.6 : 1,
                        whiteSpace: "nowrap",
                        width: "100%",
                      }}
                    >
                      {summarizingId === incident.id ? "Generating..." : "🤖 Summarize"}
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setSelectedIncident(incident);
                        setUpdateForm({ status: incident.status, ai_summary: incident.ai_summary || "" });
                      }}
                      style={{
                        padding: "8px 16px",
                        borderRadius: 8,
                        border: "1px solid rgba(148,163,184,0.3)",
                        background: "rgba(59,130,246,0.2)",
                        color: "#60a5fa",
                        cursor: "pointer",
                        fontSize: 13,
                        fontWeight: 600,
                        whiteSpace: "nowrap",
                        width: "100%",
                      }}
                    >
                      Update
                    </button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Update Modal */}
      {selectedIncident && (
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
          }}
          onClick={() => setSelectedIncident(null)}
        >
          <Card
            style={{
              width: "90%",
              maxWidth: 500,
              padding: 24,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ fontSize: 20, fontWeight: 900, marginBottom: 20, color: "#ffffff" }}>
              Update Incident
            </h2>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", marginBottom: 6, fontSize: 12, color: "rgba(255,255,255,0.7)" }}>
                Status
              </label>
              <select
                value={updateForm.status}
                onChange={(e) => setUpdateForm({ ...updateForm, status: e.target.value })}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: 8,
                  border: "1px solid rgba(148,163,184,0.3)",
                  background: "rgba(15,23,42,0.8)",
                  color: "#ffffff",
                }}
              >
                <option value="OPEN">Open</option>
                <option value="ACKNOWLEDGED">Acknowledged</option>
                <option value="RESOLVED">Resolved</option>
              </select>
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: "block", marginBottom: 6, fontSize: 12, color: "rgba(255,255,255,0.7)" }}>
                AI Summary (optional)
              </label>
              <textarea
                value={updateForm.ai_summary}
                onChange={(e) => setUpdateForm({ ...updateForm, ai_summary: e.target.value })}
                rows={4}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: 8,
                  border: "1px solid rgba(148,163,184,0.3)",
                  background: "rgba(15,23,42,0.8)",
                  color: "#ffffff",
                  fontFamily: "inherit",
                }}
                placeholder="Add AI-generated summary or notes..."
              />
            </div>
            <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
              <button
                onClick={() => setSelectedIncident(null)}
                style={{
                  padding: "10px 20px",
                  borderRadius: 8,
                  border: "1px solid rgba(148,163,184,0.3)",
                  background: "transparent",
                  color: "rgba(255,255,255,0.7)",
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => handleUpdateIncident(selectedIncident.id)}
                style={{
                  padding: "10px 20px",
                  borderRadius: 8,
                  border: "none",
                  background: "#3b82f6",
                  color: "#ffffff",
                  cursor: "pointer",
                  fontWeight: 600,
                }}
              >
                Save
              </button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
