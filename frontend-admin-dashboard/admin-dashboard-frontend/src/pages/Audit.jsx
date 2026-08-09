import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Card from "../components/Card";
import { listAuditEvents, exportAuditEvents } from "../services/api";

function todayISODate() {
  return new Date().toISOString().slice(0, 10);
}

function daysAgoISODate(n) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

function fmtWhen(v) {
  if (!v) return "—";
  try {
    return new Date(v).toLocaleString();
  } catch {
    return String(v);
  }
}

export default function Audit() {
  const [from, setFrom] = useState(daysAgoISODate(30));
  const [to, setTo] = useState(todayISODate());
  const [action, setAction] = useState("");
  const [entityType, setEntityType] = useState("");
  const [exporting, setExporting] = useState(false);
  const [exportErr, setExportErr] = useState("");

  const params = useMemo(
    () => ({
      from: from || undefined,
      to: to || undefined,
      action: action.trim() || undefined,
      entityType: entityType.trim() || undefined,
      limit: 200,
    }),
    [from, to, action, entityType]
  );

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["auditEvents", params],
    queryFn: async () => {
      const res = await listAuditEvents(params);
      return res.data;
    },
    staleTime: 30 * 1000,
    refetchOnWindowFocus: false,
  });

  const rows = Array.isArray(data?.data) ? data.data : [];

  async function onExport() {
    setExporting(true);
    setExportErr("");
    try {
      const res = await exportAuditEvents({
        from: from || undefined,
        to: to || undefined,
        action: action.trim() || undefined,
        entityType: entityType.trim() || undefined,
      });
      const blob = new Blob([res.data], { type: "text/csv;charset=utf-8" });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `audit-events-${from || "all"}-to-${to || "all"}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      setExportErr(e?.response?.data?.message || e.message || "Export failed");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <Card
        title="Audit log"
        subtitle="Who changed what — swaps, pending-accept, callouts, shifts, guards, consent"
        right={
          <button
            type="button"
            className="btn btnPrimary"
            onClick={onExport}
            disabled={exporting}
          >
            {exporting ? "Exporting…" : "Export CSV"}
          </button>
        }
      >
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 10,
            alignItems: "flex-end",
            marginBottom: 14,
          }}
        >
          <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
            From
            <input
              type="date"
              className="input"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </label>
          <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
            To
            <input
              type="date"
              className="input"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </label>
          <label style={{ display: "grid", gap: 4, fontSize: 13, minWidth: 160 }}>
            Action
            <input
              type="text"
              className="input"
              placeholder="e.g. shift.update"
              value={action}
              onChange={(e) => setAction(e.target.value)}
            />
          </label>
          <label style={{ display: "grid", gap: 4, fontSize: 13, minWidth: 140 }}>
            Entity
            <input
              type="text"
              className="input"
              placeholder="shift | guard"
              value={entityType}
              onChange={(e) => setEntityType(e.target.value)}
            />
          </label>
          <button type="button" className="btn" onClick={() => refetch()} disabled={isFetching}>
            {isFetching ? "Refreshing…" : "Refresh"}
          </button>
        </div>

        {exportErr ? (
          <div style={{ color: "#f87171", marginBottom: 10, fontSize: 14 }}>{exportErr}</div>
        ) : null}
        {isError ? (
          <div style={{ color: "#f87171", marginBottom: 10, fontSize: 14 }}>
            {error?.response?.data?.message || error?.message || "Failed to load audit events"}
          </div>
        ) : null}

        {isLoading ? (
          <div className="muted">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="muted">No audit events in this range yet.</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: "left", borderBottom: "1px solid rgba(255,255,255,0.15)" }}>
                  <th style={{ padding: "8px 6px" }}>When</th>
                  <th style={{ padding: "8px 6px" }}>Actor</th>
                  <th style={{ padding: "8px 6px" }}>Action</th>
                  <th style={{ padding: "8px 6px" }}>Entity</th>
                  <th style={{ padding: "8px 6px" }}>Summary</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.id}
                    style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}
                  >
                    <td style={{ padding: "8px 6px", whiteSpace: "nowrap" }}>
                      {fmtWhen(r.created_at || r.createdAt)}
                    </td>
                    <td style={{ padding: "8px 6px", whiteSpace: "nowrap" }}>
                      {r.actor_type || r.actorType || "—"}
                      {r.actor_id || r.actorId
                        ? ` · ${String(r.actor_id || r.actorId).slice(0, 8)}`
                        : ""}
                    </td>
                    <td style={{ padding: "8px 6px", fontFamily: "ui-monospace, monospace" }}>
                      {r.action}
                    </td>
                    <td style={{ padding: "8px 6px", whiteSpace: "nowrap" }}>
                      {r.entity_type || r.entityType || "—"}
                      {r.entity_id || r.entityId
                        ? ` · ${String(r.entity_id || r.entityId).slice(0, 8)}`
                        : ""}
                    </td>
                    <td style={{ padding: "8px 6px" }}>{r.summary || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="muted" style={{ marginTop: 10, fontSize: 12 }}>
              Showing {rows.length} event{rows.length === 1 ? "" : "s"} (newest first). CSV export
              uses the same filters.
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
