import React, { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getUpcomingRisks } from "../services/api";
import Card from "../components/Card";
import CalloutRiskIndicator from "../components/CalloutRiskIndicator";

export default function CalloutRisk() {
  const [daysAhead, setDaysAhead] = useState(7);
  const [minRiskScore, setMinRiskScore] = useState(0); // Show all by default

  const {
    data: risksData,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["calloutRisks", daysAhead, minRiskScore],
    queryFn: async () => {
      const response = await getUpcomingRisks({
        days: daysAhead,
        minRisk: minRiskScore,
      });
      return response.data;
    },
    refetchInterval: 60000, // Refetch every minute
    refetchOnWindowFocus: true,
  });

  const highRiskShifts = risksData?.shifts?.filter(
    (s) => s.risk.recommendation === "HIGH_RISK"
  ) || [];
  const mediumRiskShifts = risksData?.shifts?.filter(
    (s) => s.risk.recommendation === "MEDIUM_RISK"
  ) || [];
  const lowRiskShifts = risksData?.shifts?.filter(
    (s) => s.risk.recommendation === "LOW_RISK"
  ) || [];
  const allShifts = risksData?.shifts || [];

  if (isLoading) {
    return (
      <div className="container">
        <h1>Callout Risk Prediction</h1>
        <div style={{ padding: 40, textAlign: "center", opacity: 0.7 }}>
          Loading risk predictions...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container">
        <h1>Callout Risk Prediction</h1>
        <div style={{ padding: 40 }}>
          <div style={{ color: "#ef4444", marginBottom: 20 }}>
            Error: {error?.response?.data?.message || error?.message || "Failed to load risks"}
          </div>
          <button
            onClick={() => refetch()}
            style={{
              padding: "8px 16px",
              cursor: "pointer",
              background: "#3b82f6",
              color: "white",
              border: "none",
              borderRadius: 8,
              fontWeight: 600,
            }}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0, marginBottom: 8 }}>Callout Risk Prediction</h1>
        <div style={{ opacity: 0.7, fontSize: 14 }}>
          Early warning system for potential callouts. Proactive backup guard suggestions.
        </div>
      </div>

      {/* Summary Cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: 14,
          marginBottom: 24,
        }}
      >
        <Card>
          <div style={{ padding: 16 }}>
            <div style={{ opacity: 0.7, fontSize: 13, marginBottom: 6 }}>
              Total Shifts Analyzed
            </div>
            <div style={{ fontSize: 32, fontWeight: 900, color: "#3b82f6" }}>
              {risksData?.totalShifts || 0}
            </div>
          </div>
        </Card>
        <Card>
          <div style={{ padding: 16 }}>
            <div style={{ opacity: 0.7, fontSize: 13, marginBottom: 6 }}>
              High-Risk Shifts
            </div>
            <div style={{ fontSize: 32, fontWeight: 900, color: "#ef4444" }}>
              {highRiskShifts.length}
            </div>
          </div>
        </Card>
        <Card>
          <div style={{ padding: 16 }}>
            <div style={{ opacity: 0.7, fontSize: 13, marginBottom: 6 }}>
              Medium-Risk Shifts
            </div>
            <div style={{ fontSize: 32, fontWeight: 900, color: "#f59e0b" }}>
              {mediumRiskShifts.length}
            </div>
          </div>
        </Card>
      </div>

      {/* Filters */}
      <Card style={{ marginBottom: 24 }}>
        <div style={{ padding: 16 }}>
          <div style={{ fontWeight: 800, marginBottom: 12 }}>Filters</div>
          <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
            <div>
              <label style={{ display: "block", marginBottom: 6, fontSize: 13 }}>
                Days Ahead:
              </label>
              <select
                value={daysAhead}
                onChange={(e) => setDaysAhead(Number(e.target.value))}
                style={{
                  padding: "6px 12px",
                  borderRadius: 6,
                  border: "1px solid rgba(255,255,255,0.2)",
                  background: "rgba(255,255,255,0.05)",
                  color: "white",
                }}
              >
                <option value={3}>3 days</option>
                <option value={7}>7 days</option>
                <option value={14}>14 days</option>
                <option value={30}>30 days</option>
              </select>
            </div>
            <div>
              <label style={{ display: "block", marginBottom: 6, fontSize: 13 }}>
                Minimum Risk Score:
              </label>
              <select
                value={minRiskScore}
                onChange={(e) => setMinRiskScore(Number(e.target.value))}
                style={{
                  padding: "6px 12px",
                  borderRadius: 6,
                  border: "1px solid rgba(255,255,255,0.2)",
                  background: "rgba(255,255,255,0.05)",
                  color: "white",
                }}
              >
                <option value={0}>All</option>
                <option value={40}>40+ (Medium+)</option>
                <option value={70}>70+ (High)</option>
              </select>
            </div>
          </div>
        </div>
      </Card>

      {/* High-Risk Shifts */}
      {highRiskShifts.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <h2 style={{ marginBottom: 16, color: "#ef4444" }}>
            ⚠️ High-Risk Shifts ({highRiskShifts.length})
          </h2>
          <div style={{ display: "grid", gap: 14 }}>
            {highRiskShifts.map((item) => (
              <Card key={item.shiftId}>
                <div style={{ padding: 20 }}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "start",
                      marginBottom: 16,
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 4 }}>
                        {item.guardName}
                      </div>
                      <div style={{ opacity: 0.7, fontSize: 14 }}>
                        {new Date(item.shiftDate).toLocaleDateString()} • {item.shiftTime}
                      </div>
                      {item.location && (
                        <div style={{ opacity: 0.7, fontSize: 14, marginTop: 4 }}>
                          📍 {item.location}
                        </div>
                      )}
                    </div>
                    <div
                      style={{
                        fontSize: 36,
                        fontWeight: 900,
                        color: "#ef4444",
                      }}
                    >
                      {item.risk.score}%
                    </div>
                  </div>

                  <CalloutRiskIndicator
                    shiftId={item.shiftId}
                    guardId={item.guardId}
                    shiftDate={item.shiftDate}
                    shiftTime={item.shiftTime}
                    compact={false}
                  />

                  {/* External Risk Factors (Weather/Trains/Shutdowns) */}
                  {item.risk?.externalRiskFactors && item.risk.externalRiskFactors.riskLevel !== "LOW" && (
                    <div
                      style={{
                        marginTop: 16,
                        padding: 12,
                        borderRadius: 8,
                        background:
                          item.risk.externalRiskFactors.riskLevel === "HIGH"
                            ? "rgba(239, 68, 68, 0.1)"
                            : "rgba(245, 158, 11, 0.1)",
                        border: `1px solid ${
                          item.risk.externalRiskFactors.riskLevel === "HIGH"
                            ? "rgba(239, 68, 68, 0.3)"
                            : "rgba(245, 158, 11, 0.3)"
                        }`,
                      }}
                    >
                      <div
                        style={{
                          fontWeight: 700,
                          marginBottom: 8,
                          fontSize: 14,
                          color:
                            item.risk.externalRiskFactors.riskLevel === "HIGH"
                              ? "#ef4444"
                              : "#f59e0b",
                        }}
                      >
                        🌍 External Risk Factors ({item.risk.externalRiskFactors.riskLevel})
                      </div>
                      <div style={{ fontSize: 13, opacity: 0.9, marginBottom: 8 }}>
                        {item.risk.externalRiskFactors.summary}
                      </div>
                      {item.risk.externalRiskFactors.factors &&
                        item.risk.externalRiskFactors.factors.length > 0 && (
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                            {item.risk.externalRiskFactors.factors.map((factor, idx) => (
                              <span
                                key={idx}
                                style={{
                                  padding: "4px 8px",
                                  borderRadius: 4,
                                  background: "rgba(255,255,255,0.1)",
                                  fontSize: 12,
                                  fontWeight: 600,
                                }}
                              >
                                {factor === "weather" && "🌧️ Weather"}
                                {factor === "transit" && "🚇 Transit"}
                                {factor === "traffic" && "🚗 Traffic"}
                                {factor === "emergency" && "🚨 Emergency"}
                                {!["weather", "transit", "traffic", "emergency"].includes(factor) && factor}
                              </span>
                            ))}
                          </div>
                        )}
                      {item.risk.externalRiskFactors.details &&
                        Object.keys(item.risk.externalRiskFactors.details).length > 0 && (
                          <div style={{ marginTop: 8, fontSize: 12, opacity: 0.8 }}>
                            {item.risk.externalRiskFactors.details.weather && (
                              <div style={{ marginTop: 4 }}>
                                <strong>Weather:</strong> {item.risk.externalRiskFactors.details.weather}
                              </div>
                            )}
                            {item.risk.externalRiskFactors.details.transit && (
                              <div style={{ marginTop: 4 }}>
                                <strong>Transit:</strong> {item.risk.externalRiskFactors.details.transit}
                              </div>
                            )}
                            {item.risk.externalRiskFactors.details.traffic && (
                              <div style={{ marginTop: 4 }}>
                                <strong>Traffic:</strong> {item.risk.externalRiskFactors.details.traffic}
                              </div>
                            )}
                          </div>
                        )}
                    </div>
                  )}
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Medium-Risk Shifts */}
      {mediumRiskShifts.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <h2 style={{ marginBottom: 16, color: "#f59e0b" }}>
            ⚡ Medium-Risk Shifts ({mediumRiskShifts.length})
          </h2>
          <div style={{ display: "grid", gap: 14 }}>
            {mediumRiskShifts.map((item) => (
              <Card key={item.shiftId}>
                <div style={{ padding: 20 }}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "start",
                      marginBottom: 12,
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 4 }}>
                        {item.guardName}
                      </div>
                      <div style={{ opacity: 0.7, fontSize: 13 }}>
                        {new Date(item.shiftDate).toLocaleDateString()} • {item.shiftTime}
                      </div>
                      {item.location && (
                        <div style={{ opacity: 0.7, fontSize: 13, marginTop: 4 }}>
                          📍 {item.location}
                        </div>
                      )}
                    </div>
                    <div
                      style={{
                        fontSize: 28,
                        fontWeight: 900,
                        color: "#f59e0b",
                      }}
                    >
                      {item.risk.score}%
                    </div>
                  </div>

                  <div style={{ fontSize: 13, opacity: 0.8, marginTop: 8 }}>
                    {item.risk.message}
                  </div>

                  {item.backupSuggestions && item.backupSuggestions.length > 0 && (
                    <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid rgba(255,255,255,0.1)" }}>
                      <div style={{ fontWeight: 700, marginBottom: 6, fontSize: 12 }}>
                        💡 Suggested Backups:
                      </div>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {item.backupSuggestions.map((backup, idx) => (
                          <span
                            key={idx}
                            style={{
                              padding: "4px 8px",
                              background: "rgba(255,255,255,0.1)",
                              borderRadius: 4,
                              fontSize: 11,
                            }}
                          >
                            {backup.guardName}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Low-Risk Shifts (show when filter allows) */}
      {minRiskScore <= 30 && lowRiskShifts.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <h2 style={{ marginBottom: 16, color: "#22c55e" }}>
            ✅ Low-Risk Shifts ({lowRiskShifts.length})
          </h2>
          <div style={{ display: "grid", gap: 14 }}>
            {lowRiskShifts.map((item) => (
              <Card key={item.shiftId}>
                <div style={{ padding: 20 }}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "start",
                      marginBottom: 12,
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 4 }}>
                        {item.guardName}
                      </div>
                      <div style={{ opacity: 0.7, fontSize: 13 }}>
                        {new Date(item.shiftDate).toLocaleDateString()} • {item.shiftTime}
                      </div>
                      {item.location && (
                        <div style={{ opacity: 0.7, fontSize: 13, marginTop: 4 }}>
                          📍 {item.location}
                        </div>
                      )}
                    </div>
                    <div
                      style={{
                        fontSize: 24,
                        fontWeight: 900,
                        color: "#22c55e",
                      }}
                    >
                      {item.risk.score}%
                    </div>
                  </div>

                  <div style={{ fontSize: 13, opacity: 0.8, marginTop: 8 }}>
                    {item.risk.message}
                  </div>

                  {/* External Risk Factors (Weather/Trains/Shutdowns) */}
                  {item.risk?.externalRiskFactors && item.risk.externalRiskFactors.riskLevel !== "LOW" && (
                    <div
                      style={{
                        marginTop: 12,
                        padding: 10,
                        borderRadius: 6,
                        background:
                          item.risk.externalRiskFactors.riskLevel === "HIGH"
                            ? "rgba(239, 68, 68, 0.1)"
                            : "rgba(245, 158, 11, 0.1)",
                        border: `1px solid ${
                          item.risk.externalRiskFactors.riskLevel === "HIGH"
                            ? "rgba(239, 68, 68, 0.3)"
                            : "rgba(245, 158, 11, 0.3)"
                        }`,
                      }}
                    >
                      <div
                        style={{
                          fontWeight: 700,
                          marginBottom: 6,
                          fontSize: 12,
                          color:
                            item.risk.externalRiskFactors.riskLevel === "HIGH"
                              ? "#ef4444"
                              : "#f59e0b",
                        }}
                      >
                        🌍 External Factors ({item.risk.externalRiskFactors.riskLevel})
                      </div>
                      <div style={{ fontSize: 12, opacity: 0.9 }}>
                        {item.risk.externalRiskFactors.summary}
                      </div>
                      {item.risk.externalRiskFactors.factors &&
                        item.risk.externalRiskFactors.factors.length > 0 && (
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
                            {item.risk.externalRiskFactors.factors.map((factor, idx) => (
                              <span
                                key={idx}
                                style={{
                                  padding: "2px 6px",
                                  borderRadius: 3,
                                  background: "rgba(255,255,255,0.1)",
                                  fontSize: 11,
                                }}
                              >
                                {factor === "weather" && "🌧️"}
                                {factor === "transit" && "🚇"}
                                {factor === "traffic" && "🚗"}
                                {factor === "emergency" && "🚨"}
                                {factor}
                              </span>
                            ))}
                          </div>
                        )}
                    </div>
                  )}
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* No Risks */}
      {allShifts.length === 0 && (
        <Card>
          <div style={{ padding: 40, textAlign: "center", opacity: 0.7 }}>
            ✅ No shifts found for the next {daysAhead} days!
            <br />
            <span style={{ fontSize: 13, marginTop: 8, display: "block" }}>
              Create shifts to see callout risk predictions.
            </span>
          </div>
        </Card>
      )}
    </div>
  );
}
