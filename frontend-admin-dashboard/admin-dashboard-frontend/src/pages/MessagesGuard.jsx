/**
 * Guard Messages view – for testing guard messaging from the admin dashboard.
 * Uses guardToken from localStorage; polls for new messages so admin messages appear.
 * Admin can pick a guard and get a token in-app (no CLI script needed).
 */
import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import GuardMessages from "../components/guard-ui/GuardMessages";
import { listGuards, getGuardViewToken } from "../services/api";

const STORAGE_KEY = "guardToken";

export default function MessagesGuard() {
  const [hasToken, setHasToken] = useState(false);
  const [guards, setGuards] = useState([]);
  const [selectedGuardId, setSelectedGuardId] = useState("");
  const [loading, setLoading] = useState(true);
  const [tokenError, setTokenError] = useState("");
  const [settingToken, setSettingToken] = useState(false);

  useEffect(() => {
    const check = () => setHasToken(Boolean(localStorage.getItem(STORAGE_KEY)));
    check();
    const interval = setInterval(check, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (hasToken) return;
    setLoading(true);
    listGuards()
      .then((res) => {
        const raw = res.data;
        const arr = Array.isArray(raw) ? raw : (raw?.data && Array.isArray(raw.data) ? raw.data : []);
        setGuards(arr);
        if (arr.length && !selectedGuardId) setSelectedGuardId(arr[0].id);
      })
      .catch(() => setGuards([]))
      .finally(() => setLoading(false));
  }, [hasToken]);

  function handleSetToken() {
    if (!selectedGuardId) return;
    setSettingToken(true);
    setTokenError("");
    getGuardViewToken(selectedGuardId)
      .then((res) => {
        const token = res.data?.token ?? res.data?.data?.token;
        const guard = res.data?.guard ?? res.data?.data?.guard;
        if (token) {
          localStorage.setItem(STORAGE_KEY, token);
          setHasToken(true);
        } else {
          setTokenError("No token in response");
        }
      })
      .catch((e) => {
        setTokenError(e?.response?.data?.message || e?.message || "Failed to get token");
      })
      .finally(() => setSettingToken(false));
  }

  if (!hasToken) {
    return (
      <div style={{ padding: 24, maxWidth: 600 }}>
        <h2 style={{ marginTop: 0 }}>Guard Messages (test view)</h2>
        <p style={{ color: "var(--muted)", marginBottom: 16 }}>
          This page shows the messaging UI <strong>as a guard would see it</strong>. Pick a guard below to view their conversations and messages.
        </p>
        <p style={{ marginBottom: 12, fontWeight: 600 }}>View as guard</p>
        {loading ? (
          <p style={{ color: "var(--muted)" }}>Loading guards…</p>
        ) : guards.length === 0 ? (
          <p style={{ color: "var(--muted)", marginBottom: 12 }}>
            No guards in the system. Create a guard first, then add them to a conversation in{" "}
            <Link to="/messages" style={{ color: "var(--primary)" }}>Admin Messages</Link> to see messages here.
          </p>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
            <select
              value={selectedGuardId}
              onChange={(e) => setSelectedGuardId(e.target.value)}
              style={{ padding: "8px 12px", borderRadius: 8, minWidth: 200 }}
            >
              {guards.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name || g.email || g.id}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="btn"
              onClick={handleSetToken}
              disabled={settingToken}
            >
              {settingToken ? "Setting…" : "Set token & view"}
            </button>
          </div>
        )}
        {tokenError && (
          <div style={{ marginBottom: 12, padding: "8px 12px", background: "rgba(239,68,68,0.15)", color: "#fca5a5", borderRadius: 8 }}>
            {tokenError}
          </div>
        )}
        <p style={{ marginBottom: 12, fontWeight: 600 }}>Why no messages?</p>
        <p style={{ color: "var(--muted)", marginBottom: 16 }}>
          The guard you choose only sees conversations they’re in. In{" "}
          <Link to="/messages" style={{ color: "var(--primary)" }}>Admin Messages</Link>, create a <strong>New group</strong> and <strong>add this guard</strong> as a participant, then send a message. It will appear here.
        </p>
        <p style={{ marginBottom: 16 }}>
          <Link to="/messages" style={{ color: "var(--primary)" }}>← Back to Admin Messages</Link>
        </p>
      </div>
    );
  }

  return (
    <div style={{ padding: "0 16px 16px" }}>
      <div style={{ marginBottom: 12, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <Link to="/messages" style={{ color: "var(--muted)", fontSize: 14 }}>← Admin Messages</Link>
        <span style={{ color: "var(--muted)", fontSize: 12 }}>| Guard view (guardToken in use)</span>
        <span style={{ color: "var(--muted)", fontSize: 12 }}>| To see admin messages: add this guard to a group in Admin Messages and send there.</span>
      </div>
      <GuardMessages />
    </div>
  );
}
