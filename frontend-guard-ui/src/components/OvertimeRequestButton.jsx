// src/components/OvertimeRequestButton.jsx
import React, { useState } from "react";
import { requestOvertime } from "../services/guardApi";
import "./OvertimeRequestButton.css";

/**
 * OvertimeRequestButton Component
 * Allows guards to request overtime extension
 * 
 * @param {Object} props
 * @param {string} props.shiftId - Shift ID
 * @param {string} props.currentEndTime - Current shift end time (ISO string)
 */
const OvertimeRequestButton = ({ shiftId, currentEndTime }) => {
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [extensionHours, setExtensionHours] = useState(2);
  const [reason, setReason] = useState("");

  if (!shiftId || !currentEndTime) return null;

  // Parse current end time safely
  const parseEndTime = () => {
    try {
      const date = new Date(currentEndTime);
      if (isNaN(date.getTime())) {
        console.error("Invalid currentEndTime:", currentEndTime);
        return null;
      }
      return date;
    } catch (e) {
      console.error("Error parsing currentEndTime:", currentEndTime, e);
      return null;
    }
  };

  const currentEnd = parseEndTime();
  if (!currentEnd) return null;

  const handleRequest = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const proposedEnd = new Date(currentEnd);
      proposedEnd.setHours(proposedEnd.getHours() + extensionHours);

      // Ensure dates are valid before sending
      if (isNaN(proposedEnd.getTime())) {
        setError("Invalid proposed end time. Please check the extension hours.");
        setLoading(false);
        return;
      }

      await requestOvertime({
        shiftId,
        proposedEndTime: proposedEnd.toISOString(),
        extensionHours,
        reason: reason.trim() || null,
      });

      alert("✅ Overtime request submitted! Waiting for admin approval.");
      setShowModal(false);
      setReason("");
      setExtensionHours(2);
    } catch (err) {
      console.error("❌ Error requesting overtime:", err);
      console.error("   Response:", err.response?.data);
      console.error("   Status:", err.response?.status);
      const errorMsg = err.response?.data?.message || err.response?.data?.error || err.message || "Failed to submit request";
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  // Calculate proposed end time
  const proposedEnd = new Date(currentEnd);
  proposedEnd.setHours(proposedEnd.getHours() + extensionHours);

  return (
    <>
      <button
        className="overtime-request-btn"
        onClick={() => setShowModal(true)}
        style={{
          marginTop: 8,
          padding: "8px 16px",
          background: "rgba(59, 130, 246, 0.1)",
          border: "1px solid rgba(59, 130, 246, 0.3)",
          borderRadius: 8,
          color: "#3b82f6",
          cursor: "pointer",
          fontSize: 13,
          fontWeight: 500,
        }}
      >
        📝 Request Overtime
      </button>

      {showModal && (
        <>
          <div className="overtime-request-overlay" onClick={() => setShowModal(false)} />
          <div className="overtime-request-modal">
            <div className="overtime-request-header">
              <h3>Request Overtime</h3>
              <button className="overtime-request-close" onClick={() => setShowModal(false)}>×</button>
            </div>

            <form onSubmit={handleRequest} className="overtime-request-form">
              <div className="overtime-request-field">
                <label>Extension Hours</label>
                <input
                  type="number"
                  min="0.5"
                  max="8"
                  step="0.5"
                  value={extensionHours}
                  onChange={(e) => setExtensionHours(parseFloat(e.target.value) || 0)}
                  required
                />
              </div>

              <div className="overtime-request-field">
                <label>Current End Time</label>
                <input 
                  type="text" 
                  value={currentEnd && !isNaN(currentEnd.getTime()) 
                    ? currentEnd.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                    : "Invalid date"
                  } 
                  disabled 
                />
              </div>

              <div className="overtime-request-field">
                <label>Proposed End Time</label>
                <input 
                  type="text" 
                  value={proposedEnd && !isNaN(proposedEnd.getTime())
                    ? proposedEnd.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                    : "Invalid date"
                  } 
                  disabled 
                />
              </div>

              <div className="overtime-request-field">
                <label>Reason (Optional)</label>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g., Coverage needed, project deadline..."
                  rows={3}
                />
              </div>

              {error && (
                <div className="overtime-request-error">
                  ⚠️ {error}
                </div>
              )}

              <div className="overtime-request-actions">
                <button type="button" onClick={() => setShowModal(false)} disabled={loading}>
                  Cancel
                </button>
                <button type="submit" disabled={loading}>
                  {loading ? "Submitting..." : "Submit Request"}
                </button>
              </div>
            </form>
          </div>
        </>
      )}
    </>
  );
};

export default OvertimeRequestButton;
