// src/pages/Callouts.jsx
import React, { useEffect, useState } from "react";
import NavBar from "../components/NavBar";
import RunningLateDropdown from "../components/RunningLateDropdown";
import {
  listShifts,
  triggerCallout,
  runningLate,
  respondToCallout,
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

/* ===== STATE → COLOR MAPPING ===== */

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

  const [acceptLoadingId, setAcceptLoadingId] = useState("");
  const [acceptMsg, setAcceptMsg] = useState("");

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
  }, []);

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
    setAcceptMsg("");
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
    setAcceptMsg("");
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
    setAcceptMsg("");

    if (!calloutId) {
      setErr("Missing calloutId for this guard offer.");
      return;
    }

    setAcceptLoadingId(String(calloutId));
    try {
      const res = await respondToCallout(calloutId, response);
      const data = res?.data || null;

      if (response === "ACCEPTED") setAcceptMsg("✅ Accepted.");
      if (response === "DECLINED") setAcceptMsg("✅ Declined.");

      if (data?.shiftId) {
        setCalloutResult((prev) =>
          prev
            ? {
                ...prev,
                status: data?.status ?? prev.status,
                assignedGuardId: data?.assignedGuardId ?? prev.assignedGuardId,
              }
            : prev
        );
      }
    } catch (e) {
      setErr(e?.response?.data?.message || e?.message || "Failed to respond");
    } finally {
      setAcceptLoadingId("");
      setTimeout(() => setAcceptMsg(""), 2500);
    }
  };

  const rankings = Array.isArray(calloutResult?.rankings)
    ? calloutResult.rankings
    : [];

  return (
    <>
      <NavBar />
      <div className="page">
        <div className="card state--bad">
          <h2>Callouts</h2>

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
            {/* 🔴 Callout */}
            <button className="btn state--bad" onClick={callout} disabled={loading || !shiftId}>
              Call Out
            </button>

            {/* 🟠 Running Late */}
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
          {acceptMsg && <div className="success">{acceptMsg}</div>}

          {calloutResult && (
            <div style={{ marginTop: 16 }}>
              <div className="muted">Callout details</div>

              <div className="muted">
                <div><b>Shift:</b> {calloutResult.shiftId || shiftId}</div>
                <div><b>Reason:</b> {titleizeReason(calloutResult.reason)}</div>

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
                  <div className="muted">Ranked coverage candidates</div>

                  {rankings.map((r) => (
                    <div key={r.calloutId || r.guardId} style={{ marginTop: 10 }}>
                      <div><b>#{r.rank}</b> — {r.guardId}</div>
                      <div className="muted">{r.reason}</div>

                      <div className="row" style={{ marginTop: 8 }}>
                        <button
                          className="btn state--ok"
                          disabled={acceptLoadingId}
                          onClick={() => onRespond(r.calloutId, "ACCEPTED")}
                        >
                          Accept
                        </button>

                        <button
                          className="btn state--bad"
                          disabled={acceptLoadingId}
                          onClick={() => onRespond(r.calloutId, "DECLINED")}
                        >
                          Decline
                        </button>
                      </div>
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
