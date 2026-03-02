// src/components/OvertimeRequests.jsx
import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getOvertimeOffers, approveOvertimeRequest, denyOvertimeRequest } from "../services/api";
import Card from "./Card";

/**
 * OvertimeRequests Component
 * Displays pending overtime requests from guards
 */
const OvertimeRequests = () => {
  const qc = useQueryClient();
  const [selectedStatus, setSelectedStatus] = useState("requested"); // Show 'requested' requests by default
  const [processing, setProcessing] = useState({});

  const { data, isLoading, error } = useQuery({
    queryKey: ["overtimeOffers", selectedStatus],
    queryFn: async () => {
      try {
        console.log("🔄 Fetching overtime offers with status:", selectedStatus);
        const response = await getOvertimeOffers({
          status: selectedStatus === "pending_or_requested" ? "pending_or_requested" : selectedStatus,
        });
        console.log("✅ Overtime offers response:", response);
        return response.data?.data || [];
      } catch (err) {
        console.error("❌ Error fetching overtime offers:", err);
        console.error("   Response:", err.response?.data);
        console.error("   Status:", err.response?.status);
        throw err;
      }
    },
    refetchInterval: 10000, // Poll every 10 seconds
    refetchOnWindowFocus: true,
    retry: 1, // Only retry once on failure
  });

  const requests = data || [];

  const formatTime = (dateString) => {
    if (!dateString) return "—";
    try {
      // Parse the ISO timestamp string (UTC format: "2026-02-04T22:00:00.000Z")
      const date = new Date(dateString);
      
      // Validate the date
      if (isNaN(date.getTime())) {
        console.warn("Invalid date string:", dateString);
        return "—";
      }
      
      // 🔧 FIX: Force EST/EDT timezone for consistent display
      // All times should display in EST regardless of user's browser timezone
      const timeString = date.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
        timeZone: "America/New_York", // Force EST/EDT
      });
      
      return timeString;
    } catch (error) {
      console.error("Error formatting time:", error, dateString);
      return "—";
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return "—";
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      });
    } catch {
      return dateString;
    }
  };

  const getStatusBadge = (status) => {
    const styles = {
      requested: {
        background: "rgba(59, 130, 246, 0.2)",
        color: "#3b82f6",
        label: "Requested",
      },
      pending: {
        background: "rgba(245, 158, 11, 0.2)",
        color: "#f59e0b",
        label: "Pending",
      },
      accepted: {
        background: "rgba(34, 197, 94, 0.2)",
        color: "#22c55e",
        label: "Accepted",
      },
      declined: {
        background: "rgba(239, 68, 68, 0.2)",
        color: "#ef4444",
        label: "Declined",
      },
      cancelled: {
        background: "rgba(107, 114, 128, 0.2)",
        color: "#6b7280",
        label: "Cancelled",
      },
    };

    const style = styles[status] || styles.requested;

    return (
      <span
        style={{
          padding: "2px 8px",
          borderRadius: 8,
          fontSize: 10,
          fontWeight: 700,
          background: style.background,
          color: style.color,
        }}
      >
        {style.label}
      </span>
    );
  };

  // Filter to show only 'requested' status (guard-initiated requests)
  // Only show requests that can actually be denied (status must be "requested")
  const requestedOnly = requests.filter((r) => r.status === "requested");

  const handleApprove = async (requestId) => {
    if (!confirm("Approve this overtime request?")) return;
    
    setProcessing({ ...processing, [requestId]: "approving" });
    try {
      console.log("🔄 Approving overtime request:", requestId);
      const response = await approveOvertimeRequest(requestId);
      console.log("✅ Approval response:", response);
      
      // Check if response indicates success
      if (response?.data?.success || response?.status === 200 || response?.statusText === 'OK') {
        console.log("✅ Approval successful");
        
        // Refresh the list
        await qc.refetchQueries({ queryKey: ["overtimeOffers"] });
        
        alert("✅ Overtime request approved!");
      } else {
        // Response received but doesn't indicate success
        console.warn("⚠️ Unexpected response format:", response);
        await qc.refetchQueries({ queryKey: ["overtimeOffers"] });
        alert("⚠️ Approval may have succeeded. Please refresh to verify.");
      }
    } catch (err) {
      console.error("❌ Error approving request:", err);
      console.error("   Response:", err.response?.data);
      console.error("   Status:", err.response?.status);
      console.error("   Full error:", err);
      
      // Only show error if it's a real error (4xx or 5xx)
      // If it's a network error but status update might have succeeded, be more lenient
      const status = err.response?.status;
      const errorMsg = err.response?.data?.message || err.response?.data?.error || err.message || "Failed to approve request";
      
      // Always refresh the list - the status might have been updated even if there was an error
      await qc.refetchQueries({ queryKey: ["overtimeOffers"] });
      
      // Only show error for actual server errors (5xx) or client errors (4xx) that aren't network issues
      if (status && status >= 400 && status < 500) {
        alert(`❌ Failed to approve: ${errorMsg}\n\nCheck console for details.`);
      } else if (status && status >= 500) {
        alert(`❌ Server error: ${errorMsg}\n\nThe request may have been approved. Please refresh to check.`);
      } else {
        // Network error or unknown - might have succeeded
        alert("⚠️ Approval may have succeeded. Please refresh to verify.");
      }
    } finally {
      setProcessing({ ...processing, [requestId]: null });
    }
  };

  const handleDeny = async (requestId) => {
    // Find the request to check its status
    const request = requests.find(r => r.id === requestId);
    if (request && request.status !== "requested") {
      alert(`⚠️ Cannot deny request: Status is already "${request.status}". Please refresh the page.`);
      // Refresh the list to get updated statuses
      await qc.refetchQueries({ queryKey: ["overtimeOffers"] });
      return;
    }
    
    const reason = prompt("Reason for denial (optional):");
    if (reason === null) return; // User cancelled
    
    setProcessing({ ...processing, [requestId]: "denying" });
    try {
      await denyOvertimeRequest(requestId, reason || null);
      qc.invalidateQueries({ queryKey: ["overtimeOffers"] });
      alert("✅ Overtime request denied");
    } catch (err) {
      console.error("Error denying request:", err);
      const errorMsg = err.response?.data?.message || err.message;
      
      // Check if the error is because the status changed
      if (errorMsg.includes("status") || errorMsg.includes("already")) {
        alert(`⚠️ ${errorMsg}\n\nPlease refresh the page to see the updated status.`);
        // Refresh the list
        await qc.refetchQueries({ queryKey: ["overtimeOffers"] });
      } else {
        alert(`❌ Failed to deny: ${errorMsg}`);
      }
    } finally {
      setProcessing({ ...processing, [requestId]: null });
    }
  };

  return (
    <Card
      title="Overtime Requests"
      subtitle={
        isLoading
          ? "Loading…"
          : `${requestedOnly.length} pending request${requestedOnly.length !== 1 ? "s" : ""}`
      }
    >
      {isLoading ? (
        <div style={{ opacity: 0.75 }}>Loading…</div>
      ) : error ? (
        <div className="notice" style={{ padding: 12, background: "rgba(239, 68, 68, 0.1)", borderRadius: 8 }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Failed to load requests</div>
          <div style={{ fontSize: 12, opacity: 0.8 }}>
            {error.response?.data?.message || error.message || "Unknown error"}
          </div>
          {error.response?.status && (
            <div style={{ fontSize: 11, opacity: 0.7, marginTop: 4 }}>
              Status: {error.response.status}
            </div>
          )}
        </div>
      ) : requestedOnly.length === 0 ? (
        <div style={{ opacity: 0.75 }}>No pending overtime requests</div>
      ) : (
        <ul className="list">
          {requestedOnly.slice(0, 6).map((request) => {
            // Parse timestamps - these are stored as UTC but represent local time moments
            // When admin selected "11:00 PM", it was stored as "4:00 AM UTC" (if EST, UTC-5)
            // We need to display them as the local time they represent
            const currentEnd = request.current_end_time ? new Date(request.current_end_time) : null;
            const proposedEnd = request.proposed_end_time ? new Date(request.proposed_end_time) : null;
            // Ensure extensionHours is a number (database might return string or Decimal)
            const extensionHours = parseFloat(request.extension_hours) || 0;

            return (
              <li key={request.id}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
                  <div>
                    <b>{request.guard_name || request.guard_email || "Guard"}</b>
                    {getStatusBadge(request.status)}
                  </div>
                  <div style={{ fontSize: 11, opacity: 0.7 }}>
                    {formatRelativeTime(request.created_at)}
                  </div>
                </div>
                <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                  <div>
                    <strong>Extension:</strong> +{extensionHours.toFixed(1)} hours
                  </div>
                  <div style={{ marginTop: 2 }}>
                    <strong>Current End:</strong> {request.current_end_time ? (
                      <>
                        {formatDate(request.current_end_time)} {formatTime(request.current_end_time)}
                      </>
                    ) : "—"}
                  </div>
                  <div style={{ marginTop: 2 }}>
                    <strong>Proposed End:</strong> {request.proposed_end_time ? (
                      <>
                        {formatDate(request.proposed_end_time)} {formatTime(request.proposed_end_time)}
                      </>
                    ) : "—"}
                  </div>
                  {request.reason && (
                    <div style={{ marginTop: 4, fontStyle: "italic" }}>
                      "{request.reason}"
                    </div>
                  )}
                  {request.shift_date && (
                    <div style={{ marginTop: 2, fontSize: 11 }}>
                      Shift: {formatDate(request.shift_date)} • {request.location || "No location"}
                    </div>
                  )}
                </div>
                {/* Only show action buttons if status is still "requested" */}
                {request.status === "requested" && (
                  <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                    <button
                      onClick={() => handleApprove(request.id)}
                      disabled={processing[request.id]}
                      style={{
                        padding: "6px 12px",
                        borderRadius: 6,
                        border: "none",
                        background: "#22c55e",
                        color: "white",
                        fontWeight: 600,
                        cursor: processing[request.id] ? "not-allowed" : "pointer",
                        opacity: processing[request.id] ? 0.6 : 1,
                        fontSize: 12,
                      }}
                    >
                      {processing[request.id] === "approving" ? "Approving..." : "✅ Approve"}
                    </button>
                    <button
                      onClick={() => handleDeny(request.id)}
                      disabled={processing[request.id]}
                      style={{
                        padding: "6px 12px",
                        borderRadius: 6,
                        border: "none",
                        background: "#ef4444",
                        color: "white",
                        fontWeight: 600,
                        cursor: processing[request.id] ? "not-allowed" : "pointer",
                        opacity: processing[request.id] ? 0.6 : 1,
                        fontSize: 12,
                      }}
                    >
                      {processing[request.id] === "denying" ? "Denying..." : "❌ Deny"}
                    </button>
                  </div>
                )}
                {/* Show message if status changed */}
                {request.status !== "requested" && (
                  <div style={{ 
                    marginTop: 8, 
                    padding: 8, 
                    background: "rgba(107, 114, 128, 0.1)", 
                    borderRadius: 6,
                    fontSize: 12,
                    color: "rgba(255, 255, 255, 0.7)"
                  }}>
                    This request has been {request.status}. Refresh to see updated status.
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
};

// Helper function for relative time
function formatRelativeTime(dateValue) {
  if (!dateValue) return "—";
  const d = new Date(dateValue);
  if (Number.isNaN(d.getTime())) return "—";

  const diffMs = Date.now() - d.getTime();
  const sec = Math.floor(diffMs / 1000);
  if (sec < 10) return "just now";
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  return `${day}d ago`;
}

export default OvertimeRequests;
