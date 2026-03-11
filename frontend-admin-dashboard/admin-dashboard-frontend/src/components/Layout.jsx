import React, { useState, useMemo, useRef, useEffect } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useNotifications } from "../context/NotificationContext";
import NotificationPreferences from "./NotificationPreferences";
import { getGeographicSites, globalSearch, getSearchHistory } from "../services/api";
import { useSessionTimeout } from "../hooks/useSessionTimeout";

export default function Layout() {
  const nav = useNavigate();

  // Session timeout: 15–60 min inactivity (default 30). Set REACT_APP_SESSION_TIMEOUT_MINUTES in .env
  useSessionTimeout({ enabled: true });
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchHistory, setSearchHistory] = useState([]);
  const searchContainerRef = useRef(null);
  const searchInputRef = useRef(null);

  useEffect(() => {
    function onKeyDown(e) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen(true);
        searchInputRef.current?.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  const { data: historyData } = useQuery({
    queryKey: ["searchHistory"],
    queryFn: async () => {
      const res = await getSearchHistory();
      return res.data?.data ?? [];
    },
    enabled: searchOpen,
  });
  useEffect(() => {
    setSearchHistory(Array.isArray(historyData) ? historyData : []);
  }, [historyData]);

  useEffect(() => {
    function handleClickOutside(e) {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target)) setSearchOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const runSearch = async () => {
    const q = searchQuery.trim();
    if (!q || searchLoading) return;
    setSearchLoading(true);
    setSearchResults([]);
    try {
      const res = await globalSearch({ q });
      const list = res.data?.data ?? [];
      setSearchResults(Array.isArray(list) ? list : []);
      setSearchOpen(true);
    } catch {
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  };

  const user = (() => {
    try {
      return JSON.parse(localStorage.getItem("adminUser") || "null");
    } catch {
      return null;
    }
  })();

  const { items, unread, markRead } = useNotifications();
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [showPreferences, setShowPreferences] = useState(false);
  const notificationList = useMemo(() => (Array.isArray(items) ? items.slice(0, 25) : []), [items]);

  // Live-updating total sites count for current tenant (refreshes every 20s)
  const { data: sitesData } = useQuery({
    queryKey: ["geographicSites"],
    queryFn: async () => {
      const res = await getGeographicSites();
      const list = res.data?.data ?? res.data ?? [];
      return Array.isArray(list) ? list : [];
    },
    refetchInterval: 20000,
    refetchIntervalInBackground: true,
  });
  const sitesCount = Array.isArray(sitesData) ? sitesData.length : 0;

  const logout = () => {
    // ✅ clear admin auth
    localStorage.removeItem("adminToken");
    localStorage.removeItem("adminUser");

    // ✅ FORCE full app reset (this is critical)
    window.location.href = "/login";
  };

  return (
    <div className="shell">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="brandPill">
          <div style={{ fontWeight: 900 }}>Scheduling</div>
          <div className="muted">Guards • Shifts • Callouts</div>
        </div>

        <NavLink
          to="/"
          end
          className={({ isActive }) => (isActive ? "navLink navLinkActive" : "navLink")}
        >
          Dashboard
        </NavLink>

        <NavLink
          to="/owner"
          className={({ isActive }) => (isActive ? "navLink navLinkActive" : "navLink")}
        >
          🏢 Owner
        </NavLink>

        <NavLink
          to="/staff"
          className={({ isActive }) => (isActive ? "navLink navLinkActive" : "navLink")}
        >
          Staff
        </NavLink>

        <NavLink
          to="/messages"
          className={({ isActive }) => (isActive ? "navLink navLinkActive" : "navLink")}
        >
          💬 Messages
        </NavLink>
        <NavLink
          to="/messages/guard"
          className={({ isActive }) => (isActive ? "navLink navLinkActive" : "navLink")}
        >
          💬 Guard view
        </NavLink>

        <NavLink
          to="/guards"
          className={({ isActive }) => (isActive ? "navLink navLinkActive" : "navLink")}
        >
          Guards
        </NavLink>

        <NavLink
          to="/shifts"
          className={({ isActive }) => (isActive ? "navLink navLinkActive" : "navLink")}
        >
          Shifts
        </NavLink>

        <NavLink
          to="/shift-swaps"
          className={({ isActive }) => (isActive ? "navLink navLinkActive" : "navLink")}
        >
          🔄 Shift Swaps
        </NavLink>

        <NavLink
          to="/callout-risk"
          className={({ isActive }) => (isActive ? "navLink navLinkActive" : "navLink")}
        >
          ⚠️ Callout Risk
        </NavLink>

        <NavLink
          to="/reports"
          className={({ isActive }) => (isActive ? "navLink navLinkActive" : "navLink")}
        >
          📊 Reports
        </NavLink>

        {user?.role === "super_admin" && (
          <NavLink
            to="/super-admin"
            className={({ isActive }) => (isActive ? "navLink navLinkActive" : "navLink")}
          >
            🏢 Super-Admin
          </NavLink>
        )}

        <NavLink
          to="/users"
          className={({ isActive }) => (isActive ? "navLink navLinkActive" : "navLink")}
        >
          Users
        </NavLink>

        <NavLink
          to="/ai-ranking"
          className={({ isActive }) => (isActive ? "navLink navLinkActive" : "navLink")}
        >
          AI Ranking
        </NavLink>

        <NavLink
          to="/policy"
          className={({ isActive }) => (isActive ? "navLink navLinkActive" : "navLink")}
        >
          Ask Policy
        </NavLink>

        <NavLink
          to="/schedule"
          className={({ isActive }) => (isActive ? "navLink navLinkActive" : "navLink")}
        >
          Schedule
        </NavLink>

        <NavLink
          to="/payroll"
          className={({ isActive }) => (isActive ? "navLink navLinkActive" : "navLink")}
        >
          Payroll
        </NavLink>

        <NavLink
          to="/command-center"
          className={({ isActive }) => (isActive ? "navLink navLinkActive" : "navLink")}
        >
          🎯 Command Center
        </NavLink>

        <NavLink
          to="/map"
          className={({ isActive }) => (isActive ? "navLink navLinkActive" : "navLink")}
        >
          🗺️ Map
        </NavLink>
        <div className="muted" style={{ padding: "6px 12px", fontSize: 13 }}>
          Sites: <strong>{sitesCount}</strong>
        </div>

        <NavLink
          to="/analytics"
          className={({ isActive }) => (isActive ? "navLink navLinkActive" : "navLink")}
        >
          📊 Analytics
        </NavLink>

        <NavLink
          to="/supervisor"
          className={({ isActive }) => (isActive ? "navLink navLinkActive" : "navLink")}
        >
          AI AGENT 24
        </NavLink>

        <NavLink
          to="/reputation"
          className={({ isActive }) => (isActive ? "navLink navLinkActive" : "navLink")}
        >
          Guard Reputation
        </NavLink>

        <NavLink
          to="/incidents"
          className={({ isActive }) => (isActive ? "navLink navLinkActive" : "navLink")}
        >
          Incidents
        </NavLink>

        <NavLink
          to="/inspections"
          className={({ isActive }) => (isActive ? "navLink navLinkActive" : "navLink")}
        >
          Inspections
        </NavLink>

        <NavLink
          to="/announcements"
          className={({ isActive }) => (isActive ? "navLink navLinkActive" : "navLink")}
        >
          📢 Announcements
        </NavLink>

        <NavLink
          to="/account"
          className={({ isActive }) => (isActive ? "navLink navLinkActive" : "navLink")}
        >
          🔐 Account
        </NavLink>

        <div style={{ marginTop: 14 }} className="muted">
          Backend: Admin API
        </div>
        <div className="muted" style={{ marginTop: 10 }}>
          Tip: Use Guards to manage staff, Shifts to assign coverage.
        </div>
      </aside>

      {/* Main */}
      <div style={{ padding: 14 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 14,
          }}
        >
          <div>
            <div style={{ fontWeight: 900 }}>ABE Admin</div>
            <div className="muted">Operations Console</div>
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            {/* 🔍 Global Search (Advanced Search #31) */}
            <div ref={searchContainerRef} style={{ position: "relative" }}>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <input
                  ref={searchInputRef}
                  type="text"
                  placeholder="Search guards, shifts, sites… (⌘K)"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onFocus={() => setSearchOpen(true)}
                  onKeyDown={(e) => e.key === "Enter" && runSearch()}
                  style={{
                    width: 260,
                    padding: "8px 12px",
                    borderRadius: 10,
                    border: "1px solid #e2e8f0",
                    fontSize: 14,
                  }}
                />
                <button
                  type="button"
                  onClick={runSearch}
                  disabled={searchLoading || !searchQuery.trim()}
                  style={{
                    padding: "8px 14px",
                    borderRadius: 10,
                    border: "1px solid #0ea5e9",
                    background: "#0ea5e9",
                    color: "white",
                    cursor: searchLoading ? "wait" : "pointer",
                    fontSize: 13,
                    fontWeight: 600,
                  }}
                >
                  {searchLoading ? "…" : "Search"}
                </button>
              </div>
              {searchOpen && (
                <div
                  style={{
                    position: "absolute",
                    left: 0,
                    top: "100%",
                    marginTop: 6,
                    width: 360,
                    maxHeight: 400,
                    overflow: "auto",
                    borderRadius: 12,
                    border: "1px solid #e2e8f0",
                    background: "white",
                    boxShadow: "0 10px 40px rgba(0,0,0,0.12)",
                    zIndex: 100,
                  }}
                >
                  {searchResults.length > 0 ? (
                    <div style={{ padding: 8 }}>
                      {searchResults.map((r, i) => (
                        <button
                          key={r.id || i}
                          type="button"
                          onClick={() => {
                            if (r.href) nav(r.href);
                            setSearchOpen(false);
                            setSearchQuery("");
                            setSearchResults([]);
                          }}
                          style={{
                            width: "100%",
                            textAlign: "left",
                            padding: "10px 12px",
                            borderRadius: 8,
                            border: 0,
                            background: "transparent",
                            cursor: "pointer",
                            fontSize: 13,
                            marginBottom: 4,
                          }}
                        >
                          <span style={{ fontWeight: 600, textTransform: "capitalize", color: "#0ea5e9" }}>{r.entityType}</span>
                          {" — "}
                          {r.title}
                          {r.snippet && <div style={{ marginTop: 4, fontSize: 12, color: "#64748b" }}>{r.snippet}</div>}
                        </button>
                      ))}
                    </div>
                  ) : searchHistory.length > 0 && !searchQuery.trim() ? (
                    <div style={{ padding: 12 }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: "#64748b", marginBottom: 8 }}>Recent searches</div>
                      {searchHistory.slice(0, 5).map((h, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => {
                            setSearchQuery(h.query || "");
                            setSearchOpen(false);
                          }}
                          style={{
                            width: "100%",
                            textAlign: "left",
                            padding: "8px 10px",
                            borderRadius: 6,
                            border: 0,
                            background: "#f8fafc",
                            cursor: "pointer",
                            fontSize: 13,
                            marginBottom: 4,
                          }}
                        >
                          {h.query}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div style={{ padding: 14, color: "#64748b", fontSize: 13 }}>
                      Type a query and press Enter or click Search. Try "Bob" or "Downtown".
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* ⚙️ Settings Button */}
            <button
              type="button"
              className="btn"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setShowPreferences(true);
              }}
              style={{
                padding: "8px 12px",
                borderRadius: 12,
                cursor: "pointer",
                fontSize: 14,
                fontWeight: 600,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
              }}
              title="Notification Preferences"
            >
              ⚙️ Settings
            </button>

            {/* Account – password & MFA */}
            <button
              type="button"
              className="btn"
              onClick={() => nav("/account")}
              style={{
                padding: "8px 14px",
                borderRadius: 12,
                cursor: "pointer",
                fontSize: 14,
                fontWeight: 600,
              }}
              title="Account & Security (password, MFA)"
            >
              Account
            </button>

            {/* 🔔 Notifications Bell */}
            <div style={{ position: "relative" }}>
              <button
                type="button"
                className="btn"
                onClick={() => setNotificationOpen((v) => !v)}
                aria-label="Notifications"
                style={{ position: "relative", borderRadius: 12, padding: "8px 10px" }}
              >
                🔔
                {unread > 0 && (
                  <span
                    style={{
                      position: "absolute",
                      top: -6,
                      right: -6,
                      fontSize: 11,
                      padding: "2px 6px",
                      borderRadius: 999,
                      background: "#ef4444",
                      color: "white",
                      lineHeight: 1.4,
                      minWidth: 18,
                      textAlign: "center",
                    }}
                  >
                    {unread}
                  </span>
                )}
              </button>

              {notificationOpen && (
                <div
                  style={{
                    position: "absolute",
                    right: 0,
                    top: "110%",
                    width: 380,
                    maxHeight: 420,
                    overflow: "hidden",
                    borderRadius: 14,
                    border: "1px solid rgba(148,163,184,0.22)",
                    background: "rgba(15,23,42,0.98)",
                    boxShadow: "0 18px 50px rgba(0,0,0,0.35)",
                    zIndex: 99,
                  }}
                  role="dialog"
                  aria-label="Notifications list"
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: 12,
                      borderBottom: "1px solid rgba(148,163,184,0.16)",
                      color: "rgba(255,255,255,0.9)",
                      fontWeight: 700,
                    }}
                  >
                    <span>Notifications</span>
                    <button
                      className="btn"
                      style={{ padding: "6px 10px", borderRadius: 10, fontSize: 12 }}
                      onClick={() => setNotificationOpen(false)}
                    >
                      Close
                    </button>
                  </div>

                  {notificationList.length === 0 ? (
                    <div style={{ padding: 14, color: "rgba(255,255,255,0.75)" }}>
                      No notifications yet.
                    </div>
                  ) : (
                    <div style={{ maxHeight: 360, overflow: "auto" }}>
                      {notificationList.map((n) => (
                        <div
                          key={n.id}
                          style={{
                            width: "100%",
                            textAlign: "left",
                            padding: 12,
                            border: 0,
                            background: n.read ? "transparent" : "rgba(56,189,248,0.08)",
                            borderBottom: "1px solid rgba(148,163,184,0.12)",
                            opacity: n.read ? 0.88 : 1,
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "flex-start",
                            gap: 8,
                          }}
                        >
                          <div style={{ flex: 1 }}>
                            <div
                              style={{
                                color: "rgba(255,255,255,0.92)",
                                fontWeight: 700,
                                fontSize: 13,
                              }}
                            >
                              {n.title}
                            </div>
                            <div
                              style={{
                                marginTop: 4,
                                color: "rgba(255,255,255,0.75)",
                                fontSize: 12,
                                lineHeight: 1.3,
                              }}
                            >
                              {n.message}
                            </div>
                            <div
                              style={{
                                marginTop: 6,
                                color: "rgba(255,255,255,0.55)",
                                fontSize: 11,
                              }}
                            >
                              {n.createdAt ? new Date(n.createdAt).toLocaleString() : ""}
                            </div>
                          </div>
                          <button
                            type="button"
                            className="btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              markRead(n.id);
                            }}
                            style={{
                              padding: "4px 8px",
                              borderRadius: 6,
                              fontSize: 10,
                              minWidth: "auto",
                              flexShrink: 0,
                            }}
                            title="Mark as read"
                          >
                            ✓
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {user?.email ? (
              <span className="badge">
                <span className="dot" />
                {user.email}
              </span>
            ) : null}

            <button className="btn" onClick={logout}>
              Logout
            </button>
          </div>
        </div>

        {/* ✅ This renders Dashboard / Guards / Shifts / Users */}
        <Outlet />
      </div>

      {/* Notification Preferences Modal */}
      {showPreferences && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0, 0, 0, 0.7)",
            zIndex: 10000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowPreferences(false);
            }
          }}
        >
          <div
            style={{
              maxWidth: 600,
              width: "100%",
              maxHeight: "90vh",
              overflow: "auto",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <NotificationPreferences
              onClose={() => {
                console.log("🔍 Closing preferences modal");
                setShowPreferences(false);
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
