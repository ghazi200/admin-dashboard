// src/pages/Callouts.jsx
import React, { useCallback, useEffect, useState } from "react";
import NavBar from "../components/NavBar";
import RunningLateDropdown from "../components/RunningLateDropdown";
import {
  listShifts,
  triggerCallout,
  runningLate,
  respondToCallout,
  listMyCalloutOffers,
} from "../services/guardApi";

/* ================= HELPERS ================= */

function safeDate(v) {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

function pickCurrentShift(shifts) {
  if (!Array.isArray(shifts) || !shifts.length) return null;

  const now = Date.now();

  const flagged =
    shifts.find(
      (s) =>
        s?.is_current ||
        s?.isCurrent ||
        String(s?.status || "").toLowerCase() === "in_progress"
    ) || null;
  if (flagged) return flagged;

  const spanning =
    shifts.find((s) => {
      const start = safeDate(
        s?.start_time || s?.startTime || s?.start_at || s?.starts_at || s?.start
      );
      const end = safeDate(
        s?.end_time || s?.endTime || s?.end_at || s?.ends_at || s?.end
      );

      const st = start ? start.getTime() : null;
      const en = end ? end.getTime() : null;

      if (st && en) return st <= now && now <= en;
      if (st && !en) return st <= now;
      return false;
    }) || null;

  return spanning || shifts[0] || null;
}

function titleizeReason(v) {
  const s = String(v || "").toLowerCase();
  if (!s) return "—";
  return s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, " ");
}

function normalizeStatus(v) {
  return String(v || "").trim().toLowerCase();
}

function statusTone(status) {
  const s = normalizeStatus(status);

  if (["closed", "filled", "assigned", "completed", "accepted"].includes(s)) {
    return "state--ok";
  }

  if (["open", "pending", "in_progress", "running_late", "late"].includes(s)) {
    return "state--warn";
  }

  if (["callout", "cancelled", "failed", "declined", "no_response", "error"].includes(s)) {
    return "state--bad";
  }

  return "";
}

/* ================= PAGE ================= */

export default function Callouts() {
  const [shiftId, setShiftId] = useState("");
  const [loading, setLoading] = useState(false);

  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  const [calloutResult, setCalloutResult] = useState(null);

  const [myOffers, setMyOffers] = useState([]);
  const [offersLoading, setOffersLoading] = useState(false);
  const [respondLoadingId, setRespondLoadingId] = useState("");
  const [respondMsg, setRespondMsg] = useState("");

  const loadMyOffers = useCallback(async () => {
    setOffersLoading(true);
    try {
      const res = await listMyCalloutOffers();
      const rows = Array.isArray(res?.data?.data)
        ? res.data.data
        : Array.isArray(res?.data)
          ? res.data
          : [];
      setMyOffers(rows);
    } catch (e) {
      console.warn("listMyCalloutOffers failed", e?.message || e);
      setMyOffers([]);
    } finally {
      setOffersLoading(false);
    }
  }, []);

  const loadCurrentShift = async () => {
    setErr("");
    setMsg("");
    setLoading(true);
    try {
      const res = await listShifts();
      const rows = Array.isArray(res?.data)
        ? res.data
        : res?.data?.shifts || res?.data || [];

      const cur = pickCurrentShift(rows);
      const id = cur?.id || cur?.shift_id || cur?.shiftId || "";

      if (!id) {
        setShiftId("");
        setErr("No active shift found to attach callout / running late.");
      } else {
        setShiftId(String(id));
      }
    } catch (e) {
      setErr(e?.response?.data?.message || e?.message || "Failed to load current shift");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCurrentShift();
    loadMyOffers();
  }, [loadMyOffers]);

  const requireShiftId = () => {
    if (!shiftId.trim()) {
      setErr("Shift ID required (for now)");
      return false;
    }
    return true;
  };

  const callout = async () => {
    setErr("");
    setMsg("");
    setRespondMsg("");
    setCalloutResult(null);

    if (!requireShiftId()) return;

    setLoading(true);
    try {
      const res = await triggerCallout({ shiftId: shiftId.trim() });
      const data = res?.data || null;

      setCalloutResult(data);
      setMsg(`✅ Callout processed (${titleizeReason(data?.reason)})`);
    } catch (e) {
      setErr(e?.response?.data?.message || e?.message || "Callout failed");
    } finally {
      setLoading(false);
    }
  };

  const late = async ({ minutesLate, reason }) => {
    setErr("");
    setMsg("");
    setRespondMsg("");
    setCalloutResult(null);

    if (!requireShiftId()) return;

    setLoading(true);
    try {
      await runningLate({
        shiftId: shiftId.trim(),
        minutesLate,
        reason,
      });

      setMsg("✅ Running late submitted");
    } catch (e) {
      setErr(e?.response?.data?.message || e?.message || "Running late failed");
    } finally {
      setLoading(false);
    }
  };

  const onRespond = async (calloutId, response) => {
    setErr("");
    setRespondMsg("");

    if (!calloutId) {
      setErr("Missing callout offer id.");
      return;
    }

    setRespondLoadingId(String(calloutId));
    try {
      await respondToCallout(calloutId, response);

      if (response === "ACCEPTED") setRespondMsg("✅ You accepted this shift.");
      if (response === "DECLINED") setRespondMsg("✅ You declined this offer.");

      await loadMyOffers();
    } catch (e) {
      setErr(e?.response?.data?.message || e?.message || "Failed to respond");
    } finally {
      setRespondLoadingId("");
      setTimeout(() => setRespondMsg(""), 3000);
    }
  };

  const rankings = Array.isArray(calloutResult?.rankings)
    ? calloutResult.rankings
    : [];

  return (
    <>
      <NavBar />
      <div className="page">
        {/* Incoming offers — Accept / Decline for the logged-in guard */}
        <div className="card state--warn" style={{ marginBottom: 14 }}>
          <h2>Offers for you</h2>
          <div className="muted" style={{ marginBottom: 10 }}>
            Open shifts the AI ranked you for. Accept or decline here.
          </div>

          <div className="row" style={{ marginBottom: 10 }}>
            <button className="btn" onClick={loadMyOffers} disabled={offersLoading}>
              {offersLoading ? "Loading…" : "Refresh offers"}
            </button>
          </div>

          {respondMsg && <div className="success">{respondMsg}</div>}

          {!offersLoading && myOffers.length === 0 ? (
            <div className="muted">No open callout offers right now.</div>
          ) : (
            myOffers.map((o) => (
              <div
                key={o.calloutId || o.id}
                style={{
                  marginTop: 12,
                  paddingTop: 12,
                  borderTop: "1px solid rgba(0,0,0,0.08)",
                }}
              >
                <div>
                  <b>{o.location || "Open shift"}</b>
                </div>
                <div className="muted">
                  {o.shiftDate || "—"}{" "}
                  {o.shiftStart && o.shiftEnd ? `• ${o.shiftStart} → ${o.shiftEnd}` : ""}
                </div>
                <div className="muted">Reason: {titleizeReason(o.reason)}</div>

                <div className="row" style={{ marginTop: 10, gap: 8 }}>
                  <button
                    className="btn state--ok"
                    disabled={!!respondLoadingId}
                    onClick={() => onRespond(o.calloutId || o.id, "ACCEPTED")}
                  >
                    {respondLoadingId === String(o.calloutId || o.id) ? "…" : "Accept"}
                  </button>
                  <button
                    className="btn state--bad"
                    disabled={!!respondLoadingId}
                    onClick={() => onRespond(o.calloutId || o.id, "DECLINED")}
                  >
                    Decline
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="card state--bad">
          <h2>Call out of your shift</h2>

          <label className="label">
            Shift ID (auto)
            <input
              className="input"
              value={shiftId}
              onChange={(e) => setShiftId(e.target.value)}
              disabled={loading}
            />
          </label>

          <div className="row" style={{ marginTop: 12 }}>
            <button className="btn state--bad" onClick={callout} disabled={loading || !shiftId}>
              Call Out
            </button>

            <div className="stateWrap state--warn">
              <RunningLateDropdown onSubmit={late} disabled={loading || !shiftId} />
            </div>
          </div>

          <div className="row" style={{ marginTop: 10 }}>
            <button className="btn" onClick={loadCurrentShift} disabled={loading}>
              Refresh Shift
            </button>
          </div>

          {err && <div className="error">{err}</div>}
          {msg && <div className="success">{msg}</div>}

          {calloutResult && (
            <div style={{ marginTop: 16 }}>
              <div className="muted">Callout details</div>

              <div className="muted">
                <div>
                  <b>Shift:</b> {calloutResult.shiftId || shiftId}
                </div>
                <div>
                  <b>Reason:</b> {titleizeReason(calloutResult.reason)}
                </div>

                {calloutResult.status && (
                  <div>
                    <b>Status:</b>{" "}
                    <span className={statusTone(calloutResult.status)}>
                      {String(calloutResult.status)}
                    </span>
                  </div>
                )}
              </div>

              {rankings.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <div className="muted">
                    AI contacted these guards (they accept/decline on their own app — not here)
                  </div>

                  {rankings.map((r) => (
                    <div key={r.calloutId || r.guardId} style={{ marginTop: 10 }}>
                      <div>
                        <b>#{r.rank}</b>
                        {r.guardName ? ` — ${r.guardName}` : ""}
                      </div>
                      <div className="muted">{r.reason}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
