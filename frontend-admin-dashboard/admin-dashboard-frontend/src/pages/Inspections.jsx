import React, { useEffect, useState } from "react";
import { listInspectionRequests, updateInspectionRequest, listSites, listGuards, createInspectionRequest } from "../services/api";
import { connectSocket } from "../realtime/socket";
import Card from "../components/Card";

export default function Inspections() {
  const [requests, setRequests] = useState([]);
  const [sites, setSites] = useState([]);
  const [guards, setGuards] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  
  // Filters
  const [filters, setFilters] = useState({
    status: "",
    siteId: "",
    guardId: "",
  });

  // Create form state
  const [createForm, setCreateForm] = useState({
    site_id: "",
    guard_id: "",
    shift_id: "",
    instructions: "",
    required_items: {
      selfie: true,
      badge: false,
      signage: false,
    },
    due_minutes: 10,
  });

  // Selected request for update modal
  const [selectedRequest, setSelectedRequest] = useState(null);

  useEffect(() => {
    loadSites();
    loadGuards();
    loadRequests();
    
    // Set up real-time listener for inspection events
    const socket = connectSocket();
    if (socket) {
      const handleNewRequest = () => {
        console.log("🆕 New inspection request created");
        loadRequests();
      };
      
      const handleNewSubmission = () => {
        console.log("📸 New inspection submission received");
        loadRequests();
      };
      
      const handleStatusChanged = () => {
        console.log("🔄 Inspection status changed");
        loadRequests();
      };
      
      socket.on("inspection:request:created", handleNewRequest);
      socket.on("inspection:submitted", handleNewSubmission);
      socket.on("inspection:status_changed", handleStatusChanged);
      
      return () => {
        socket.off("inspection:request:created", handleNewRequest);
        socket.off("inspection:submitted", handleNewSubmission);
        socket.off("inspection:status_changed", handleStatusChanged);
      };
    }
  }, []);

  useEffect(() => {
    loadRequests();
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

  async function loadGuards() {
    try {
      const res = await listGuards();
      const raw = res?.data;
      const list = Array.isArray(raw) ? raw : (raw?.guards ?? raw?.data ?? []);
      setGuards(Array.isArray(list) ? list : []);
    } catch (err) {
      console.error("Error loading guards:", err);
    }
  }

  async function loadRequests() {
    setLoading(true);
    setError("");
    try {
      const params = {};
      if (filters.status) params.status = filters.status;
      if (filters.siteId) params.siteId = filters.siteId;
      if (filters.guardId) params.guardId = filters.guardId;
      params.limit = 50;

      const res = await listInspectionRequests(params);
      const raw = res?.data;
      const list = Array.isArray(raw) ? raw : (raw?.requests ?? raw?.data ?? []);
      setRequests(Array.isArray(list) ? list : []);
    } catch (err) {
      console.error("Error loading inspection requests:", err);
      setError(err.response?.data?.message || "Failed to load inspection requests");
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateRequest() {
    try {
      setError("");
      await createInspectionRequest(createForm);
      setShowCreateModal(false);
      setCreateForm({
        site_id: "",
        guard_id: "",
        shift_id: "",
        instructions: "",
        required_items: {
          selfie: true,
          badge: false,
          signage: false,
        },
        due_minutes: 10,
      });
      loadRequests();
    } catch (err) {
      console.error("Error creating inspection request:", err);
      setError(err.response?.data?.message || "Failed to create inspection request");
    }
  }

  async function handleUpdateRequest(requestId, status) {
    try {
      await updateInspectionRequest(requestId, { status });
      setSelectedRequest(null);
      loadRequests();
    } catch (err) {
      console.error("Error updating inspection request:", err);
      setError(err.response?.data?.message || "Failed to update inspection request");
    }
  }

  const getStatusColor = (status) => {
    switch (status?.toUpperCase()) {
      case "PENDING":
        return "#f59e0b";
      case "SUBMITTED":
        return "#3b82f6";
      case "APPROVED":
        return "#10b981";
      case "REJECTED":
        return "#ef4444";
      case "EXPIRED":
        return "#6b7280";
      default:
        return "#6b7280";
    }
  };

  const sitesList = Array.isArray(sites) ? sites : [];
  const guardsList = Array.isArray(guards) ? guards : [];
  const requestsList = Array.isArray(requests) ? requests : [];
  const siteById = sitesList.reduce((acc, site) => {
    acc[site.id] = site;
    return acc;
  }, {});

  const guardById = guardsList.reduce((acc, guard) => {
    acc[guard.id] = guard;
    return acc;
  }, {});

  return (
    <div>
      <div style={{ marginBottom: 24, display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 900, marginBottom: 8, color: "#ffffff" }}>
            Remote Inspections
          </h1>
          <p style={{ color: "rgba(255,255,255,0.7)", fontSize: 14 }}>
            Create and manage inspection requests for guards
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          style={{
            padding: "12px 24px",
            borderRadius: 8,
            border: "none",
            background: "#3b82f6",
            color: "#ffffff",
            cursor: "pointer",
            fontWeight: 600,
            fontSize: 14,
          }}
        >
          + Create Request
        </button>
      </div>

      {/* Filters */}
      <Card style={{ marginBottom: 24, padding: 16 }}>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div style={{ flex: 1, minWidth: 150 }}>
            <label style={{ display: "block", marginBottom: 6, fontSize: 12, color: "rgba(255,255,255,0.7)" }}>
              Status
            </label>
            <select
              value={filters.status}
              onChange={(e) => setFilters({ ...filters, status: e.target.value })}
              style={{
                width: "100%",
                padding: "8px 12px",
                borderRadius: 8,
                border: "1px solid rgba(148,163,184,0.3)",
                background: "rgba(15,23,42,0.8)",
                color: "#ffffff",
              }}
            >
              <option value="">All Statuses</option>
              <option value="PENDING">Pending</option>
              <option value="SUBMITTED">Submitted</option>
              <option value="APPROVED">Approved</option>
              <option value="REJECTED">Rejected</option>
              <option value="EXPIRED">Expired</option>
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

          <div style={{ flex: 1, minWidth: 150 }}>
            <label style={{ display: "block", marginBottom: 6, fontSize: 12, color: "rgba(255,255,255,0.7)" }}>
              Guard
            </label>
            <select
              value={filters.guardId}
              onChange={(e) => setFilters({ ...filters, guardId: e.target.value })}
              style={{
                width: "100%",
                padding: "8px 12px",
                borderRadius: 8,
                border: "1px solid rgba(148,163,184,0.3)",
                background: "rgba(15,23,42,0.8)",
                color: "#ffffff",
              }}
            >
              <option value="">All Guards</option>
              {guardsList.map((guard) => (
                <option key={guard.id} value={guard.id}>
                  {guard.name}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={() => setFilters({ status: "", siteId: "", guardId: "" })}
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
          Loading inspection requests...
        </div>
      ) : requestsList.length === 0 ? (
        <Card style={{ padding: 40, textAlign: "center" }}>
          <p style={{ color: "rgba(255,255,255,0.7)" }}>No inspection requests found</p>
        </Card>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {requestsList.map((request, reqIdx) => {
            const site = request?.site_id ? siteById[request.site_id] : null;
            const guard = request?.guard_id ? guardById[request.guard_id] : null;
            const submissionsRaw = request?.submissions;
            const submissions = Array.isArray(submissionsRaw) ? submissionsRaw : [];
            const latestSubmission = submissions.length > 0 ? submissions[0] : null;

            return (
              <Card key={request?.id ?? reqIdx} style={{ padding: 20 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 8 }}>
                      <span
                        style={{
                          padding: "4px 12px",
                          borderRadius: 12,
                          fontSize: 12,
                          fontWeight: 700,
                          background: getStatusColor(request.status) + "20",
                          color: getStatusColor(request.status),
                        }}
                      >
                        {request.status}
                      </span>
                      {request.challenge_code && (
                        <span style={{ color: "rgba(255,255,255,0.7)", fontSize: 13, fontFamily: "monospace" }}>
                          Code: {request.challenge_code}
                        </span>
                      )}
                    </div>
                    {site && (
                      <div style={{ marginBottom: 8, color: "rgba(255,255,255,0.7)", fontSize: 13 }}>
                        📍 {site.name}
                      </div>
                    )}
                    {guard && (
                      <div style={{ marginBottom: 8, color: "rgba(255,255,255,0.7)", fontSize: 13 }}>
                        👤 {guard.name} {guard.email ? `(${guard.email})` : ""}
                      </div>
                    )}
                    {request.instructions && (
                      <p style={{ color: "rgba(255,255,255,0.8)", fontSize: 14, lineHeight: 1.5, marginBottom: 12 }}>
                        {request.instructions}
                      </p>
                    )}
                    {request.required_items_json && (
                      <div style={{ marginBottom: 12 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6, color: "rgba(255,255,255,0.7)" }}>
                          Required Items:
                        </div>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          {request.required_items_json.selfie && (
                            <span style={{ padding: "4px 8px", borderRadius: 6, background: "rgba(59,130,246,0.2)", color: "#60a5fa", fontSize: 12 }}>
                              📸 Selfie
                            </span>
                          )}
                          {request.required_items_json.badge && (
                            <span style={{ padding: "4px 8px", borderRadius: 6, background: "rgba(59,130,246,0.2)", color: "#60a5fa", fontSize: 12 }}>
                              🎫 Badge
                            </span>
                          )}
                          {request.required_items_json.signage && (
                            <span style={{ padding: "4px 8px", borderRadius: 6, background: "rgba(59,130,246,0.2)", color: "#60a5fa", fontSize: 12 }}>
                              🏢 Signage
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                    {latestSubmission && (
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
                          Latest Submission
                        </div>
                        {latestSubmission.comment && (
                          <p style={{ color: "rgba(255,255,255,0.8)", fontSize: 13, marginBottom: 8 }}>
                            {latestSubmission.comment}
                          </p>
                        )}
                        {latestSubmission.photos_json && Array.isArray(latestSubmission.photos_json) && latestSubmission.photos_json.length > 0 && (
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                            {latestSubmission.photos_json.map((photo, idx) => (
                              <a
                                key={idx}
                                href={`http://localhost:4000${photo.url}`}
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
                                📷 Photo {idx + 1}
                              </a>
                            ))}
                          </div>
                        )}
                        <div style={{ marginTop: 8, fontSize: 12, color: "rgba(255,255,255,0.6)" }}>
                          Submitted: {new Date(latestSubmission.submitted_at).toLocaleString()}
                        </div>
                      </div>
                    )}
                    <div style={{ marginTop: 12, fontSize: 12, color: "rgba(255,255,255,0.5)" }}>
                      Created: {new Date(request.created_at).toLocaleString()}
                      {request.due_at && ` • Due: ${new Date(request.due_at).toLocaleString()}`}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexDirection: "column" }}>
                    {request.status === "SUBMITTED" && (
                      <>
                        <button
                          onClick={() => handleUpdateRequest(request.id, "APPROVED")}
                          style={{
                            padding: "8px 16px",
                            borderRadius: 8,
                            border: "none",
                            background: "#10b981",
                            color: "#ffffff",
                            cursor: "pointer",
                            fontSize: 13,
                            fontWeight: 600,
                          }}
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => handleUpdateRequest(request.id, "REJECTED")}
                          style={{
                            padding: "8px 16px",
                            borderRadius: 8,
                            border: "none",
                            background: "#ef4444",
                            color: "#ffffff",
                            cursor: "pointer",
                            fontSize: 13,
                            fontWeight: 600,
                          }}
                        >
                          Reject
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create Request Modal */}
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
          }}
          onClick={() => setShowCreateModal(false)}
        >
          <Card
            style={{
              width: "90%",
              maxWidth: 600,
              padding: 24,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ fontSize: 20, fontWeight: 900, marginBottom: 20, color: "#ffffff" }}>
              Create Inspection Request
            </h2>
            
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", marginBottom: 6, fontSize: 12, color: "rgba(255,255,255,0.7)" }}>
                Site *
              </label>
              <select
                value={createForm.site_id}
                onChange={(e) => setCreateForm({ ...createForm, site_id: e.target.value })}
                required
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: 8,
                  border: "1px solid rgba(148,163,184,0.3)",
                  background: "rgba(15,23,42,0.8)",
                  color: "#ffffff",
                }}
              >
                <option value="">Select a site</option>
                {sitesList.map((site) => (
                  <option key={site.id} value={site.id}>
                    {site.name}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", marginBottom: 6, fontSize: 12, color: "rgba(255,255,255,0.7)" }}>
                Guard (leave empty for all guards on site)
              </label>
              <select
                value={createForm.guard_id}
                onChange={(e) => setCreateForm({ ...createForm, guard_id: e.target.value })}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: 8,
                  border: "1px solid rgba(148,163,184,0.3)",
                  background: "rgba(15,23,42,0.8)",
                  color: "#ffffff",
                }}
              >
                <option value="">All guards on site</option>
                {guardsList.map((guard) => (
                  <option key={guard.id} value={guard.id}>
                    {guard.name}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", marginBottom: 6, fontSize: 12, color: "rgba(255,255,255,0.7)" }}>
                Instructions
              </label>
              <textarea
                value={createForm.instructions}
                onChange={(e) => setCreateForm({ ...createForm, instructions: e.target.value })}
                rows={3}
                placeholder="e.g., Please take a selfie showing the lobby area and your badge"
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: 8,
                  border: "1px solid rgba(148,163,184,0.3)",
                  background: "rgba(15,23,42,0.8)",
                  color: "#ffffff",
                  fontFamily: "inherit",
                }}
              />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", marginBottom: 6, fontSize: 12, color: "rgba(255,255,255,0.7)" }}>
                Required Items
              </label>
              <div style={{ display: "flex", gap: 12, flexDirection: "column" }}>
                <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={createForm.required_items.selfie}
                    onChange={(e) =>
                      setCreateForm({
                        ...createForm,
                        required_items: { ...createForm.required_items, selfie: e.target.checked },
                      })
                    }
                  />
                  <span style={{ color: "rgba(255,255,255,0.8)" }}>📸 Selfie Required</span>
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={createForm.required_items.badge}
                    onChange={(e) =>
                      setCreateForm({
                        ...createForm,
                        required_items: { ...createForm.required_items, badge: e.target.checked },
                      })
                    }
                  />
                  <span style={{ color: "rgba(255,255,255,0.8)" }}>🎫 Badge Required</span>
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={createForm.required_items.signage}
                    onChange={(e) =>
                      setCreateForm({
                        ...createForm,
                        required_items: { ...createForm.required_items, signage: e.target.checked },
                      })
                    }
                  />
                  <span style={{ color: "rgba(255,255,255,0.8)" }}>🏢 Site Signage Required</span>
                </label>
              </div>
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ display: "block", marginBottom: 6, fontSize: 12, color: "rgba(255,255,255,0.7)" }}>
                Deadline (minutes from now)
              </label>
              <input
                type="number"
                value={createForm.due_minutes}
                onChange={(e) => setCreateForm({ ...createForm, due_minutes: parseInt(e.target.value) || 10 })}
                min="1"
                max="120"
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: 8,
                  border: "1px solid rgba(148,163,184,0.3)",
                  background: "rgba(15,23,42,0.8)",
                  color: "#ffffff",
                }}
              />
            </div>

            <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
              <button
                onClick={() => setShowCreateModal(false)}
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
                onClick={handleCreateRequest}
                disabled={!createForm.site_id}
                style={{
                  padding: "10px 20px",
                  borderRadius: 8,
                  border: "none",
                  background: createForm.site_id ? "#3b82f6" : "rgba(59,130,246,0.5)",
                  color: "#ffffff",
                  cursor: createForm.site_id ? "pointer" : "not-allowed",
                  fontWeight: 600,
                }}
              >
                Create Request
              </button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
