import React, { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Card from "./Card";
import {
  getPendingAccepts,
  overridePendingAccept,
  listGuards,
} from "../services/api";
import { getAdminInfo } from "../utils/access";

function isAdminOrSupervisor() {
  const role = String(getAdminInfo()?.role || "").toLowerCase();
  return role === "super_admin" || role === "admin" || role === "supervisor";
}

function formatCountdown(seconds) {
  if (seconds == null) return "—";
  const s = Math.max(0, Number(seconds) || 0);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

/**
 * Admin/supervisor panel: override window after a guard accepts an OPEN shift.
 */
export default function PendingAcceptOverrides() {
  const qc = useQueryClient();
  const canOverride = isAdminOrSupervisor();
  const [tick, setTick] = useState(0);
  const [busyId, setBusyId] = useState(null);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({ guardId: "", reason: "" });
  const [err, setErr] = useState("");

  const q = useQuery({
    queryKey: ["pendingAccepts"],
    queryFn: async () => {
      const res = await getPendingAccepts();
      return res.data;
    },
    enabled: canOverride,
    refetchInterval: canOverride ? 5000 : false,
    refetchOnWindowFocus: true,
    staleTime: 0,
  });

  const qGuards = useQuery({
    queryKey: ["guards-for-override"],
    queryFn: async () => {
      const res = await listGuards();
      const data = res.data?.data || res.data || [];
      return Array.isArray(data) ? data : [];
    },
    enabled: canOverride && Boolean(modal),
  });

  useEffect(() => {
    if (!canOverride) return undefined;
    const t = setInterval(() => setTick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, [canOverride]);

  const rows = useMemo(() => {
    const list = Array.isArray(q.data?.data) ? q.data.data : [];
    return list.map((r) => {
      let seconds = r.secondsRemaining;
      if (r.accept_pending_until) {
        seconds = Math.max(
          0,
          Math.floor((new Date(r.accept_pending_until) - Date.now()) / 1000)
        );
      }
      return { ...r, secondsRemaining: seconds };
    });
  }, [q.data, tick]);

  if (!canOverride) return null;

  async function runAction(shiftId, action, extra = {}) {
    setBusyId(shiftId);
    setErr("");
    try {
      await overridePendingAccept(shiftId, { action, ...extra });
      setModal(null);
      await qc.invalidateQueries({ queryKey: ["pendingAccepts"] });
      await qc.invalidateQueries({ queryKey: ["openShifts"] });
      await qc.invalidateQueries({ queryKey: ["liveCallouts"] });
    } catch (e) {
      setErr(e?.response?.data?.message || e?.message || "Override failed");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Card
      title="Pending accepts — override window"
      subtitle={
        q.isLoading ? (
          "Loading…"
        ) : (
          <>
            {rows.length} awaiting review
            {q.data?.windowMinutes ? ` · ~${q.data.windowMinutes} min window` : ""}
          </>
        )
      }
    >
      {err ? (
        <div style={{ color: "#f87171", marginBottom: 8, fontSize: 13 }}>{err}</div>
      ) : null}

      {q.isLoading ? (
        <div style={{ opacity: 0.75 }}>Loading…</div>
      ) : rows.length === 0 ? (
        <div style={{ opacity: 0.75 }}>No pending accepts</div>
      ) : (
        <ul className="list">
          {rows.map((r) => (
            <li key={r.id} style={{ marginBottom: 10 }}>
              <b>{r.pending_guard_name || "Guard"}</b> accepted{" "}
              <b>{r.location || "shift"}</b>
              <div className="muted">
                {r.shift_date || ""} {r.shift_start || ""}–{r.shift_end || ""} ·{" "}
                <span className="dashboardNum">{formatCountdown(r.secondsRemaining)}</span> left
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                <button
                  type="button"
                  className="btn btnPrimary"
                  disabled={busyId === r.id}
                  onClick={() => runAction(r.id, "confirm")}
                >
                  Confirm
                </button>
                <button
                  type="button"
                  className="btn"
                  disabled={busyId === r.id}
                  onClick={() => {
                    setForm({ guardId: "", reason: "" });
                    setModal(r);
                  }}
                >
                  Reassign
                </button>
                <button
                  type="button"
                  className="btn"
                  disabled={busyId === r.id}
                  onClick={() =>
                    runAction(r.id, "reject", {
                      reason: "Rejected by admin/supervisor",
                    })
                  }
                >
                  Reject
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {modal ? (
        <div
          style={{
            marginTop: 12,
            padding: 12,
            borderRadius: 10,
            border: "1px solid rgba(148,163,184,0.2)",
            background: "rgba(0,0,0,0.2)",
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 8 }}>
            Reassign {modal.location || "shift"}
          </div>
          <select
            value={form.guardId}
            onChange={(e) => setForm({ ...form, guardId: e.target.value })}
            style={{ width: "100%", marginBottom: 8, padding: 8 }}
          >
            <option value="">Select guard…</option>
            {(qGuards.data || []).map((g) => (
              <option key={g.id} value={g.id}>
                {g.name || g.email || g.id}
              </option>
            ))}
          </select>
          <textarea
            value={form.reason}
            onChange={(e) => setForm({ ...form, reason: e.target.value })}
            placeholder="Reason (optional)"
            rows={2}
            style={{ width: "100%", marginBottom: 8, padding: 8 }}
          />
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="btn" onClick={() => setModal(null)}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btnPrimary"
              disabled={!form.guardId || busyId === modal.id}
              onClick={() =>
                runAction(modal.id, "reassign", {
                  guardId: form.guardId,
                  reason: form.reason || "Reassigned by admin/supervisor",
                })
              }
            >
              Assign & close
            </button>
          </div>
        </div>
      ) : null}
    </Card>
  );
}
