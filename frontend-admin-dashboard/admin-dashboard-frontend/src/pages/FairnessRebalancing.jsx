import React, { useState, useEffect } from "react";
import Card from "../components/Card";
import {
  analyzeFairness,
  getRebalancingSuggestions,
  autoRebalance
} from "../services/api";
import { hasAccess } from "../utils/access";

export default function FairnessRebalancing() {
  const canRead = hasAccess("shifts:read");
  const canWrite = hasAccess("shifts:write");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [tenantId, setTenantId] = useState("");
  const [lookbackDays, setLookbackDays] = useState(14);
  const [analysis, setAnalysis] = useState(null);
  const [suggestions, setSuggestions] = useState(null);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    if (tenantId && canRead) {
      loadAnalysis();
    }
  }, [tenantId, lookbackDays]);

  const loadAnalysis = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await analyzeFairness({
        tenantId,
        lookbackDays
      });
      setAnalysis(response.data.analysis);
    } catch (err) {
      setError(err?.response?.data?.message || err.message || "Failed to load analysis");
    } finally {
      setLoading(false);
    }
  };

  const loadSuggestions = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await getRebalancingSuggestions({
        tenantId,
        lookbackDays,
        minScore: 50
      });
      setSuggestions(response.data);
    } catch (err) {
      setError(err?.response?.data?.message || err.message || "Failed to load suggestions");
    } finally {
      setLoading(false);
    }
  };

  const handleAutoRebalance = async (autoApply = false) => {
    if (!canWrite) {
      setError("You don't have permission to rebalance shifts");
      return;
    }

    setApplying(true);
    setError("");
    setSuccess("");

    try {
      const response = await autoRebalance({
        tenantId,
        autoApply,
        minScore: 50,
        maxReassignments: 10,
        lookbackDays
      });

      if (autoApply) {
        setSuccess(response.data.message);
        loadAnalysis(); // Refresh analysis
        loadSuggestions(); // Refresh suggestions
      } else {
        setSuggestions(response.data.suggestions);
        setSuccess("Rebalancing suggestions generated. Review and apply manually.");
      }
    } catch (err) {
      setError(err?.response?.data?.message || err.message || "Failed to rebalance");
    } finally {
      setApplying(false);
    }
  };

  if (!canRead) {
    return (
      <div style={{ padding: 24 }}>
        <Card>
          <div style={{ textAlign: "center", padding: 40 }}>
            <h2>Access Denied</h2>
            <p>You don't have permission to view fairness analysis.</p>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div style={{ padding: 24 }}>
      <Card>
        <h1 style={{ marginBottom: 24 }}>⚖️ Fairness Rebalancing</h1>

        {error && (
          <div style={{
            padding: 12,
            background: "rgba(239, 68, 68, 0.1)",
            border: "1px solid rgba(239, 68, 68, 0.3)",
            borderRadius: 8,
            marginBottom: 16,
            color: "#ef4444"
          }}>
            ❌ {error}
          </div>
        )}

        {success && (
          <div style={{
            padding: 12,
            background: "rgba(34, 197, 94, 0.1)",
            border: "1px solid rgba(34, 197, 94, 0.3)",
            borderRadius: 8,
            marginBottom: 16,
            color: "#22c55e"
          }}>
            ✅ {success}
          </div>
        )}

        <div style={{ marginBottom: 24 }}>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16 }}>
            <div>
              <label style={{ display: "block", marginBottom: 8, fontWeight: 600 }}>
                Tenant ID *
              </label>
              <input
                type="text"
                value={tenantId}
                onChange={(e) => setTenantId(e.target.value)}
                placeholder="Enter tenant ID"
                style={{
                  width: "100%",
                  padding: 10,
                  borderRadius: 8,
                  border: "1px solid rgba(255,255,255,0.2)",
                  background: "rgba(255,255,255,0.05)",
                  color: "white"
                }}
              />
            </div>
            <div>
              <label style={{ display: "block", marginBottom: 8, fontWeight: 600 }}>
                Lookback Days
              </label>
              <input
                type="number"
                min="1"
                max="90"
                value={lookbackDays}
                onChange={(e) => setLookbackDays(parseInt(e.target.value) || 14)}
                style={{
                  width: "100%",
                  padding: 10,
                  borderRadius: 8,
                  border: "1px solid rgba(255,255,255,0.2)",
                  background: "rgba(255,255,255,0.05)",
                  color: "white"
                }}
              />
            </div>
          </div>
        </div>

        {analysis && (
          <div style={{ marginBottom: 32 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h2>Fairness Analysis</h2>
              <button
                onClick={loadSuggestions}
                disabled={loading}
                style={{
                  padding: "8px 16px",
                  background: "#3b82f6",
                  color: "white",
                  border: "none",
                  borderRadius: 6,
                  cursor: loading ? "not-allowed" : "pointer"
                }}
              >
                Get Suggestions
              </button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 24 }}>
              <div style={{ padding: 16, background: "rgba(255,255,255,0.03)", borderRadius: 8 }}>
                <div style={{ fontSize: 24, fontWeight: 700, color: "#3b82f6" }}>
                  {analysis.totalGuards}
                </div>
                <div style={{ fontSize: 12, opacity: 0.8 }}>Total Guards</div>
              </div>
              <div style={{ padding: 16, background: "rgba(255,255,255,0.03)", borderRadius: 8 }}>
                <div style={{ fontSize: 24, fontWeight: 700, color: "#ef4444" }}>
                  {analysis.summary.overutilized}
                </div>
                <div style={{ fontSize: 12, opacity: 0.8 }}>Overutilized</div>
              </div>
              <div style={{ padding: 16, background: "rgba(255,255,255,0.03)", borderRadius: 8 }}>
                <div style={{ fontSize: 24, fontWeight: 700, color: "#f59e0b" }}>
                  {analysis.summary.underutilized}
                </div>
                <div style={{ fontSize: 12, opacity: 0.8 }}>Underutilized</div>
              </div>
              <div style={{ padding: 16, background: "rgba(255,255,255,0.03)", borderRadius: 8 }}>
                <div style={{ fontSize: 24, fontWeight: 700, color: "#22c55e" }}>
                  {analysis.summary.balanced}
                </div>
                <div style={{ fontSize: 12, opacity: 0.8 }}>Balanced</div>
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <h3 style={{ marginBottom: 12 }}>Guard Distribution</h3>
              <div style={{ maxHeight: 400, overflowY: "auto" }}>
                {analysis.guards.map((guard) => {
                  const statusColor =
                    guard.status === "OVERUTILIZED" ? "#ef4444" :
                    guard.status === "UNDERUTILIZED" ? "#f59e0b" :
                    "#22c55e";

                  return (
                    <div
                      key={guard.guardId}
                      style={{
                        padding: 12,
                        marginBottom: 8,
                        background: "rgba(255,255,255,0.03)",
                        borderRadius: 8,
                        border: `1px solid ${statusColor}40`
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div>
                          <div style={{ fontWeight: 600, marginBottom: 4 }}>
                            {guard.guardName}
                          </div>
                          <div style={{ fontSize: 12, opacity: 0.8 }}>
                            {guard.shiftCount} shifts ({guard.completedShifts} completed, {guard.openShifts} open)
                          </div>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontSize: 18, fontWeight: 700, color: statusColor }}>
                            {guard.deviationPercent > 0 ? "+" : ""}{guard.deviationPercent.toFixed(1)}%
                          </div>
                          <div style={{ fontSize: 11, opacity: 0.7 }}>
                            {guard.status}
                          </div>
                        </div>
                      </div>
                      <div style={{ marginTop: 8, fontSize: 11, opacity: 0.8 }}>
                        Average: {guard.avgShifts.toFixed(1)} shifts | Deviation: {guard.deviation > 0 ? "+" : ""}{guard.deviation.toFixed(1)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {suggestions && suggestions.suggestions && (
          <div style={{ marginBottom: 32 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h2>Rebalancing Suggestions ({suggestions.totalSuggestions || suggestions.suggestions.length})</h2>
              {canWrite && (
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    onClick={() => handleAutoRebalance(false)}
                    disabled={applying}
                    style={{
                      padding: "8px 16px",
                      background: "rgba(59, 130, 246, 0.3)",
                      color: "white",
                      border: "1px solid rgba(59, 130, 246, 0.5)",
                      borderRadius: 6,
                      cursor: applying ? "not-allowed" : "pointer"
                    }}
                  >
                    Regenerate
                  </button>
                  <button
                    onClick={() => handleAutoRebalance(true)}
                    disabled={applying}
                    style={{
                      padding: "8px 16px",
                      background: "#22c55e",
                      color: "white",
                      border: "none",
                      borderRadius: 6,
                      cursor: applying ? "not-allowed" : "pointer"
                    }}
                  >
                    {applying ? "Applying..." : "✅ Apply All"}
                  </button>
                </div>
              )}
            </div>

            {suggestions.suggestions.length === 0 ? (
              <div style={{ padding: 24, textAlign: "center", opacity: 0.7 }}>
                No rebalancing suggestions - guards are fairly distributed
              </div>
            ) : (
              <div style={{ maxHeight: 500, overflowY: "auto" }}>
                {suggestions.suggestions.map((suggestion, index) => (
                  <div
                    key={index}
                    style={{
                      padding: 16,
                      marginBottom: 12,
                      background: "rgba(255,255,255,0.03)",
                      borderRadius: 8,
                      border: "1px solid rgba(59, 130, 246, 0.3)"
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: 8 }}>
                      <div>
                        <div style={{ fontWeight: 600, marginBottom: 4 }}>
                          {suggestion.shiftDate} • {suggestion.shiftTime}
                        </div>
                        {suggestion.location && (
                          <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 8 }}>
                            📍 {suggestion.location}
                          </div>
                        )}
                        <div style={{ fontSize: 12, opacity: 0.9, lineHeight: 1.6 }}>
                          {suggestion.reason}
                        </div>
                      </div>
                      <div style={{ textAlign: "right", marginLeft: 16 }}>
                        <div style={{ fontSize: 20, fontWeight: 700, color: "#3b82f6", marginBottom: 4 }}>
                          {suggestion.toGuard.score}%
                        </div>
                        <div style={{ fontSize: 11, opacity: 0.7 }}>Match Score</div>
                      </div>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12, paddingTop: 12, borderTop: "1px solid rgba(255,255,255,0.1)" }}>
                      <div>
                        <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 4 }}>From:</div>
                        <div style={{ fontWeight: 600 }}>{suggestion.fromGuard.name}</div>
                        <div style={{ fontSize: 11, opacity: 0.8 }}>
                          {suggestion.fromGuard.currentShifts} shifts
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 4 }}>To:</div>
                        <div style={{ fontWeight: 600, color: "#22c55e" }}>{suggestion.toGuard.name}</div>
                        <div style={{ fontSize: 11, opacity: 0.8 }}>
                          {suggestion.toGuard.currentShifts} shifts
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {loading && !analysis && (
          <div style={{ textAlign: "center", padding: 40 }}>
            <div>Loading analysis...</div>
          </div>
        )}
      </Card>
    </div>
  );
}
