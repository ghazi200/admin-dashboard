/**
 * Shift Swap Marketplace Component
 * 
 * For use in guard-ui (port 3000)
 * Allows guards to:
 * - Post their shifts for swap
 * - Browse available swaps
 * - Accept swap requests
 */

import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  requestShiftSwap,
  getAvailableSwaps,
  acceptShiftSwap,
} from "../../services/api";

export default function ShiftSwapMarketplace({ guardId }) {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("browse"); // "browse" | "post"

  // Fetch available swaps
  const { data: swapsData, isLoading } = useQuery({
    queryKey: ["availableSwaps", guardId],
    queryFn: () => getAvailableSwaps(guardId),
    enabled: !!guardId,
  });

  const swaps = swapsData?.data || [];

  // Request swap mutation
  const requestMutation = useMutation({
    mutationFn: (data) => requestShiftSwap({ ...data, guard_id: guardId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["availableSwaps"] });
      alert("Shift swap request submitted!");
    },
    onError: (error) => {
      alert(`Failed: ${error.response?.data?.message || error.message}`);
    },
  });

  // Accept swap mutation
  const acceptMutation = useMutation({
    mutationFn: (swapId) => acceptShiftSwap(swapId, guardId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["availableSwaps"] });
      alert("Swap accepted! Waiting for admin approval.");
    },
    onError: (error) => {
      alert(`Failed: ${error.response?.data?.message || error.message}`);
    },
  });

  const handleRequestSwap = (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    requestMutation.mutate({
      shift_id: formData.get("shift_id"),
      target_guard_id: formData.get("target_guard_id") || null,
      reason: formData.get("reason") || null,
    });
    e.target.reset();
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return "—";
    return new Date(dateStr).toLocaleDateString();
  };

  return (
    <div style={{ padding: 20 }}>
      <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
        <button
          className={`btn ${activeTab === "browse" ? "btn-primary" : ""}`}
          onClick={() => setActiveTab("browse")}
        >
          Browse Swaps ({swaps.length})
        </button>
        <button
          className={`btn ${activeTab === "post" ? "btn-primary" : ""}`}
          onClick={() => setActiveTab("post")}
        >
          Post My Shift
        </button>
      </div>

      {activeTab === "browse" && (
        <div>
          <h3>Available Shift Swaps</h3>
          {isLoading ? (
            <div>Loading...</div>
          ) : swaps.length === 0 ? (
            <div style={{ opacity: 0.7, padding: 40, textAlign: "center" }}>
              No available swaps at the moment
            </div>
          ) : (
            <div style={{ display: "grid", gap: 16 }}>
              {swaps.map((swap) => (
                <div
                  key={swap.id}
                  style={{
                    padding: 16,
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: 12,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                    <div>
                      <div style={{ fontWeight: 600 }}>
                        {formatDate(swap.shift_date)} {swap.shift_start} - {swap.shift_end}
                      </div>
                      <div style={{ fontSize: 13, opacity: 0.7 }}>{swap.location}</div>
                    </div>
                    <span
                      className="badge"
                      style={{
                        background: swap.status === "open" ? "rgba(34, 197, 94, 0.2)" : "rgba(107, 114, 128, 0.2)",
                      }}
                    >
                      {swap.status}
                    </span>
                  </div>

                  {swap.request_message && (
                    <div style={{ marginTop: 8, padding: 8, background: "rgba(255,255,255,0.03)", borderRadius: 8 }}>
                      <div style={{ fontSize: 12, opacity: 0.7 }}>Reason:</div>
                      <div>{swap.request_message}</div>
                    </div>
                  )}

                  {swap.status === "open" && (
                    <button
                      className="btn"
                      onClick={() => {
                        if (window.confirm("Accept this shift swap?")) {
                          acceptMutation.mutate(swap.id);
                        }
                      }}
                      disabled={acceptMutation.isPending}
                      style={{ marginTop: 12 }}
                    >
                      {acceptMutation.isPending ? "Accepting..." : "✅ Accept Swap"}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === "post" && (
        <div>
          <h3>Post Shift for Swap</h3>
          <form onSubmit={handleRequestSwap} style={{ maxWidth: 500 }}>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", marginBottom: 8 }}>Shift ID</label>
              <input
                type="text"
                name="shift_id"
                required
                style={{ width: "100%", padding: 8, borderRadius: 8 }}
                placeholder="Enter shift ID"
              />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", marginBottom: 8 }}>Reason (optional)</label>
              <textarea
                name="reason"
                rows={3}
                style={{ width: "100%", padding: 8, borderRadius: 8 }}
                placeholder="Why are you swapping this shift?"
              />
            </div>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={requestMutation.isPending}
            >
              {requestMutation.isPending ? "Submitting..." : "Post Shift for Swap"}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
