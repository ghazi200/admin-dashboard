// src/components/OvertimeStatus.jsx
import React, { useState, useEffect } from "react";
import { getOvertimeStatus } from "../services/guardApi";
import "./OvertimeStatus.css";

/**
 * OvertimeStatus Component
 * Displays real-time overtime status with alerts
 * 
 * @param {Object} props
 * @param {string} props.shiftId - Shift ID
 * @param {boolean} props.isClockedIn - Whether guard is currently clocked in
 */
const OvertimeStatus = ({ shiftId, isClockedIn }) => {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!shiftId || !isClockedIn) {
      setStatus(null);
      return;
    }

    const fetchStatus = async () => {
      try {
        setLoading(true);
        setError(null);
        console.log(`🔍 Fetching overtime status for shift ${shiftId}...`);
        const response = await getOvertimeStatus(shiftId);
        // Handle both response formats: { data: {...} } or direct object
        const statusData = response.data || response;
        console.log("✅ Overtime status received:", statusData);
        setStatus(statusData);
      } catch (err) {
        console.error("❌ Error fetching overtime status:", err);
        console.error("   Response:", err.response?.data);
        setError(err.response?.data?.message || err.message || "Failed to load overtime status");
      } finally {
        setLoading(false);
      }
    };

    fetchStatus();

    // Update every minute
    const interval = setInterval(fetchStatus, 60000);

    return () => clearInterval(interval);
  }, [shiftId, isClockedIn]);

  if (!shiftId || !isClockedIn) return null;
  if (loading) {
    return (
      <div className="overtime-status">
        <div style={{ padding: 12, textAlign: "center", opacity: 0.7 }}>
          Loading overtime status...
        </div>
      </div>
    );
  }
  if (error) {
    console.error("OvertimeStatus error:", error);
    return (
      <div className="overtime-status" style={{ background: "rgba(239, 68, 68, 0.1)", border: "1px solid rgba(239, 68, 68, 0.3)" }}>
        <div style={{ padding: 12, fontSize: 13, color: "#991b1b" }}>
          ⚠️ Unable to load overtime status: {error}
        </div>
      </div>
    );
  }
  if (!status || status.status === "not_clocked_in") return null;

  const { currentHours, weeklyHours, projectedDaily, dailyOTThreshold, weeklyOTThreshold, status: otStatus, alerts } = status;

  return (
    <div className={`overtime-status ${otStatus}`}>
      <div className="overtime-status-header">
        <span className="overtime-status-icon">⏰</span>
        <span className="overtime-status-title">Overtime Status</span>
      </div>

      <div className="overtime-status-content">
        {/* Current Hours */}
        <div className="overtime-status-stat">
          <span className="overtime-status-label">Today:</span>
          <span className="overtime-status-value">{currentHours.toFixed(1)}h</span>
        </div>

        {/* Weekly Hours */}
        <div className="overtime-status-stat">
          <span className="overtime-status-label">This Week:</span>
          <span className="overtime-status-value">{weeklyHours.toFixed(1)}h</span>
        </div>

        {/* Projected Hours */}
        {projectedDaily > currentHours && (
          <div className="overtime-status-stat projected">
            <span className="overtime-status-label">Projected:</span>
            <span className="overtime-status-value">{projectedDaily.toFixed(1)}h</span>
          </div>
        )}

        {/* Alerts */}
        {alerts && alerts.length > 0 && (
          <div className="overtime-status-alerts">
            {alerts.map((alert, idx) => (
              <div key={idx} className={`overtime-status-alert ${alert.type}`}>
                {alert.type === "critical" && "⚠️ "}
                {alert.type === "warning" && "⏱️ "}
                {alert.type === "info" && "ℹ️ "}
                {alert.message}
              </div>
            ))}
          </div>
        )}

        {/* Thresholds Info */}
        <div className="overtime-status-info">
          Daily OT: {dailyOTThreshold}h | Weekly OT: {weeklyOTThreshold}h
        </div>
      </div>
    </div>
  );
};

export default OvertimeStatus;
