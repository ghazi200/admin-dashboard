import React, { useMemo, useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useNotifications } from "../context/NotificationContext";
import { fetchSmartNotifications } from "../services/notifications";
import NotificationPreferences from "./NotificationPreferences";
import socketManager from "../realtime/socketManager";

export default function Navbar({ onMenu }) {
  const nav = useNavigate();
  const loc = useLocation();
  const token = localStorage.getItem("adminToken");
  const isLogin = loc.pathname === "/login";

  const { items, unread, markRead } = useNotifications();
  const [open, setOpen] = useState(false);
  const [smartMode, setSmartMode] = useState(true);
  const [smartData, setSmartData] = useState(null);
  const [loadingSmart, setLoadingSmart] = useState(false);
  const [showPreferences, setShowPreferences] = useState(false);

  // Debug log to verify component renders
  useEffect(() => {
    console.log("🔍 Navbar component rendered, isLogin:", isLogin, "showPreferences state:", showPreferences);
    console.log("🔍 Navbar token exists:", !!token);
    console.log("🔍 Navbar location pathname:", loc.pathname);
  }, [showPreferences, isLogin, token, loc.pathname]);

  const adminInfo = (() => {
    try {
      const raw = localStorage.getItem("adminInfo");
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  })();

  const list = useMemo(() => (Array.isArray(items) ? items.slice(0, 25) : []), [items]);

  // Load smart notifications when dropdown opens
  useEffect(() => {
    if (open && smartMode) {
      setLoadingSmart(true);
      fetchSmartNotifications({ groupBy: "priority", limit: 50 })
        .then((res) => {
          setSmartData(res.data);
        })
        .catch((err) => {
          console.warn("Failed to load smart notifications:", err);
          setSmartMode(false); // Fall back to regular mode
        })
        .finally(() => {
          setLoadingSmart(false);
        });
    }
  }, [open, smartMode]);

  // Get priority color
  const getPriorityColor = (priority) => {
    switch (priority) {
      case "CRITICAL":
        return "#ef4444";
      case "HIGH":
        return "#f59e0b";
      case "MEDIUM":
        return "#3b82f6";
      case "LOW":
        return "#6b7280";
      default:
        return "#6b7280";
    }
  };

  // Get category icon
  const getCategoryIcon = (category) => {
    switch (category) {
      case "COVERAGE":
        return "🛡️";
      case "INCIDENT":
        return "⚠️";
      case "PERSONNEL":
        return "👤";
      case "COMPLIANCE":
        return "✅";
      case "AI_INSIGHTS":
        return "🤖";
      case "REPORTS":
        return "📊";
      default:
        return "📢";
    }
  };

  // Handle quick action
  const handleQuickAction = (action, notification) => {
    markRead(notification.id);
    // Navigate based on action
    if (action.action === "view") {
      if (action.entityType === "shift") {
        nav(`/shifts`);
      } else if (action.entityType === "callout") {
        nav(`/callouts`);
      } else if (action.entityType === "incident") {
        nav(`/incidents`);
      }
    } else if (action.action === "assign") {
      nav(`/shifts`);
    } else if (action.action === "find_replacement") {
      nav(`/callouts`);
    } else if (action.action === "acknowledge") {
      nav(`/incidents`);
    }
    setOpen(false);
  };

  function logout() {
    socketManager.disconnect();
    localStorage.removeItem("adminToken");
    localStorage.removeItem("adminInfo");
    nav("/login", { replace: true });
  }

  // Render notification with smart features
  function renderNotification(n) {
    const priority = n.priority || "MEDIUM";
    const category = n.category || "GENERAL";
    const quickActions = n.quickActions || [];
    const aiInsights = n.aiInsights;

    return (
      <div
        key={n.id}
        style={{
          ...s.item,
          ...(n.read ? s.itemRead : s.itemUnread),
          borderLeft: `3px solid ${getPriorityColor(priority)}`,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <span style={{ fontSize: 14 }}>{getCategoryIcon(category)}</span>
              <div style={s.itemTitle}>{n.title}</div>
              {priority === "CRITICAL" && (
                <span style={{ fontSize: 10, color: "#ef4444", fontWeight: 700 }}>CRITICAL</span>
              )}
              {priority === "HIGH" && (
                <span style={{ fontSize: 10, color: "#f59e0b", fontWeight: 700 }}>HIGH</span>
              )}
            </div>
            <div style={s.itemMsg}>{n.message}</div>
            {aiInsights?.summary && (
              <div style={{ ...s.itemMsg, fontStyle: "italic", color: "#a78bfa", marginTop: 4 }}>
                💡 {aiInsights.summary}
              </div>
            )}
            {aiInsights?.suggestedAction && (
              <div style={{ ...s.itemMsg, color: "#10b981", marginTop: 4, fontSize: 11 }}>
                → {aiInsights.suggestedAction}
              </div>
            )}
            <div style={s.itemTime}>
              {n.createdAt ? new Date(n.createdAt).toLocaleString() : ""}
            </div>
          </div>
          <button
            className="btn"
            style={{ ...s.smallBtn, padding: "4px 8px", fontSize: 10 }}
            onClick={() => markRead(n.id)}
          >
            ✓
          </button>
        </div>
        {quickActions.length > 0 && (
          <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
            {quickActions.map((action, idx) => (
              <button
                key={idx}
                className="btn"
                style={{
                  ...s.smallBtn,
                  padding: "4px 10px",
                  fontSize: 11,
                  background: "rgba(59,130,246,0.2)",
                  border: "1px solid rgba(59,130,246,0.3)",
                  color: "#60a5fa",
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  handleQuickAction(action, n);
                }}
              >
                {action.label}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <header style={s.wrap}>
      <div style={s.left}>
        {!isLogin && (
          <button className="btn" style={s.menuBtn} onClick={onMenu} aria-label="Open menu">
            ☰
          </button>
        )}

        <div style={s.brandWrap}>
          <div style={s.brand}>ABE Admin</div>
          <div style={s.crumb}>{isLogin ? "Sign in" : "Operations Console"}</div>
        </div>
      </div>

      {!isLogin && (
        <div style={{ ...s.right, border: "2px solid red", padding: "4px" }}>
          {/* ⚙️ Settings Button - RED TEST BUTTON - MUST BE VISIBLE */}
          <div
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              console.log("⚙️⚙️⚙️ SETTINGS BUTTON CLICKED!");
              alert("Settings button clicked!");
              setShowPreferences(true);
            }}
            style={{
              padding: "14px 22px",
              borderRadius: 12,
              background: "#ef4444",
              border: "5px solid #ffffff",
              color: "#ffffff",
              cursor: "pointer",
              marginRight: 12,
              fontSize: 20,
              fontWeight: 900,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              minWidth: "160px",
              height: "55px",
              textAlign: "center",
              boxShadow: "0 8px 24px rgba(239,68,68,1)",
              zIndex: 10000,
              position: "relative",
            }}
            title="⚙️ Notification Preferences - CLICK ME!"
          >
            ⚙️ SETTINGS
          </div>
          
          {/* 🔔 Notifications */}
          <div style={s.bellWrap}>
            <button
              type="button"
              className="btn"
              style={s.bellBtn}
              onClick={() => setOpen((v) => !v)}
              aria-label="Notifications"
            >
              🔔
              {unread > 0 && <span style={s.bellCount}>{unread}</span>}
            </button>

            {open && (
              <div style={s.dropdown} role="dialog" aria-label="Notifications list">
                <div style={s.dropdownHeader}>
                  <span style={{ fontSize: 14, fontWeight: 700, flexShrink: 0 }}>🔔 Notifications</span>
                  <div style={{ 
                    display: "flex", 
                    gap: 6, 
                    alignItems: "center", 
                    flexWrap: "nowrap", 
                    justifyContent: "flex-end",
                    flex: 1,
                    minWidth: 0,
                  }}>
                    {/* Settings Button */}
                    <div
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        console.log("⚙️ Settings clicked!");
                        setShowPreferences(true);
                      }}
                      style={{
                        padding: "6px 10px",
                        fontSize: 12,
                        fontWeight: 700,
                        borderRadius: 6,
                        background: "#3b82f6",
                        border: "1px solid #60a5fa",
                        color: "#ffffff",
                        cursor: "pointer",
                        whiteSpace: "nowrap",
                        textAlign: "center",
                        boxShadow: "0 1px 4px rgba(59,130,246,0.3)",
                        flexShrink: 0,
                        margin: 0,
                        lineHeight: 1.2,
                      }}
                      title="Notification Preferences"
                    >
                      ⚙️
                    </div>
                    <button
                      type="button"
                      className="btn"
                      style={{ ...s.smallBtn, fontSize: 11 }}
                      onClick={() => setSmartMode(!smartMode)}
                    >
                      {smartMode ? "📊 Smart" : "📋 List"}
                    </button>
                    <button
                      type="button"
                      className="btn"
                      style={s.smallBtn}
                      onClick={() => setOpen(false)}
                    >
                      Close
                    </button>
                  </div>
                </div>

                {loadingSmart ? (
                  <div style={s.empty}>Loading smart notifications...</div>
                ) : smartMode && smartData?.grouped ? (
                  <div style={s.items}>
                    {/* Critical */}
                    {smartData.grouped.critical?.length > 0 && (
                      <div style={s.group}>
                        <div style={s.groupHeader}>
                          <span style={{ color: "#ef4444", fontWeight: 700 }}>🚨 Critical</span>
                          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>
                            {smartData.grouped.critical.length}
                          </span>
                        </div>
                        {smartData.grouped.critical.map((n) => renderNotification(n))}
                      </div>
                    )}

                    {/* High Priority */}
                    {smartData.grouped.high?.length > 0 && (
                      <div style={s.group}>
                        <div style={s.groupHeader}>
                          <span style={{ color: "#f59e0b", fontWeight: 700 }}>⚠️ High Priority</span>
                          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>
                            {smartData.grouped.high.length}
                          </span>
                        </div>
                        {smartData.grouped.high.map((n) => renderNotification(n))}
                      </div>
                    )}

                    {/* Coverage */}
                    {smartData.grouped.coverage?.length > 0 && (
                      <div style={s.group}>
                        <div style={s.groupHeader}>
                          <span style={{ fontWeight: 600 }}>🛡️ Coverage</span>
                          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>
                            {smartData.grouped.coverage.length}
                          </span>
                        </div>
                        {smartData.grouped.coverage.map((n) => renderNotification(n))}
                      </div>
                    )}

                    {/* Incidents */}
                    {smartData.grouped.incidents?.length > 0 && (
                      <div style={s.group}>
                        <div style={s.groupHeader}>
                          <span style={{ fontWeight: 600 }}>⚠️ Incidents</span>
                          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>
                            {smartData.grouped.incidents.length}
                          </span>
                        </div>
                        {smartData.grouped.incidents.map((n) => renderNotification(n))}
                      </div>
                    )}

                    {/* Personnel */}
                    {smartData.grouped.personnel?.length > 0 && (
                      <div style={s.group}>
                        <div style={s.groupHeader}>
                          <span style={{ fontWeight: 600 }}>👤 Personnel</span>
                          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>
                            {smartData.grouped.personnel.length}
                          </span>
                        </div>
                        {smartData.grouped.personnel.map((n) => renderNotification(n))}
                      </div>
                    )}

                    {/* General */}
                    {smartData.grouped.general?.length > 0 && (
                      <div style={s.group}>
                        <div style={s.groupHeader}>
                          <span style={{ fontWeight: 600 }}>📢 General</span>
                          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>
                            {smartData.grouped.general.length}
                          </span>
                        </div>
                        {smartData.grouped.general.map((n) => renderNotification(n))}
                      </div>
                    )}
                  </div>
                ) : list.length === 0 ? (
                  <div style={s.empty}>No notifications yet.</div>
                ) : (
                  <div style={s.items}>
                    {list.map((n) => renderNotification(n))}
                  </div>
                )}
              </div>
          )}
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
              background: "rgba(0,0,0,0.7)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 1000,
              padding: 20,
            }}
            onClick={() => setShowPreferences(false)}
          >
            <div onClick={(e) => e.stopPropagation()}>
              <NotificationPreferences onClose={() => setShowPreferences(false)} />
            </div>
          </div>
        )}

          <span className="badge">
            <span className="dot" />
            {adminInfo?.email || "Authenticated"}
          </span>
          {token ? (
            <button
              type="button"
              className="btn"
              style={{ fontSize: 12, padding: "6px 10px" }}
              onClick={() => nav("/account")}
            >
              Account
            </button>
          ) : null}

          {token ? (
            <button className="btn" onClick={logout}>
              Logout
            </button>
          ) : (
            <button className="btn" onClick={() => nav("/login")}>
              Login
            </button>
          )}
        </div>
      )}
    </header>
  );
}

const s = {
  wrap: {
    height: 62,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "0 18px",
    borderBottom: "1px solid rgba(148,163,184,0.14)",
    background: "rgba(255,255,255,0.02)",
    position: "sticky",
    top: 0,
    zIndex: 20,
    backdropFilter: "blur(10px)",
  },
  left: { display: "flex", alignItems: "center", gap: 12, minWidth: 0 },
  menuBtn: {
    width: 44,
    height: 40,
    padding: 0,
    borderRadius: 12,
    display: "none",
  },
  brandWrap: { display: "flex", flexDirection: "column", minWidth: 0 },
  brand: { fontWeight: 900, letterSpacing: 0.3 },
  crumb: { fontSize: 12, opacity: 0.7, marginTop: 2 },
  right: { display: "flex", alignItems: "center", gap: 10 },

  // 🔔 bell
  bellWrap: { position: "relative" },
  bellBtn: { position: "relative", borderRadius: 12, padding: "8px 10px" },
  bellCount: {
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
  },
  dropdown: {
    position: "absolute",
    right: 0,
    top: "110%",
    width: 420, // Increased width to fit settings button
    maxHeight: 420,
    overflow: "hidden",
    borderRadius: 14,
    border: "1px solid rgba(148,163,184,0.22)",
    background: "rgba(15,23,42,0.98)",
    boxShadow: "0 18px 50px rgba(0,0,0,0.35)",
    zIndex: 99,
  },
  dropdownHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "12px 16px",
    borderBottom: "1px solid rgba(148,163,184,0.16)",
    color: "rgba(255,255,255,0.9)",
    fontWeight: 700,
    minHeight: "48px", // Ensure header is always visible
    width: "100%",
    boxSizing: "border-box",
  },
  smallBtn: {
    padding: "6px 10px",
    borderRadius: 10,
    fontSize: 12,
  },
  empty: { padding: 14, color: "rgba(255,255,255,0.75)" },
  items: { maxHeight: 360, overflow: "auto" },
  item: {
    width: "100%",
    textAlign: "left",
    padding: 12,
    border: 0,
    background: "transparent",
    cursor: "pointer",
    borderBottom: "1px solid rgba(148,163,184,0.12)",
  },
  itemUnread: { background: "rgba(56,189,248,0.08)" },
  itemRead: { background: "transparent", opacity: 0.88 },
  itemTitle: { color: "rgba(255,255,255,0.92)", fontWeight: 700, fontSize: 13 },
  itemMsg: { marginTop: 4, color: "rgba(255,255,255,0.75)", fontSize: 12, lineHeight: 1.3 },
  itemTime: { marginTop: 6, color: "rgba(255,255,255,0.55)", fontSize: 11 },
  group: {
    borderBottom: "1px solid rgba(148,163,184,0.16)",
    paddingBottom: 8,
    marginBottom: 8,
  },
  groupHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "8px 12px",
    background: "rgba(255,255,255,0.03)",
    fontSize: 12,
    fontWeight: 600,
    color: "rgba(255,255,255,0.8)",
  },
};
