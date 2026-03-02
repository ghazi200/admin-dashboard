import React, { useState, useEffect } from "react";
import NavBar from "../components/NavBar";
import { useAuth } from "../auth/AuthContext";
import {
  requestShiftSwap,
  getAvailableSwaps,
  acceptShiftSwap,
  cancelShiftSwap,
} from "../services/shiftManagement.api";
import "./shifts.css";

// Helper to decode JWT token
function decodeJwt(token) {
  try {
    if (!token || typeof token !== "string") return null;
    const parts = token.split(".");
    if (parts.length < 2) return null;
    let payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    while (payload.length % 4) payload += "=";
    const json = atob(payload);
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export default function ShiftSwapMarketplace() {
  console.log("[ShiftSwapMarketplace] Component mounted!");
  
  const { user, token } = useAuth();
  console.log("[ShiftSwapMarketplace] Auth context:", { hasUser: !!user, hasToken: !!token });
  
  // Try to get guard ID from multiple sources:
  // 1. User object (id, guard_id, guardId)
  // 2. JWT token (guardId)
  const userGuardId = user?.id || user?.guard_id || user?.guardId;
  const tokenData = token ? decodeJwt(token) : null;
  const tokenGuardId = tokenData?.guardId || tokenData?.guard_id;
  const guardId = userGuardId || tokenGuardId;
  
  console.log("[ShiftSwapMarketplace] Guard ID resolved:", { userGuardId, tokenGuardId, guardId });
  
  const [activeTab, setActiveTab] = useState("browse"); // "browse" | "post"
  const [swaps, setSwaps] = useState([]);
  const [mySwaps, setMySwaps] = useState([]); // Swaps posted by current guard
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  
  const [requesting, setRequesting] = useState(false);
  const [accepting, setAccepting] = useState(null);
  const [cancelling, setCancelling] = useState(null);

  // Debug logging
  useEffect(() => {
    console.log("[ShiftSwapMarketplace] Debug Info:", {
      user,
      token: token ? `${token.substring(0, 20)}...` : "no token",
      tokenData,
      userGuardId,
      tokenGuardId,
      guardId,
    });
  }, [user, token, tokenData, userGuardId, tokenGuardId, guardId]);

  // Fetch available swaps
  useEffect(() => {
    if (!guardId) {
      console.warn("[ShiftSwapMarketplace] No guardId, skipping API call");
      setIsLoading(false);
      return;
    }
    
    console.log("[ShiftSwapMarketplace] Fetching swaps for guard:", guardId);
    setIsLoading(true);
    getAvailableSwaps(guardId)
      .then((res) => {
        console.log("[ShiftSwapMarketplace] API Response:", res);
        const swapsData = res?.data?.data || res?.data || [];
        const swapsArray = Array.isArray(swapsData) ? swapsData : [];
        
        // Separate my swaps from other swaps
        const currentGuardIdStr = String(guardId || "").trim();
        const mySwapsList = swapsArray.filter(swap => {
          const requesterId = String(swap.requester_guard_id || "").trim();
          return requesterId === currentGuardIdStr && requesterId !== "";
        });
        const otherSwaps = swapsArray.filter(swap => {
          const requesterId = String(swap.requester_guard_id || "").trim();
          return requesterId !== currentGuardIdStr;
        });
        
        setSwaps(swapsArray); // Keep all swaps for display
        setMySwaps(mySwapsList);
        setError(null);
        
        console.log("[ShiftSwapMarketplace] Swaps loaded:", swapsArray.length);
        console.log("[ShiftSwapMarketplace] My swaps:", mySwapsList.length);
        console.log("[ShiftSwapMarketplace] Other swaps:", otherSwaps.length);
        console.log("[ShiftSwapMarketplace] Current guardId:", guardId, "(type:", typeof guardId, ")");
        if (swapsArray.length > 0) {
          console.log("[ShiftSwapMarketplace] First swap:", {
            swap_id: swapsArray[0].swap_id || swapsArray[0].id,
            requester_guard_id: swapsArray[0].requester_guard_id,
            requester_type: typeof swapsArray[0].requester_guard_id,
            status: swapsArray[0].status,
            guard_name: swapsArray[0].guard_name,
          });
          console.log("[ShiftSwapMarketplace] ID Comparison:", {
            swapRequester: String(swapsArray[0].requester_guard_id || "").trim(),
            currentGuard: currentGuardIdStr,
            match: String(swapsArray[0].requester_guard_id || "").trim() === currentGuardIdStr,
          });
        }
      })
      .catch((err) => {
        console.error("[ShiftSwapMarketplace] Failed to load swaps:", err);
        console.error("[ShiftSwapMarketplace] Error details:", {
          message: err.message,
          response: err.response?.data,
          status: err.response?.status,
        });
        setError(err.response?.data?.message || err.message || "Failed to load swaps");
        setSwaps([]);
      })
      .finally(() => setIsLoading(false));
  }, [guardId]);

  const handleRequestSwap = async (e) => {
    e.preventDefault();
    if (!guardId) {
      alert("Guard ID not found. Please log in again.");
      return;
    }
    
    const formData = new FormData(e.target);
    const shiftId = formData.get("shift_id")?.trim();
    
    if (!shiftId) {
      alert("Please enter a shift ID");
      return;
    }
    
    const data = {
      shift_id: shiftId,
      target_guard_id: formData.get("target_guard_id") || null,
      reason: formData.get("reason") || null,
    };

    console.log("[ShiftSwapMarketplace] Submitting swap request:", data);
    setRequesting(true);
    try {
      const response = await requestShiftSwap(data);
      console.log("[ShiftSwapMarketplace] Swap request successful:", response.data);
      
      // Check if response indicates success (even if axios flagged it as error)
      if (response?.status === 200 || response?.status === 201 || response?.data) {
        alert("✅ Shift swap request submitted! You can now cancel it from the Browse tab.");
        e.target.reset();
        // Switch to browse tab and refresh swaps list
        setActiveTab("browse");
        const res = await getAvailableSwaps(guardId);
        const swapsData = res?.data?.data || res?.data || [];
        setSwaps(Array.isArray(swapsData) ? swapsData : []);
      } else {
        throw new Error("Unexpected response format");
      }
    } catch (err) {
      console.error("[ShiftSwapMarketplace] Swap request error:", err);
      
      // Check if it's actually a success (200/201) that axios flagged as error
      if (err.response?.status === 200 || err.response?.status === 201) {
        console.log("[ShiftSwapMarketplace] Actually successful despite error flag");
        alert("✅ Shift swap request submitted! You can now cancel it from the Browse tab.");
        e.target.reset();
        setActiveTab("browse");
        const res = await getAvailableSwaps(guardId);
        const swapsData = res?.data?.data || res?.data || [];
        setSwaps(Array.isArray(swapsData) ? swapsData : []);
      } else {
        const isNetwork = err?.code === "ECONNREFUSED" || err?.code === "ERR_NETWORK";
        const errorMsg = isNetwork
          ? "Cannot reach server. Start the Admin Dashboard backend (port 5000): cd admin-dashboard/backend && node server.js"
          : (err.response?.data?.message || err.response?.data?.error || err.message || "Unknown error");
        const errorDetails = err.response?.data?.details;
        console.error("[ShiftSwapMarketplace] Error details:", err.response?.data);
        alert(`Failed: ${errorMsg}${errorDetails ? `\n\nDetails: ${errorDetails}` : ""}`);
      }
    } finally {
      setRequesting(false);
    }
  };

  const handleAcceptSwap = async (swapId) => {
    if (!guardId || !window.confirm("Accept this shift swap?")) return;
    
    console.log("[ShiftSwapMarketplace] Accepting swap:", swapId);
    setAccepting(swapId);
    try {
      await acceptShiftSwap(swapId, guardId);
      alert("Swap accepted! Waiting for admin approval.");
      // Refresh swaps list
      const res = await getAvailableSwaps(guardId);
      const swapsData = res?.data?.data || res?.data || [];
      setSwaps(Array.isArray(swapsData) ? swapsData : []);
    } catch (err) {
      console.error("[ShiftSwapMarketplace] Accept swap error:", err);
      const isNetwork = err?.code === "ECONNREFUSED" || err?.code === "ERR_NETWORK";
      const msg = isNetwork
        ? "Cannot reach server. Start Admin backend (port 5000): cd admin-dashboard/backend && node server.js"
        : (err.response?.data?.message || err.message);
      alert(`Failed: ${msg}`);
    } finally {
      setAccepting(null);
    }
  };

  const handleCancelSwap = async (swapId) => {
    if (!guardId || !window.confirm("Cancel this shift swap request?")) return;
    
    console.log("[ShiftSwapMarketplace] Cancelling swap:", swapId);
    setCancelling(swapId);
    try {
      const response = await cancelShiftSwap(swapId);
      console.log("[ShiftSwapMarketplace] Cancel swap successful:", response.data);
      
      // Check if response indicates success
      if (response?.status === 200 || response?.status === 204 || response?.data) {
        alert("✅ Swap request cancelled successfully.");
        // Refresh swaps list
        const res = await getAvailableSwaps(guardId);
        const swapsData = res?.data?.data || res?.data || [];
        setSwaps(Array.isArray(swapsData) ? swapsData : []);
      } else {
        throw new Error("Unexpected response format");
      }
    } catch (err) {
      console.error("[ShiftSwapMarketplace] Cancel swap error:", err);
      const isNetwork = err?.code === "ECONNREFUSED" || err?.code === "ERR_NETWORK";
      if (!(err.response?.status === 200 || err.response?.status === 204) && isNetwork) {
        alert("Cannot reach server. Start Admin backend (port 5000): cd admin-dashboard/backend && node server.js");
        setCancelling(null);
        return;
      }
      // Check if it's actually a success (200/204) that axios flagged as error
      if (err.response?.status === 200 || err.response?.status === 204) {
        console.log("[ShiftSwapMarketplace] Actually successful despite error flag");
        alert("✅ Swap request cancelled successfully.");
        // Refresh swaps list
        const res = await getAvailableSwaps(guardId);
        const swapsData = res?.data?.data || res?.data || [];
        setSwaps(Array.isArray(swapsData) ? swapsData : []);
      } else {
        alert(`Failed: ${err.response?.data?.message || err.message}`);
      }
    } finally {
      setCancelling(null);
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return "—";
    return new Date(dateStr).toLocaleDateString();
  };

  // Get status CSS class following guard-ui color scheme
  const getStatusClass = (swap) => {
    const status = swap?.status || swap?.swap_status || "pending";
    const statusStr = String(status).toLowerCase().trim();
    
    // Match the statusTone function from Callouts.jsx
    if (["closed", "filled", "assigned", "completed", "accepted", "approved"].includes(statusStr)) {
      return "state--ok";
    }
    
    if (["open", "pending", "in_progress", "running_late", "late"].includes(statusStr)) {
      return "state--warn";
    }
    
    if (["callout", "cancelled", "failed", "declined", "no_response", "error", "rejected"].includes(statusStr)) {
      return "state--bad";
    }
    
    return ""; // Default - no special class
  };

  const getStatusLabel = (swap) => {
    const status = swap?.status || swap?.swap_status || "pending";
    const statusStr = String(status).toLowerCase().trim();
    
    const statusLabels = {
      open: "Available",
      pending: "Pending",
      approved: "Approved",
      rejected: "Rejected",
      accepted: "Accepted",
      completed: "Completed",
      active: "Active",
      inactive: "Inactive",
    };
    
    return statusLabels[statusStr] || status || "Unknown";
  };

  if (!guardId) {
    return (
      <div>
        <NavBar />
        <div style={{ padding: 40, textAlign: "center" }}>
          <h3>Please log in to view shift swaps.</h3>
          <div style={{ marginTop: 20, fontSize: 12, opacity: 0.7 }}>
            <div>Debug Info:</div>
            <div>User: {user ? JSON.stringify(user, null, 2) : "null"}</div>
            <div>Guard ID: {guardId || "not found"}</div>
          </div>
        </div>
      </div>
    );
  }

  // Always render something - even if there's an error
  console.log("[ShiftSwapMarketplace] Rendering with:", { guardId, isLoading, error, swaps: swaps.length });

  return (
    <>
      <NavBar />
      <div className="page">
        <div className="card">
          <h2>Shift Swap Marketplace</h2>
        
          {/* Debug info - remove in production */}
          {process.env.NODE_ENV === 'development' && (
            <div className="muted" style={{ 
              padding: 12, 
              background: "rgba(255,255,255,0.03)", 
              borderRadius: 8, 
              marginBottom: 20,
              fontSize: 12,
              fontFamily: "monospace"
            }}>
              <div><strong>Debug Info:</strong></div>
              <div>Guard ID: {guardId || "❌ Not found"}</div>
              <div>Loading: {isLoading ? "⏳ Yes" : "✅ No"}</div>
              <div>Error: {error || "None"}</div>
              <div>Swaps Count: {swaps.length}</div>
            </div>
          )}
          
          <div className="row" style={{ gap: 10, marginBottom: 20 }}>
            <button
              className={`btn ${activeTab === "browse" ? "btnPrimary" : ""}`}
              onClick={() => setActiveTab("browse")}
            >
              Browse Swaps ({swaps.length})
              {mySwaps.length > 0 && ` (${mySwaps.length} yours)`}
            </button>
            <button
              className={`btn ${activeTab === "post" ? "btnPrimary" : ""}`}
              onClick={() => setActiveTab("post")}
            >
              Post My Shift
            </button>
          </div>
          
          {/* Info: Show my swaps count */}
          {mySwaps.length > 0 ? (
            <div className="muted" style={{ marginBottom: 12, padding: 8, background: "rgba(239,68,68,0.1)", borderRadius: 8 }}>
              ✅ You have {mySwaps.length} pending swap(s) - Cancel button should be visible on your swaps
            </div>
          ) : swaps.length > 0 ? (
            <div className="muted" style={{ marginBottom: 12, padding: 8, background: "rgba(245,158,11,0.1)", borderRadius: 8 }}>
              ℹ️ You have no pending swaps posted. Post a swap to see the cancel button.
            </div>
          ) : null}

          {activeTab === "browse" && (
            <div>
              <h3>Available Shift Swaps</h3>
              {!guardId ? (
                <div className="error">
                  ⚠️ Guard ID not found. Please log in as a guard to view shift swaps.
                </div>
              ) : isLoading ? (
                <div className="muted" style={{ padding: 40, textAlign: "center" }}>
                  ⏳ Loading swaps...
                </div>
              ) : error ? (
                <div className="error">
                  ❌ Error loading swaps: {error}
                  <div className="muted" style={{ marginTop: 8 }}>
                    Check browser console (F12) → Network tab for API errors
                  </div>
                </div>
              ) : swaps.length === 0 ? (
                <div className="muted" style={{ padding: 40, textAlign: "center" }}>
                  📭 No available swaps at the moment
                  <div style={{ fontSize: 12, marginTop: 8 }}>
                    Check back later or post your own shift for swap!
                  </div>
                </div>
              ) : (
                <div style={{ marginTop: 12 }}>
                  {swaps.map((swap) => {
                    const swapId = swap.swap_id || swap.id;
                    const swapStatus = swap.status || swap.swap_status || "pending";
                    const statusClass = getStatusClass({ status: swapStatus });
                    
                    return (
                      <div
                        key={swapId}
                        className="listRow"
                        style={{ marginBottom: 12 }}
                      >
                        <div>
                          <div>
                            <b>{formatDate(swap.shift_date)} {swap.shift_start} - {swap.shift_end}</b>
                          </div>
                          <div className="muted">
                            {swap.location || "Location TBD"}
                            {swap.guard_name && ` • Posted by: ${swap.guard_name}`}
                            {(() => {
                              const swapRequesterId = String(swap.requester_guard_id || "").trim();
                              const currentGuardId = String(guardId || "").trim();
                              const isMySwap = swapRequesterId === currentGuardId && swapRequesterId !== "";
                              return isMySwap && " • (Your swap)";
                            })()}
                          </div>
                          {swap.reason && (
                            <div className="muted" style={{ marginTop: 4, fontSize: 12 }}>
                              {swap.reason}
                            </div>
                          )}
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                          <span className={`badge ${statusClass}`}>
                            {getStatusLabel({ status: swapStatus })}
                          </span>
                          {(() => {
                            const statusLower = String(swapStatus).toLowerCase();
                            const isAvailable = statusLower === "open" || statusLower === "pending";
                            
                            // Normalize IDs for comparison (handle string vs UUID)
                            const swapRequesterId = String(swap.requester_guard_id || "").trim();
                            const currentGuardId = String(guardId || "").trim();
                            const isMySwap = swapRequesterId === currentGuardId && swapRequesterId !== "";
                            
                            // Always log for debugging with expanded values
                            console.log(`[ShiftSwapMarketplace] Swap ${swapId}:`);
                            console.log(`  - swapRequesterId: "${swapRequesterId}" (type: ${typeof swapRequesterId})`);
                            console.log(`  - currentGuardId: "${currentGuardId}" (type: ${typeof currentGuardId})`);
                            console.log(`  - isMySwap: ${isMySwap}`);
                            console.log(`  - statusLower: "${statusLower}"`);
                            console.log(`  - isAvailable: ${isAvailable}`);
                            console.log(`  - requester_guard_id (raw):`, swap.requester_guard_id);
                            console.log(`  - guardId (raw):`, guardId);
                            console.log(`  - IDs match? ${swapRequesterId === currentGuardId}`);
                            
                            // Show cancel button if it's the guard's own swap and it's pending
                            if (isMySwap && statusLower === "pending") {
                              console.log(`[ShiftSwapMarketplace] ✅✅✅ RENDERING CANCEL BUTTON for swap ${swapId} ✅✅✅`);
                              return (
                                <button
                                  className="btn state--bad"
                                  onClick={() => handleCancelSwap(swapId)}
                                  disabled={cancelling === swapId}
                                  style={{ 
                                    background: "rgba(239,68,68,0.95)", 
                                    border: "1px solid rgba(239,68,68,0.55)",
                                    color: "#fff",
                                    fontWeight: 600,
                                  }}
                                >
                                  {cancelling === swapId ? "Cancelling..." : "Cancel"}
                                </button>
                              );
                            } else {
                              const reason = !isMySwap 
                                ? `Not my swap (requester: "${swapRequesterId}", my ID: "${currentGuardId}")` 
                                : statusLower !== "pending" 
                                  ? `Status is "${statusLower}" not "pending"` 
                                  : "Unknown reason";
                              console.log(`[ShiftSwapMarketplace] ❌ NOT showing cancel for swap ${swapId}: ${reason}`);
                            }
                            
                            // Show accept button if it's someone else's swap and it's available
                            if (!isMySwap && isAvailable) {
                              return (
                                <button
                                  className="btn state--ok"
                                  onClick={() => handleAcceptSwap(swapId)}
                                  disabled={accepting === swapId}
                                >
                                  {accepting === swapId ? "Accepting..." : "Accept"}
                                </button>
                              );
                            }
                            
                            return null;
                          })()}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {activeTab === "post" && (
            <div>
              <h3>Post Shift for Swap</h3>
              <form onSubmit={handleRequestSwap}>
                <label className="label">
                  Shift ID
                  <input
                    type="text"
                    name="shift_id"
                    required
                    className="input"
                    placeholder="Enter shift ID"
                  />
                </label>
                <label className="label" style={{ marginTop: 12 }}>
                  Reason (optional)
                  <textarea
                    name="reason"
                    rows={3}
                    className="input"
                    style={{ resize: "vertical" }}
                    placeholder="Why are you swapping this shift?"
                  />
                </label>
                <div className="row" style={{ marginTop: 12 }}>
                  <button
                    type="submit"
                    className="btn btnPrimary"
                    disabled={requesting}
                  >
                    {requesting ? "Submitting..." : "Post Shift for Swap"}
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
