// src/pages/Shifts.jsx
import React, { useEffect, useMemo, useState } from "react";
import NavBar from "../components/NavBar";
import { listShifts, acceptShift } from "../services/guardApi";
import ShiftAlerts from "../components/ShiftAlerts";
import "./shifts.css";

/* ================= helpers ================= */

function safeDate(v) {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function fmtDT(v) {
  const d = safeDate(v);
  return d ? d.toLocaleString() : String(v ?? "—");
}

function normalizeShift(raw) {
  const id = raw?.id || raw?.shift_id || raw?.shiftId || null;

  const site =
    raw?.site_name ||
    raw?.site ||
    raw?.siteName ||
    raw?.location ||
    raw?.post_name ||
    "Site";

  const start =
    raw?.start_time ||
    raw?.startTime ||
    raw?.start_at ||
    raw?.starts_at ||
    raw?.start ||
    null;

  const end =
    raw?.end_time ||
    raw?.endTime ||
    raw?.end_at ||
    raw?.ends_at ||
    raw?.end ||
    null;

  const status = raw?.status || raw?.state || raw?.shift_status || "";

  // If backend gives explicit availability flags, use them.
  // Otherwise infer from status text (default to true if unknown).
  const isAvailable =
    raw?.is_available ??
    raw?.available ??
    raw?.isAvailable ??
    (String(status).toLowerCase()
      ? String(status).toLowerCase().includes("open")
      : true);

  return { id, site, start, end, status, isAvailable, raw };
}

/* ================= page ================= */

export default function Shifts() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);

  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  const load = async () => {
    setErr("");
    setMsg("");
    setLoading(true);

    try {
      const res = await listShifts();

      const rows = Array.isArray(res?.data)
        ? res.data
        : res?.data?.shifts || res?.data || [];

      const normalized = (Array.isArray(rows) ? rows : []).map(normalizeShift);

      normalized.sort((a, b) => {
        if (a.isAvailable !== b.isAvailable) return a.isAvailable ? -1 : 1;
        const aStart = safeDate(a.start)?.getTime() || 0;
        const bStart = safeDate(b.start)?.getTime() || 0;
        return aStart - bStart;
      });

      setItems(normalized);
    } catch (e) {
      setErr(e?.response?.data?.message || e?.message || "Failed to load shifts");
    } finally {
      setLoading(false);
    }
  };

  const accept = async (shiftId) => {
    setErr("");
    setMsg("");

    if (!shiftId) {
      setErr("Missing shift id");
      return;
    }

    setLoading(true);
    try {
      // Keep logs minimal but useful
      console.log("✅ ACCEPT CLICKED shiftId:", shiftId);

      await acceptShift(shiftId);

      setMsg("✅ Shift accepted");
      await load();
    } catch (e) {
      setErr(e?.response?.data?.message || e?.message || "Failed to accept shift");
    } finally {
      setLoading(false);
      window.setTimeout(() => setMsg(""), 2500);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const countText = useMemo(() => {
    if (!items.length) return "";
    const avail = items.filter((x) => x.isAvailable).length;
    return `(${avail} available / ${items.length} total)`;
  }, [items]);

  return (
    <>
      <NavBar />
      <div className="page">
        <div className="card">
          <h2>Available Shifts {countText}</h2>

          <div className="row" style={{ gap: 8 }}>
            <button className="btnPrimary" onClick={load} disabled={loading}>
              {loading ? "Loading..." : "Refresh"}
            </button>
          </div>

          {err ? <div className="error">{err}</div> : null}
          {msg ? <div className="success">{msg}</div> : null}

          <div style={{ marginTop: 12 }}>
            {items.length ? (
              items.map((s) => {
                const rowClass = `listRow ${
                  s.isAvailable ? "isAvailable" : "notAvailable"
                }`;

                return (
                  <div key={s.id || `${s.site}-${String(s.start)}`} className={rowClass}>
                    <div style={{ flex: 1 }}>
                      <div>
                        <b>{s.site}</b>
                      </div>

                      <div className="muted">
                        {fmtDT(s.start)} → {fmtDT(s.end)}
                        {s.status ? ` • ${String(s.status)}` : ""}
                      </div>
                      
                      {/* Weather, Traffic & Transit Alerts */}
                      {s.id && (
                        <div style={{ marginTop: 12 }}>
                          <ShiftAlerts shiftId={s.id} shift={s.raw} />
                        </div>
                      )}
                    </div>

                    <button
                      type="button" // 🔑 CRITICAL: never submit/navigate
                      className={`btn ${s.isAvailable ? "state--ok" : ""}`}
                      onClick={(e) => {
                        e.preventDefault(); // 🔑 STOP navigation
                        e.stopPropagation();
                        accept(s.id);
                      }}
                      disabled={loading || !s.isAvailable}
                      title={!s.isAvailable ? "Not available" : "Accept this shift"}
                    >
                      Accept
                    </button>
                  </div>
                );
              })
            ) : (
              <div className="muted">
                {loading ? "Loading shifts..." : "No shifts loaded yet."}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
