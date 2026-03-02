import React, { useState, useEffect } from "react";
import { getShiftRisk } from "../services/api";

/**
 * Callout Risk Indicator Component
 * Displays risk score for a shift with visual indicators
 */
export default function CalloutRiskIndicator({ shiftId, guardId, shiftDate, shiftTime, compact = false }) {
  const [risk, setRisk] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    if (!shiftId || !guardId) {
      setLoading(false);
      return;
    }

    loadRisk();
  }, [shiftId, guardId]);

  async function loadRisk() {
    try {
      setLoading(true);
      setError(null);
      const response = await getShiftRisk(shiftId);
      setRisk(response.data);
    } catch (err) {
      console.error("Failed to load risk:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return compact ? (
      <span style={{ opacity: 0.5, fontSize: 12 }}>Loading risk...</span>
    ) : (
      <div style={{ padding: 8, opacity: 0.5 }}>Loading risk score...</div>
    );
  }

  if (error || !risk || !risk.risk) {
    return null; // Don't show anything if no risk data
  }

  const { score, recommendation, factors, message, backupSuggestions } = risk.risk;

  // Determine color based on risk level
  const getRiskColor = () => {
    if (recommendation === 'HIGH_RISK') return '#ef4444'; // Red
    if (recommendation === 'MEDIUM_RISK') return '#f59e0b'; // Orange
    return '#22c55e'; // Green
  };

  const getRiskBgColor = () => {
    if (recommendation === 'HIGH_RISK') return 'rgba(239, 68, 68, 0.1)';
    if (recommendation === 'MEDIUM_RISK') return 'rgba(245, 158, 11, 0.1)';
    return 'rgba(34, 197, 94, 0.1)';
  };

  const riskColor = getRiskColor();
  const riskBgColor = getRiskBgColor();

  if (compact) {
    return (
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "4px 8px",
          borderRadius: 6,
          background: riskBgColor,
          border: `1px solid ${riskColor}40`,
          cursor: "pointer",
        }}
        onClick={() => setShowDetails(!showDetails)}
        title={message}
      >
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: riskColor,
          }}
        />
        <span style={{ fontSize: 11, fontWeight: 700, color: riskColor }}>
          {score}%
        </span>
        {showDetails && (
          <div
            style={{
              position: "absolute",
              zIndex: 1000,
              background: "rgba(0,0,0,0.95)",
              padding: 12,
              borderRadius: 8,
              marginTop: 4,
              minWidth: 300,
              fontSize: 12,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontWeight: 800, marginBottom: 8, color: riskColor }}>
              {recommendation.replace('_', ' ')}
            </div>
            <div style={{ marginBottom: 8, opacity: 0.9 }}>{message}</div>
            {backupSuggestions && backupSuggestions.length > 0 && (
              <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid rgba(255,255,255,0.2)" }}>
                <div style={{ fontWeight: 700, marginBottom: 4 }}>Suggested Backups:</div>
                {backupSuggestions.map((backup, idx) => (
                  <div key={idx} style={{ marginTop: 4, opacity: 0.8 }}>
                    {idx + 1}. {backup.guardName} ({backup.matchQuality})
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      style={{
        padding: 12,
        borderRadius: 10,
        background: riskBgColor,
        border: `2px solid ${riskColor}40`,
        marginBottom: 12,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 8,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 12,
              height: 12,
              borderRadius: "50%",
              background: riskColor,
            }}
          />
          <div>
            <div style={{ fontWeight: 800, fontSize: 16, color: riskColor }}>
              {recommendation.replace('_', ' ')} Risk
            </div>
            <div style={{ fontSize: 12, opacity: 0.8, marginTop: 2 }}>
              {message}
            </div>
          </div>
        </div>
        <div
          style={{
            fontSize: 24,
            fontWeight: 900,
            color: riskColor,
          }}
        >
          {score}%
        </div>
      </div>

      {/* Risk Factors */}
      {factors && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${riskColor}30` }}>
          <div style={{ fontWeight: 700, marginBottom: 8, fontSize: 13 }}>Risk Factors:</div>
          <div style={{ display: "grid", gap: 6 }}>
            {Object.entries(factors).map(([key, factor]) => (
              <div
                key={key}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: 12,
                  opacity: 0.9,
                }}
              >
                <span>{factor.description}</span>
                <span style={{ fontWeight: 700, color: riskColor }}>
                  +{factor.value} pts
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Backup Suggestions */}
      {backupSuggestions && backupSuggestions.length > 0 && (
        <div
          style={{
            marginTop: 12,
            paddingTop: 12,
            borderTop: `1px solid ${riskColor}30`,
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 8, fontSize: 13 }}>
            💡 Suggested Backup Guards:
          </div>
          <div style={{ display: "grid", gap: 6 }}>
            {backupSuggestions.map((backup, idx) => (
              <div
                key={idx}
                style={{
                  padding: 8,
                  background: "rgba(255,255,255,0.05)",
                  borderRadius: 6,
                  fontSize: 12,
                }}
              >
                <div style={{ fontWeight: 700 }}>
                  {idx + 1}. {backup.guardName}
                </div>
                <div style={{ fontSize: 11, opacity: 0.8, marginTop: 2 }}>
                  {backup.matchQuality}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
