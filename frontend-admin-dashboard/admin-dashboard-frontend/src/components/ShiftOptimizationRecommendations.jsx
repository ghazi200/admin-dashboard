import React, { useState } from "react";
import { autoAssignGuard, checkConflicts } from "../services/api";

/**
 * Shift Optimization Recommendations Component
 * Shows AI-powered guard recommendations for a shift
 */
export default function ShiftOptimizationRecommendations({
  shiftId,
  recommendations = [],
  onAssign,
  onClose,
}) {
  const [assigning, setAssigning] = useState(false);
  const [assignError, setAssignError] = useState(null);

  if (!recommendations || recommendations.length === 0) {
    return null;
  }

  const topRecommendation = recommendations[0];

  async function handleAutoAssign(guard) {
    if (!shiftId) return;

    setAssigning(true);
    setAssignError(null);

    try {
      // Check conflicts first
      const conflictCheck = await checkConflicts(shiftId, guard.guardId);
      
      if (conflictCheck.data.hasConflicts) {
        setAssignError(
          `Cannot assign: ${conflictCheck.data.conflicts.map(c => c.message).join(', ')}`
        );
        setAssigning(false);
        return;
      }

      // Auto-assign
      const response = await autoAssignGuard(shiftId, {
        minScore: 60,
        autoAssign: true,
      });

      if (response.data.success) {
        if (onAssign) {
          onAssign(response.data.assignedGuard);
        }
      } else {
        setAssignError(response.data.message || "Failed to assign guard");
      }
    } catch (err) {
      setAssignError(err?.response?.data?.message || err.message || "Failed to assign guard");
    } finally {
      setAssigning(false);
    }
  }

  return (
    <div
      style={{
        marginTop: 16,
        padding: 16,
        background: "rgba(59, 130, 246, 0.1)",
        borderRadius: 12,
        border: "2px solid rgba(59, 130, 246, 0.3)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: 12 }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 4, color: "#3b82f6" }}>
            🤖 AI-Powered Recommendations
          </div>
          <div style={{ fontSize: 13, opacity: 0.8 }}>
            Top {recommendations.length} guard(s) ranked by optimization score
          </div>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              color: "rgba(255,255,255,0.7)",
              cursor: "pointer",
              fontSize: 18,
              padding: 4,
            }}
          >
            ×
          </button>
        )}
      </div>

      {assignError && (
        <div
          style={{
            padding: 10,
            background: "rgba(239, 68, 68, 0.2)",
            borderRadius: 8,
            marginBottom: 12,
            color: "#ef4444",
            fontSize: 13,
          }}
        >
          ⚠️ {assignError}
        </div>
      )}

      <div style={{ display: "grid", gap: 12 }}>
        {recommendations.map((rec, idx) => {
          const isTop = idx === 0;
          const scoreColor =
            rec.totalScore >= 80
              ? "#22c55e"
              : rec.totalScore >= 60
              ? "#3b82f6"
              : rec.totalScore >= 40
              ? "#f59e0b"
              : "#ef4444";

          return (
            <div
              key={rec.guardId}
              style={{
                padding: 14,
                background: isTop
                  ? "rgba(59, 130, 246, 0.15)"
                  : "rgba(255, 255, 255, 0.05)",
                borderRadius: 10,
                border: isTop
                  ? "2px solid rgba(59, 130, 246, 0.5)"
                  : "1px solid rgba(255, 255, 255, 0.1)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "start",
                  marginBottom: 12,
                }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    {isTop && (
                      <span
                        style={{
                          padding: "2px 8px",
                          background: "#3b82f6",
                          color: "white",
                          borderRadius: 4,
                          fontSize: 11,
                          fontWeight: 700,
                        }}
                      >
                        ⭐ RECOMMENDED
                      </span>
                    )}
                    <div style={{ fontWeight: 800, fontSize: 16 }}>
                      {rec.guardName}
                    </div>
                  </div>

                  <div style={{ fontSize: 13, opacity: 0.8, marginBottom: 8 }}>
                    Match Quality: <strong>{rec.matchQuality}</strong> • Confidence:{" "}
                    <strong>{rec.confidence}</strong>
                  </div>

                  {/* Score Breakdown */}
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(2, 1fr)",
                      gap: 8,
                      fontSize: 12,
                      marginTop: 8,
                    }}
                  >
                    <div>
                      <span style={{ opacity: 0.7 }}>Availability:</span>{" "}
                      <strong>{rec.scores.availability}%</strong>
                    </div>
                    <div>
                      <span style={{ opacity: 0.7 }}>Experience:</span>{" "}
                      <strong>{rec.scores.experience}%</strong>
                    </div>
                    <div>
                      <span style={{ opacity: 0.7 }}>Performance:</span>{" "}
                      <strong>{rec.scores.performance}%</strong>
                    </div>
                    <div>
                      <span style={{ opacity: 0.7 }}>Cost:</span>{" "}
                      <strong>{rec.scores.cost}%</strong>
                    </div>
                  </div>

                  {/* Reasons */}
                  {rec.reasons && (
                    <div style={{ marginTop: 10, fontSize: 12, opacity: 0.9 }}>
                      <div style={{ fontWeight: 700, marginBottom: 4 }}>Why this guard:</div>
                      <ul style={{ margin: 0, paddingLeft: 20 }}>
                        {rec.reasons.experience?.slice(0, 2).map((reason, i) => (
                          <li key={i}>{reason}</li>
                        ))}
                        {rec.reasons.performance?.slice(0, 1).map((reason, i) => (
                          <li key={i}>{reason}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {rec.conflicts && (
                    <div
                      style={{
                        marginTop: 8,
                        padding: 8,
                        background: "rgba(239, 68, 68, 0.2)",
                        borderRadius: 6,
                        fontSize: 12,
                        color: "#ef4444",
                      }}
                    >
                      ⚠️ Conflicts detected - cannot assign
                    </div>
                  )}
                </div>

                <div style={{ textAlign: "right", marginLeft: 16 }}>
                  <div
                    style={{
                      fontSize: 32,
                      fontWeight: 900,
                      color: scoreColor,
                      marginBottom: 8,
                    }}
                  >
                    {rec.totalScore}%
                  </div>
                  {shiftId && !rec.conflicts && (
                    <button
                      onClick={() => handleAutoAssign(rec)}
                      disabled={assigning}
                      style={{
                        padding: "6px 12px",
                        background: isTop ? "#3b82f6" : "rgba(59, 130, 246, 0.3)",
                        color: "white",
                        border: "none",
                        borderRadius: 6,
                        cursor: assigning ? "not-allowed" : "pointer",
                        fontSize: 12,
                        fontWeight: 700,
                        opacity: assigning ? 0.5 : 1,
                      }}
                    >
                      {assigning ? "Assigning..." : "Assign"}
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {topRecommendation && topRecommendation.estimatedCost && (
        <div
          style={{
            marginTop: 12,
            padding: 10,
            background: "rgba(255, 255, 255, 0.05)",
            borderRadius: 8,
            fontSize: 12,
            opacity: 0.9,
          }}
        >
          💰 Estimated Cost: <strong>${topRecommendation.estimatedCost.toFixed(2)}</strong> for this
          shift
        </div>
      )}
    </div>
  );
}
