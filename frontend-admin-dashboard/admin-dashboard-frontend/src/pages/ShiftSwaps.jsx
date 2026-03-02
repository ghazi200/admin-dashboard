/**
 * Shift Swap Management Page
 * 
 * Admin-facing page to manage shift swap requests
 */

import React, { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Card from "../components/Card";
import { listShiftSwaps, approveShiftSwap, rejectShiftSwap } from "../services/api";
import { hasAccess } from "../utils/access";

export default function ShiftSwaps() {
  const queryClient = useQueryClient();
  const canWrite = hasAccess("shifts:write");
  const [filterStatus, setFilterStatus] = useState("");

  // Fetch shift swaps
  const { data, isLoading, error } = useQuery({
    queryKey: ["shiftSwaps", filterStatus],
    queryFn: async () => {
      console.log("[ShiftSwaps] Fetching swaps with status:", filterStatus);
      try {
        const result = await listShiftSwaps(filterStatus);
        console.log("[ShiftSwaps] API Response:", result);
        return result;
      } catch (err) {
        console.error("[ShiftSwaps] API Error:", err);
        throw err;
      }
    },
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  // Ensure swaps is always an array
  // Axios response structure: { data: { data: [...] }, status: 200, ... }
  // Backend returns: { data: [...] }
  // So we need: data.data.data to get the array
  const swaps = React.useMemo(() => {
    if (!data) return [];
    
    // Axios wraps the response, so data.data is the backend response { data: [...] }
    // And data.data.data is the actual array
    if (data.data && Array.isArray(data.data.data)) {
      return data.data.data;
    }
    
    // Fallback: try data.data if it's directly an array
    if (Array.isArray(data.data)) {
      return data.data;
    }
    
    // Fallback: try data if it's directly an array
    if (Array.isArray(data)) {
      return data;
    }
    
    console.warn("[ShiftSwaps] Unexpected data structure:", data);
    return [];
  }, [data]);

  // Debug logging
  useEffect(() => {
    console.log("[ShiftSwaps] Component State:", {
      isLoading,
      error: error?.message,
      dataCount: swaps.length,
      filterStatus,
      rawData: data,
    });
  }, [isLoading, error, swaps.length, filterStatus, data]);

  // Approve mutation
  const approveMutation = useMutation({
    mutationFn: async ({ swapId, adminNotes }) => {
      try {
        const response = await approveShiftSwap(swapId, adminNotes);
        return response;
      } catch (error) {
        // Check if it's actually a success (status 200) but axios is treating it as error
        if (error.response && error.response.status === 200) {
          return error.response;
        }
        throw error;
      }
    },
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ["shiftSwaps"] });
      const message = response?.data?.message || "Shift swap approved successfully!";
      alert(message);
    },
    onError: (error) => {
      // Only show error if it's not a 200 status
      if (error.response && error.response.status !== 200) {
        alert(`Failed to approve: ${error.response?.data?.message || error.message}`);
      } else {
        // If it's a 200, treat as success
        queryClient.invalidateQueries({ queryKey: ["shiftSwaps"] });
        alert("Shift swap approved successfully!");
      }
    },
  });

  // Reject mutation
  const rejectMutation = useMutation({
    mutationFn: async ({ swapId, adminNotes }) => {
      try {
        const response = await rejectShiftSwap(swapId, adminNotes);
        return response;
      } catch (error) {
        // Check if it's actually a success (status 200) but axios is treating it as error
        if (error.response && error.response.status === 200) {
          return error.response;
        }
        throw error;
      }
    },
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ["shiftSwaps"] });
      const message = response?.data?.message || "Shift swap rejected";
      alert(message);
    },
    onError: (error) => {
      // Only show error if it's not a 200 status
      if (error.response && error.response.status !== 200) {
        alert(`Failed to reject: ${error.response?.data?.message || error.message}`);
      } else {
        // If it's a 200, treat as success
        queryClient.invalidateQueries({ queryKey: ["shiftSwaps"] });
        alert("Shift swap rejected");
      }
    },
  });

  const handleApprove = (swapId) => {
    const notes = window.prompt("Add admin notes (optional):");
    approveMutation.mutate({ swapId, adminNotes: notes || null });
  };

  const handleReject = (swapId) => {
    const notes = window.prompt("Add rejection reason (optional):");
    if (window.confirm("Reject this shift swap request?")) {
      rejectMutation.mutate({ swapId, adminNotes: notes || null });
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return "—";
    const date = new Date(dateStr);
    return date.toLocaleDateString() + " " + date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  const getStatusBadge = (status) => {
    const colors = {
      pending: "rgba(245, 158, 11, 0.2)",
      approved: "rgba(34, 197, 94, 0.2)",
      rejected: "rgba(239, 68, 68, 0.2)",
      cancelled: "rgba(107, 114, 128, 0.2)",
    };
    return (
      <span
        className="badge"
        style={{
          background: colors[status] || "rgba(107, 114, 128, 0.2)",
          textTransform: "capitalize",
        }}
      >
        {status}
      </span>
    );
  };

  return (
    <div className="container">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 26 }}>Shift Swaps</h1>
          <div style={{ opacity: 0.7, fontSize: 13, marginTop: 4 }}>
            Review and manage shift swap requests from guards
          </div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)" }}
          >
            <option value="">All Status</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
      </div>

      {error && (
        <div className="notice" style={{ marginBottom: 20, background: "rgba(239, 68, 68, 0.2)", padding: 16, borderRadius: 8 }}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>Error Loading Shift Swaps:</div>
          <div style={{ fontSize: 13, marginBottom: 4 }}>
            Status: {error.response?.status || "Unknown"}
          </div>
          <div style={{ fontSize: 13, marginBottom: 4 }}>
            Message: {error.response?.data?.message || error.message || "Failed to load shift swaps"}
          </div>
          <div style={{ fontSize: 12, opacity: 0.7, marginTop: 8 }}>
            URL: {error.config?.url || "Unknown"}
            {error.response?.status === 404 && (
              <div style={{ marginTop: 8, padding: 8, background: "rgba(0,0,0,0.2)", borderRadius: 4 }}>
                💡 404 Error: The backend route might not be registered. Please restart the backend server.
              </div>
            )}
          </div>
        </div>
      )}

      <Card title={`Shift Swap Requests (${swaps.length})`}>
        {isLoading ? (
          <div style={{ opacity: 0.7 }}>Loading shift swaps...</div>
        ) : error ? (
          <div style={{ opacity: 0.7, padding: 40, textAlign: "center", color: "#ef4444" }}>
            Error loading swaps: {error.response?.data?.message || error.message}
            <div style={{ marginTop: 10, fontSize: 12 }}>
              Check browser console (F12) for details
            </div>
          </div>
        ) : swaps.length === 0 ? (
          <div style={{ opacity: 0.7, padding: 40, textAlign: "center" }}>
            No shift swap requests found
            {filterStatus && ` with status "${filterStatus}"`}
            <div style={{ marginTop: 10, fontSize: 12 }}>
              Debug: Check browser console (F12) → Network tab → /api/admin/shift-swaps
            </div>
            <div style={{ marginTop: 10, fontSize: 11, opacity: 0.6 }}>
              Raw data: {JSON.stringify(data).substring(0, 200)}...
            </div>
          </div>
        ) : (
          <div style={{ display: "grid", gap: 16 }}>
            {Array.isArray(swaps) && swaps.length > 0 ? swaps.map((swap) => (
              <div
                key={swap.id}
                style={{
                  padding: 16,
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: 12,
                  background: swap.status === "pending" ? "rgba(245, 158, 11, 0.05)" : "rgba(255,255,255,0.02)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: 12 }}>
                  <div>
                    <div style={{ fontWeight: 600, marginBottom: 4 }}>
                      {swap.requester_name} wants to swap shift
                    </div>
                    <div style={{ fontSize: 13, opacity: 0.7 }}>
                      {formatDate(swap.shift_date)} {swap.shift_start} - {swap.shift_end} at {swap.location}
                    </div>
                  </div>
                  {getStatusBadge(swap.status)}
                </div>

                {swap.target_name && (
                  <div style={{ marginTop: 8, padding: 8, background: "rgba(255,255,255,0.03)", borderRadius: 8 }}>
                    <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 4 }}>Swap with:</div>
                    <div style={{ fontWeight: 500 }}>
                      {swap.target_name}
                      {swap.target_shift_date && (
                        <span style={{ opacity: 0.7, marginLeft: 8 }}>
                          ({formatDate(swap.target_shift_date)} {swap.target_shift_start} - {swap.target_shift_end})
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {swap.reason && (
                  <div style={{ marginTop: 8, padding: 8, background: "rgba(255,255,255,0.03)", borderRadius: 8 }}>
                    <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 4 }}>Reason:</div>
                    <div>{swap.reason}</div>
                  </div>
                )}

                {swap.admin_notes && (
                  <div style={{ marginTop: 8, padding: 8, background: "rgba(255,255,255,0.03)", borderRadius: 8 }}>
                    <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 4 }}>Admin Notes:</div>
                    <div>{swap.admin_notes}</div>
                  </div>
                )}

                <div style={{ fontSize: 11, opacity: 0.5, marginTop: 8 }}>
                  Requested: {formatDate(swap.created_at)}
                </div>

                {swap.status === "pending" && canWrite && (
                  <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
                    <button
                      className="btn"
                      onClick={() => handleApprove(swap.id)}
                      disabled={approveMutation.isPending}
                      style={{
                        background: "rgba(34, 197, 94, 0.2)",
                        border: "1px solid rgba(34, 197, 94, 0.4)",
                        color: "#22c55e",
                      }}
                    >
                      {approveMutation.isPending ? "Approving..." : "✅ Approve"}
                    </button>
                    <button
                      className="btn"
                      onClick={() => handleReject(swap.id)}
                      disabled={rejectMutation.isPending}
                      style={{
                        background: "rgba(239, 68, 68, 0.2)",
                        border: "1px solid rgba(239, 68, 68, 0.4)",
                        color: "#ef4444",
                      }}
                    >
                      {rejectMutation.isPending ? "Rejecting..." : "❌ Reject"}
                    </button>
                  </div>
                )}
              </div>
            )) : (
              <div style={{ opacity: 0.7, padding: 40, textAlign: "center" }}>
                Invalid data format received
              </div>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
