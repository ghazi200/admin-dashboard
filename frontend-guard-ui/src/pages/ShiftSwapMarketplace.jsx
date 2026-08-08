import React, { useState, useEffect, useCallback } from "react";
import NavBar from "../components/NavBar";
import { useAuth } from "../auth/AuthContext";
import {
  requestShiftSwap,
  getAvailableSwaps,
  acceptShiftSwap,
  cancelShiftSwap,
} from "../services/shiftManagement.api";
import { listShifts } from "../services/guardApi";
import "./shifts.css";

function decodeJwt(token) {
  try {
    if (!token || typeof token !== "string") return null;
    const parts = token.split(".");
    if (parts.length < 2) return null;
    let payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    while (payload.length % 4) payload += "=";
    return JSON.parse(atob(payload));
  } catch {
    return null;
  }
}

function idEq(a, b) {
  const x = String(a || "").trim().toLowerCase();
  const y = String(b || "").trim().toLowerCase();
  return Boolean(x && y && x === y);
}

function formatDate(dateStr) {
  if (!dateStr) return "—";
  try {
    return new Date(dateStr).toLocaleDateString();
  } catch {
    return String(dateStr);
  }
}

function shiftLabel(s) {
  const date = s.shift_date || s.date || s.start || "";
  const start = s.shift_start || s.start_time || "";
  const end = s.shift_end || s.end_time || "";
  const loc = s.location || "Location TBD";
  const when = [formatDate(date), start && end ? `${start}-${end}` : start || end]
    .filter(Boolean)
    .join(" ");
  return `${when} · ${loc}`;
}

export default function ShiftSwapMarketplace() {
  const { user, token } = useAuth();
  const userGuardId = user?.id || user?.guard_id || user?.guardId;
  const tokenData = token ? decodeJwt(token) : null;
  const tokenGuardId = tokenData?.guardId || tokenData?.guard_id;
  const guardId = userGuardId || tokenGuardId;

  const [activeTab, setActiveTab] = useState("browse");
  const [swaps, setSwaps] = useState([]);
  const [myShifts, setMyShifts] = useState([]);
  const [selectedShiftId, setSelectedShiftId] = useState("");
  const [reason, setReason] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [requesting, setRequesting] = useState(false);
  const [accepting, setAccepting] = useState(null);
  const [cancelling, setCancelling] = useState(null);

  const applySwapsPayload = useCallback((res) => {
    const swapsData = res?.data?.data || res?.data || [];
    setSwaps(Array.isArray(swapsData) ? swapsData : []);
  }, []);

  const refreshSwaps = useCallback(async () => {
    if (!guardId) return;
    const res = await getAvailableSwaps(guardId);
    applySwapsPayload(res);
  }, [guardId, applySwapsPayload]);

  useEffect(() => {
    if (!guardId) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    getAvailableSwaps(guardId)
      .then((res) => {
        applySwapsPayload(res);
        setError(null);
      })
      .catch((err) => {
        setError(err.response?.data?.message || err.message || "Failed to load swaps");
        setSwaps([]);
      })
      .finally(() => setIsLoading(false));
  }, [guardId, applySwapsPayload]);

  useEffect(() => {
    if (!guardId || activeTab !== "post") return;
    listShifts()
      .then((res) => {
        const rows = Array.isArray(res?.data)
          ? res.data
          : res?.data?.shifts || res?.data || [];
        const mine = (Array.isArray(rows) ? rows : []).filter((s) => {
          const st = String(s.status || "").toUpperCase();
          if (st === "CLOSED" || st === "CANCELLED") return false;
          if (s.pending_guard_id) return false;
          // Prefer assigned-to-me; open unassigned shifts can't be swapped by poster
          if (s.guard_id != null && !idEq(s.guard_id, guardId)) return false;
          if (s.guard_id == null && !s.isAssigned && !s.assigned) return false;
          return true;
        });
        setMyShifts(mine);
        if (mine.length === 1) setSelectedShiftId(String(mine[0].id));
      })
      .catch(() => setMyShifts([]));
  }, [guardId, activeTab]);

  const mySwaps = swaps.filter((s) => idEq(s.requester_guard_id, guardId));

  const handleRequestSwap = async (e) => {
    e.preventDefault();
    if (!guardId) {
      alert("Guard ID not found. Please log in again.");
      return;
    }
    if (!selectedShiftId) {
      alert("Please select a shift to post");
      return;
    }

    setRequesting(true);
    try {
      await requestShiftSwap({
        shift_id: selectedShiftId,
        reason: reason || null,
      });
      alert("Shift swap posted. Waiting for another guard to claim it, then admin approval.");
      setReason("");
      setSelectedShiftId("");
      setActiveTab("browse");
      await refreshSwaps();
    } catch (err) {
      const msg =
        err.response?.data?.message ||
        err.response?.data?.error ||
        err.message ||
        "Unknown error";
      alert(`Failed: ${msg}`);
    } finally {
      setRequesting(false);
    }
  };

  const handleAcceptSwap = async (swapId) => {
    if (!guardId || !window.confirm("Claim this shift swap? Admin still needs to approve.")) return;
    setAccepting(swapId);
    try {
      await acceptShiftSwap(swapId, guardId);
      alert("Swap claimed — waiting for admin approval.");
      await refreshSwaps();
    } catch (err) {
      alert(`Failed: ${err.response?.data?.message || err.message}`);
    } finally {
      setAccepting(null);
    }
  };

  const handleCancelSwap = async (swapId) => {
    if (!guardId || !window.confirm("Cancel this swap request?")) return;
    setCancelling(swapId);
    try {
      await cancelShiftSwap(swapId);
      alert("Swap request cancelled.");
      await refreshSwaps();
    } catch (err) {
      alert(`Failed: ${err.response?.data?.message || err.message}`);
    } finally {
      setCancelling(null);
    }
  };

  const getStatusClass = (status) => {
    const s = String(status || "").toLowerCase();
    if (["approved", "accepted", "completed"].includes(s)) return "state--ok";
    if (["pending", "open", "claimed"].includes(s)) return "state--warn";
    if (["cancelled", "rejected"].includes(s)) return "state--bad";
    return "";
  };

  if (!guardId) {
    return (
      <div>
        <NavBar />
        <div className="page shiftSwap-page" style={{ padding: 40, textAlign: "center" }}>
          <h3>Please log in to view shift swaps.</h3>
        </div>
      </div>
    );
  }

  return (
    <>
      <NavBar />
      <div className="page shiftSwap-page">
        <div className="card">
          <h2>Shift Swap Marketplace</h2>
          <p className="muted" style={{ marginBottom: 16 }}>
            Post a shift, wait for another guard to claim it, then an admin/supervisor must approve.
          </p>

          <div className="row" style={{ gap: 10, marginBottom: 20 }}>
            <button
              type="button"
              className={`btn ${activeTab === "browse" ? "btnPrimary" : ""}`}
              onClick={() => setActiveTab("browse")}
            >
              Browse ({swaps.length})
            </button>
            <button
              type="button"
              className={`btn ${activeTab === "post" ? "btnPrimary" : ""}`}
              onClick={() => setActiveTab("post")}
            >
              Post My Shift
            </button>
          </div>

          {mySwaps.length > 0 && (
            <div className="muted" style={{ marginBottom: 12, padding: 8, background: "rgba(239,68,68,0.08)", borderRadius: 8 }}>
              You have {mySwaps.length} pending post{mySwaps.length === 1 ? "" : "s"}.
            </div>
          )}

          {activeTab === "browse" && (
            <div>
              <h3>Available Shift Swaps</h3>
              {isLoading ? (
                <div className="muted" style={{ padding: 40, textAlign: "center" }}>
                  Loading swaps…
                </div>
              ) : error ? (
                <div className="error">Error loading swaps: {error}</div>
              ) : swaps.length === 0 ? (
                <div className="muted" style={{ padding: 40, textAlign: "center" }}>
                  No available swaps right now.
                </div>
              ) : (
                <div style={{ marginTop: 12 }}>
                  {swaps.map((swap) => {
                    const swapId = swap.swap_id || swap.id;
                    const swapStatus = swap.status || "pending";
                    const isMine = idEq(swap.requester_guard_id, guardId);
                    const claimedBy = swap.target_guard_id;
                    const iClaimed = idEq(claimedBy, guardId);
                    const isClaimed = Boolean(claimedBy);
                    const canAccept =
                      !isMine && String(swapStatus).toLowerCase() === "pending" && !isClaimed;

                    let badgeLabel = "Pending";
                    if (isClaimed && String(swapStatus).toLowerCase() === "pending") {
                      badgeLabel = iClaimed ? "Your claim" : "Claimed";
                    } else if (String(swapStatus).toLowerCase() !== "pending") {
                      badgeLabel = String(swapStatus);
                    }

                    return (
                      <div key={swapId} className="listRow" style={{ marginBottom: 12 }}>
                        <div>
                          <div>
                            <b>
                              {formatDate(swap.shift_date)} {swap.shift_start} - {swap.shift_end}
                            </b>
                          </div>
                          <div className="muted">
                            {swap.location || "Location TBD"}
                            {swap.guard_name && ` · Posted by ${swap.guard_name}`}
                            {isMine && " · (Yours)"}
                          </div>
                          {swap.reason && (
                            <div className="muted" style={{ marginTop: 4, fontSize: 12 }}>
                              {swap.reason}
                            </div>
                          )}
                          {isClaimed && !isMine && (
                            <div className="muted" style={{ marginTop: 4, fontSize: 12 }}>
                              {iClaimed
                                ? "You claimed this — waiting for admin approval."
                                : "Already claimed by another guard."}
                            </div>
                          )}
                          {isClaimed && isMine && (
                            <div className="muted" style={{ marginTop: 4, fontSize: 12 }}>
                              Claimed — waiting for admin approval.
                            </div>
                          )}
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                          <span className={`badge ${getStatusClass(isClaimed ? "claimed" : swapStatus)}`}>
                            {badgeLabel}
                          </span>
                          {isMine && String(swapStatus).toLowerCase() === "pending" && (
                            <button
                              type="button"
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
                              {cancelling === swapId ? "Cancelling…" : "Cancel"}
                            </button>
                          )}
                          {canAccept && (
                            <button
                              type="button"
                              className="btn state--ok"
                              onClick={() => handleAcceptSwap(swapId)}
                              disabled={accepting === swapId}
                            >
                              {accepting === swapId ? "Claiming…" : "Claim"}
                            </button>
                          )}
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
                  Your shift
                  <select
                    className="input"
                    required
                    value={selectedShiftId}
                    onChange={(e) => setSelectedShiftId(e.target.value)}
                  >
                    <option value="">Select a shift…</option>
                    {myShifts.map((s) => (
                      <option key={s.id} value={s.id}>
                        {shiftLabel(s)}
                      </option>
                    ))}
                  </select>
                </label>
                {myShifts.length === 0 && (
                  <div className="muted" style={{ marginTop: 8, fontSize: 13 }}>
                    No assigned open shifts available to swap. Closed or pending-accept shifts are excluded.
                  </div>
                )}
                <label className="label" style={{ marginTop: 12 }}>
                  Reason (optional)
                  <textarea
                    rows={3}
                    className="input"
                    style={{ resize: "vertical" }}
                    placeholder="Why are you swapping this shift?"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                </label>
                <div className="row" style={{ marginTop: 12 }}>
                  <button
                    type="submit"
                    className="btn btnPrimary"
                    disabled={requesting || !selectedShiftId}
                  >
                    {requesting ? "Submitting…" : "Post Shift for Swap"}
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
