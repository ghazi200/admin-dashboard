// src/pages/AIRanking.jsx
import React, { useEffect, useState } from "react";
import Card from "../components/Card";
import Modal from "../components/Modal";
import { getAIRankings, overrideAIDecision, listGuards } from "../services/api";
import { hasAccess } from "../utils/access";

export default function AIRanking() {
  const canOverride = hasAccess("shifts:write"); // Requires write permission to override

  const [rankings, setRankings] = useState([]);
  const [guards, setGuards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [statusFilter, setStatusFilter] = useState("OPEN");
  const [overrideModal, setOverrideModal] = useState(null);
  const [overrideLoading, setOverrideLoading] = useState(false);
  const [overrideForm, setOverrideForm] = useState({ guardId: "", reason: "" });

  useEffect(() => {
    load();
  }, [statusFilter]);

  async function load() {
    setLoading(true);
    setErr("");
    try {
      const [r, g] = await Promise.all([
        getAIRankings(statusFilter),
        listGuards(),
      ]);

      const rankingsData = Array.isArray(r.data?.data)
        ? r.data.data
        : r.data || [];
      const guardsData = Array.isArray(g.data) ? g.data : g.data?.guards || [];

      // Debug: log guards
      console.log("🔍 Guards loaded:", guardsData.length);
      if (guardsData.length > 0) {
        console.log("  First guard:", guardsData[0]);
      }

      // Debug: log override data
      const overriddenShifts = rankingsData.filter((s) => s.isOverridden);
      if (overriddenShifts.length > 0) {
        console.log("🔍 Overridden shifts found:", overriddenShifts.length);
        overriddenShifts.forEach((s) => {
          console.log("  Shift:", s.id);
          console.log("    isOverridden:", s.isOverridden);
          console.log("    overriddenAt:", s.overriddenAt);
          console.log("    overriddenBy:", s.overriddenBy);
          console.log("    aiDecision:", s.aiDecision);
        });
      }

      setRankings(rankingsData);
      setGuards(guardsData);
    } catch (e) {
      setErr(e?.response?.data?.message || e?.message || "Failed to load AI rankings");
    } finally {
      setLoading(false);
    }
  }

  function openOverrideModal(shift) {
    setOverrideModal(shift);
    setOverrideForm({
      guardId: shift.guardId || "",
      reason: shift.isOverridden ? shift.aiDecision?.override_reason || "" : "",
    });
  }

  function closeOverrideModal() {
    setOverrideModal(null);
    setOverrideForm({ guardId: "", reason: "" });
  }

  async function handleOverride() {
    if (!overrideModal) return;

    setOverrideLoading(true);
    setErr("");

    try {
      console.log("🔄 Overriding AI decision...", {
        shiftId: overrideModal.id,
        guardId: overrideForm.guardId || null,
        reason: overrideForm.reason || "Admin override",
      });

      const response = await overrideAIDecision(overrideModal.id, {
        guardId: overrideForm.guardId || null,
        reason: overrideForm.reason || "Admin override",
      });

      console.log("✅ Override response:", response.data);

      if (!response.data?.success) {
        throw new Error(response.data?.message || "Override failed");
      }

      closeOverrideModal();
      
      // If guard was assigned, shift becomes CLOSED - switch filter to ALL to see it
      if (overrideForm.guardId) {
        console.log("🔄 Switching filter to ALL (shift is now CLOSED)");
        setStatusFilter("ALL"); // Switch to ALL to see the overridden shift
      }
      
      // Wait a moment then reload to ensure database is updated
      setTimeout(() => {
        console.log("🔄 Reloading data after override...");
        load();
      }, 500);
    } catch (e) {
      console.error("❌ Override error:", e);
      setErr(e?.response?.data?.message || e?.message || "Failed to override AI decision");
    } finally {
      setOverrideLoading(false);
    }
  }

  function formatDate(dateStr) {
    if (!dateStr) return "—";
    const d = new Date(dateStr);
    return d.toLocaleDateString();
  }

  function formatTime(timeStr) {
    if (!timeStr) return "—";
    return timeStr;
  }

  return (
    <div>
      <h1 style={{ marginBottom: 14 }}>AI Ranking & Decisions</h1>

      {err ? <div className="error" style={{ marginBottom: 14 }}>{err}</div> : null}

      {/* Filters */}
      <Card
        title="Filters"
        subtitle="Filter shifts by status"
        style={{ marginBottom: 14 }}
      >
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <label style={{ fontWeight: 600 }}>Status:</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{
              padding: "8px 12px",
              borderRadius: 8,
              border: "1px solid rgba(148,163,184,0.18)",
              background: "rgba(255,255,255,0.03)",
              color: "inherit",
            }}
          >
            <option value="OPEN">Open</option>
            <option value="CLOSED">Closed</option>
            <option value="ALL">All</option>
          </select>
        </div>
      </Card>

      {/* Rankings List */}
      <Card
        title="AI Rankings & Decisions"
        subtitle={
          loading
            ? "Loading…"
            : `${rankings.length} shift${rankings.length !== 1 ? "s" : ""} with AI decisions`
        }
      >
        {loading ? (
          <div style={{ opacity: 0.75 }}>Loading…</div>
        ) : rankings.length === 0 ? (
          <div style={{ opacity: 0.75 }}>No shifts with AI decisions found</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {rankings.map((shift) => (
              <div
                key={shift.id}
                style={{
                  padding: 14,
                  border: "1px solid rgba(148,163,184,0.18)",
                  borderRadius: 12,
                  background: shift.isOverridden
                    ? "rgba(245,158,11,0.08)"
                    : "rgba(255,255,255,0.02)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    marginBottom: 8,
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 700, marginBottom: 4 }}>
                      Shift: {formatDate(shift.shiftDate)} {formatTime(shift.shiftStart)} - {formatTime(shift.shiftEnd)}
                    </div>
                    {shift.location ? (
                      <div style={{ fontSize: 13, opacity: 0.75, marginBottom: 4 }}>
                        Location: {shift.location}
                      </div>
                    ) : null}
                    <div style={{ fontSize: 13, opacity: 0.75 }}>
                      Status: <strong>{shift.status}</strong> • Assigned:{" "}
                      <strong>{shift.guardName || "Unassigned"}</strong>
                    </div>
                  </div>
                  {shift.isOverridden && (
                    <span
                      style={{
                        padding: "4px 8px",
                        borderRadius: 6,
                        fontSize: 11,
                        fontWeight: 700,
                        background: "rgba(245,158,11,0.2)",
                        color: "#f59e0b",
                      }}
                    >
                      OVERRIDDEN
                    </span>
                  )}
                </div>

                {/* AI Decision Data */}
                <div
                  style={{
                    marginTop: 12,
                    padding: 12,
                    background: "rgba(255,255,255,0.02)",
                    borderRadius: 8,
                    border: "1px solid rgba(148,163,184,0.1)",
                  }}
                >
                  {shift.ranking && (
                    <div style={{ marginBottom: 6 }}>
                      <strong>Ranking:</strong> {shift.ranking}
                    </div>
                  )}
                  {shift.contactReason && (
                    <div style={{ marginBottom: 6 }}>
                      <strong>Contact Reason:</strong> {shift.contactReason}
                    </div>
                  )}
                  {shift.assignmentReason && (
                    <div style={{ marginBottom: 6 }}>
                      <strong>Assignment Reason:</strong> {shift.assignmentReason}
                    </div>
                  )}
                  {shift.reasons && (
                    <div style={{ marginBottom: 6 }}>
                      <strong>Reasons:</strong> {typeof shift.reasons === "string" ? shift.reasons : JSON.stringify(shift.reasons)}
                    </div>
                  )}
                  {shift.confidence && (
                    <div style={{ marginBottom: 6 }}>
                      <strong>Confidence:</strong> {shift.confidence}
                    </div>
                  )}
                  {shift.suggestedGuardId && (
                    <div style={{ marginBottom: 6 }}>
                      <strong>Suggested Guard ID:</strong> {String(shift.suggestedGuardId).substring(0, 8)}...
                    </div>
                  )}
                  {shift.isOverridden && (
                    <div style={{ marginTop: 12, padding: 12, background: "rgba(245,158,11,0.1)", borderRadius: 8, border: "1px solid rgba(245,158,11,0.3)" }}>
                      <div style={{ fontWeight: 700, marginBottom: 8, color: "#f59e0b" }}>
                        ⚠️ AI Decision Overridden
                      </div>
                      <div style={{ fontSize: 13, marginBottom: 6 }}>
                        <strong>Override Reason:</strong> {shift.aiDecision?.override_reason || shift.aiDecision?.overrideReason || "N/A"}
                      </div>
                      <div style={{ fontSize: 13, marginBottom: 6 }}>
                        <strong>Assigned Guard:</strong> {shift.guardId ? (shift.guardName || `Guard ${String(shift.guardId).substring(0, 8)}...`) : "N/A"}
                      </div>
                      <div style={{ fontSize: 13, marginBottom: 4, opacity: 0.8 }}>
                        <strong>Overridden at:</strong> {shift.overriddenAt || shift.aiDecision?.overridden_at ? (formatDate(shift.overriddenAt || shift.aiDecision?.overridden_at) + ` ${new Date(shift.overriddenAt || shift.aiDecision?.overridden_at).toLocaleTimeString()}`) : "N/A"}
                      </div>
                      <div style={{ fontSize: 13, marginBottom: 4, opacity: 0.8 }}>
                        <strong>Overridden by:</strong> {shift.overriddenBy || shift.aiDecision?.overridden_by ? `Admin ID ${String(shift.overriddenBy || shift.aiDecision?.overridden_by)}` : "N/A"}
                      </div>
                      {/* Debug info */}
                      <div style={{ fontSize: 11, marginTop: 8, padding: 8, background: "rgba(0,0,0,0.2)", borderRadius: 4, opacity: 0.6, fontFamily: "monospace" }}>
                        Debug: aiDecision keys: {shift.aiDecision ? Object.keys(shift.aiDecision).join(", ") : "null"}
                      </div>
                    </div>
                  )}
                </div>

                {/* Override Button */}
                {canOverride && (
                  <div style={{ marginTop: 12 }}>
                    <button
                      className="btn"
                      onClick={() => openOverrideModal(shift)}
                      style={{
                        padding: "8px 16px",
                        fontSize: 13,
                        fontWeight: 600,
                      }}
                    >
                      {shift.isOverridden ? "Update Override" : "Override AI Decision"}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Override Modal */}
      {overrideModal && (
        <Modal
          title="Override AI Decision"
          onClose={closeOverrideModal}
          footer={
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button className="btn" onClick={closeOverrideModal} disabled={overrideLoading}>
                Cancel
              </button>
              <button
                className="btnPrimary"
                onClick={handleOverride}
                disabled={overrideLoading}
              >
                {overrideLoading ? "Overriding..." : "Override"}
              </button>
            </div>
          }
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div>
              <label style={{ display: "block", marginBottom: 6, fontWeight: 600 }}>
                Assign Guard (optional)
              </label>
              <select
                value={overrideForm.guardId}
                onChange={(e) =>
                  setOverrideForm({ ...overrideForm, guardId: e.target.value })
                }
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: 8,
                  border: "1px solid rgba(148,163,184,0.18)",
                  background: "rgba(255,255,255,0.03)",
                  color: "inherit",
                }}
              >
                <option value="">Unassign / Keep current</option>
                {guards.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name || g.email || g.id}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ display: "block", marginBottom: 6, fontWeight: 600 }}>
                Override Reason
              </label>
              <textarea
                value={overrideForm.reason}
                onChange={(e) =>
                  setOverrideForm({ ...overrideForm, reason: e.target.value })
                }
                placeholder="Reason for overriding AI decision..."
                rows={4}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: 8,
                  border: "1px solid rgba(148,163,184,0.18)",
                  background: "rgba(255,255,255,0.03)",
                  color: "inherit",
                  fontFamily: "inherit",
                  resize: "vertical",
                }}
              />
            </div>

            <div style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}>
              This will mark the AI decision as overridden and update the shift assignment if a guard is selected.
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
