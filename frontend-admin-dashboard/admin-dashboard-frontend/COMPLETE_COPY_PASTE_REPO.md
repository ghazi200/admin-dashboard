# Complete copy-paste: Reports, Inspections, and WebSocket fix

Use this file to replace the contents of each path with the block below it. Paths are relative to the **admin frontend** root: `frontend-admin-dashboard/admin-dashboard-frontend/`.

---

## 1. Socket (WebSocket) — fewer disconnects on Reports/Inspections

**Path:** `src/realtime/socket.js`

- Reconnects on **any** disconnect reason (not only server/transport).
- Uses `websocket` + `polling` and 30s timeout so connection is more stable.
- On **Reports** and **Inspections** the app no longer opens the notification socket there, so you won’t see “disconnected after a few seconds” on those pages.

```js
/**
 * Realtime: single connection to WebSocket Gateway.
 * No localhost in bundle — use REACT_APP_SOCKET_URL or REACT_APP_WS_GATEWAY_URL. Local dev: set to your gateway URL.
 */

import { io } from "socket.io-client";

const WS_GATEWAY_PRODUCTION = "https://generous-manifestation-production-dbd9.up.railway.app";

let socket = null;
let lastToken = null;

/** True when the app is served from a real host (e.g. vercel.app), not local dev. */
function isProductionOrigin() {
  if (typeof window === "undefined" || !window.location || !window.location.hostname) return false;
  const h = window.location.hostname.toLowerCase();
  return h !== "localhost" && h !== "127.0.0.1";
}

function getSocketUrl() {
  // When app is on Vercel (or any non-localhost host), always use Railway. Never use env here so a bad Vercel env can't inject localhost.
  if (isProductionOrigin()) return WS_GATEWAY_PRODUCTION;
  const envUrl = (process.env.REACT_APP_SOCKET_URL || process.env.REACT_APP_WS_GATEWAY_URL || "").replace(/\/+$/, "");
  return envUrl || WS_GATEWAY_PRODUCTION;
}

export function connectSocket() {
  const token = typeof localStorage !== "undefined" ? localStorage.getItem("adminToken") || "" : "";
  if (!token) {
    console.warn("⚠️ Socket disabled: no adminToken");
    return null;
  }

  if (socket) {
    if (lastToken !== token) {
      lastToken = token;
      socket.auth = { token };
      if (socket.connected) socket.disconnect();
      socket.connect();
    }
    return socket;
  }

  lastToken = token;

  // Force Railway when on Vercel or any non-localhost host (defeats bad env or wrong build).
  const host = typeof window !== "undefined" && window.location && window.location.hostname ? window.location.hostname.toLowerCase() : "";
  const isVercel = host.indexOf("vercel.app") !== -1;
  const isLocal = host === "localhost" || host === "127.0.0.1";
  const urlToConnect = isVercel || !isLocal ? WS_GATEWAY_PRODUCTION : getSocketUrl();
  if (typeof console !== "undefined" && isVercel) console.log("[socket] Using Railway gateway (Vercel build v2)");
  socket = io(urlToConnect, {
    path: "/socket.io",
    transports: ["websocket", "polling"],
    upgrade: true,
    auth: { token },
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10000,
    randomizationFactor: 0.5,
    timeout: 30000,
    withCredentials: true,
  });

  socket.on("connect", () => {
    if (typeof console !== "undefined") console.log("✅ Socket connected:", socket.id);
    socket.emit("join_admin");
  });

  socket.on("reconnect", () => {
    socket.emit("join_admin");
  });

  socket.on("disconnect", (reason) => {
    if (typeof console !== "undefined") console.warn("⚠️ Socket disconnected:", reason);
    // Reconnect on any disconnect so Reports/Inspections don't stay disconnected
    if (socket && !socket.connected) {
      try {
        socket.connect();
      } catch (_) {}
    }
  });

  socket.on("connect_error", (err) => {
    console.error("❌ Socket connect_error:", err.message);
  });

  return socket;
}

export function connectAdminSocket() {
  return connectSocket();
}

export function disconnectSocket() {
  if (socket) {
    try {
      socket.disconnect();
    } catch (_) {}
    socket = null;
  }
  lastToken = null;
}

export { socket as gatewaySocket };
```

---

## 2. Notifications — no socket on Reports/Inspections

**Path:** `src/context/NotificationContext.jsx`

- Does **not** fetch notifications or connect the socket on Reports or Inspections, so no WebSocket disconnect on those pages.

```jsx
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { connectSocket } from "../realtime/socket";
import {
  fetchNotifications,
  fetchUnreadCount,
  markNotificationRead,
} from "../services/notifications";

const NotificationsContext = createContext(null);

export function NotificationsProvider({ children }) {
  const location = useLocation();
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);

  const isReportsOrInspections =
    (location.pathname || "").toLowerCase().includes("/reports") ||
    (location.pathname || "").toLowerCase().includes("/inspections");

  // initial load — skip on Reports/Inspections to avoid 401 that could affect page
  useEffect(() => {
    if (isReportsOrInspections) return;
    let mounted = true;

    (async () => {
      try {
        const [listRes, countRes] = await Promise.all([
          fetchNotifications(25),
          fetchUnreadCount(),
        ]);

        if (!mounted) return;

        const list = Array.isArray(listRes.data) ? listRes.data : (listRes.data?.notifications || []);
        const count =
          typeof countRes.data?.unread === "number"
            ? countRes.data.unread
            : typeof countRes.data?.unreadCount === "number"
            ? countRes.data.unreadCount
            : 0;

        setItems(list);
        setUnread(count);
      } catch (e) {
        const msg = e?.message || "";
        const isTimeout = e?.code === "ECONNABORTED" || /timeout/i.test(msg);
        const isNetwork = msg === "Network Error" || !e?.response;
        if (isTimeout || isNetwork) {
          console.warn(
            "Notifications initial load failed: backend may be down or slow.",
            msg
          );
        } else {
          console.warn("Notifications initial load failed:", msg);
        }
      }
    })();

    return () => {
      mounted = false;
    };
  }, [isReportsOrInspections]);

  // realtime — skip on Reports/Inspections so socket doesn't connect then disconnect there
  useEffect(() => {
    if (isReportsOrInspections) return;
    let s;
    try {
      s = connectSocket();
    } catch (_) {
      return;
    }
    if (!s) return;

    const onNew = (n) => {
      setItems((prev) => [n, ...prev].slice(0, 50));
      setUnread((u) => u + 1);
    };

    try {
      s.on("notification:new", onNew);
    } catch (_) {
      return;
    }

    return () => {
      try {
        if (s) s.off("notification:new", onNew);
      } catch (_) {}
    };
  }, [isReportsOrInspections]);

  const markRead = async (id) => {
    // optimistic
    setItems((prev) => prev.map((x) => (x.id === id ? { ...x, read: true } : x)));
    setUnread((u) => Math.max(u - 1, 0));

    try {
      await markNotificationRead(id);
    } catch (e) {
      console.warn("markNotificationRead failed:", e?.message);
      // keep simple: no rollback
    }
  };

  const value = useMemo(() => ({ items, unread, markRead }), [items, unread]);

  return (
    <NotificationsContext.Provider value={value}>
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotifications() {
  const ctx = useContext(NotificationsContext);
  if (!ctx) throw new Error("useNotifications must be used within NotificationsProvider");
  return ctx;
}
```

---

## 3. API client — no redirect on Reports/Inspections

**Path:** `src/api/axiosClient.js`

- On **any** 401 while the path is Reports or Inspections: do **not** clear token or redirect, so the page stays visible.

```js
import axios from "axios";

/** No localhost in bundle: use env so Vercel builds use Railway. Local dev: set REACT_APP_API_URL=http://localhost:5000 */
const PRODUCTION_API = "https://admin-dashboard-production-2596.up.railway.app/api/admin";
const fromEnv = (process.env.REACT_APP_API_URL || process.env.REACT_APP_ADMIN_API_URL || "").replace(/\/+$/, "");
const baseURL = fromEnv ? (fromEnv.includes("/api") ? fromEnv : fromEnv + "/api/admin") : PRODUCTION_API;

const axiosClient = axios.create({
  baseURL,
  timeout: 30000,
  headers: { "Content-Type": "application/json" },
  withCredentials: true,
});

/** Attach admin token */
axiosClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("adminToken");
    if (token) config.headers.Authorization = `Bearer ${token}`;
    else delete config.headers.Authorization;
    return config;
  },
  (e) => Promise.reject(e)
);

/** 401 → clear token and redirect to login, except when on Reports/Inspections so the page never "disappears". */
axiosClient.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error?.response?.status === 401) {
      const pathname = (typeof window !== "undefined" && window.location?.pathname) ? window.location.pathname.toLowerCase() : "";
      const isReportPage = pathname.indexOf("/reports") !== -1;
      const isInspectionsPage = pathname.indexOf("/inspections") !== -1;
      // Never clear token or redirect on Reports/Inspections — keeps page visible
      if (isReportPage || isInspectionsPage) {
        return Promise.reject(error);
      }
      const msg = String(error?.response?.data?.message || "");
      const url = (error?.config?.url || error?.config?.baseURL || "").toLowerCase();
      const isNonCritical =
        /report/.test(url) ||
        /notification/.test(url) ||
        /geographic/.test(url) ||
        /scheduled/.test(url) ||
        /inspection/.test(url) ||
        /sites/.test(url);
      if (/invalid signature|jwt expired|invalid token|session invalidated/i.test(msg) && !isNonCritical) {
        localStorage.removeItem("adminToken");
        localStorage.removeItem("adminInfo");
        localStorage.removeItem("adminUser");
        if (!window.location.pathname.includes("/login")) window.location.href = "/login";
      }
    }
    return Promise.reject(error);
  }
);

export default axiosClient;
```

---

## 4. Guard AI client — no redirect on Reports/Inspections

**Path:** `src/api/abeGuardAiClient.js`

- On 401 while the path is Reports or Inspections: do **not** clear token or redirect.

```js
// src/api/abeGuardAiClient.js
import axios from "axios";
import { getGuardAiOrigin } from "./apiOrigin";

/**
 * Client for abe-guard-ai backend. URL from getGuardAiOrigin() (env or localhost:4000 only when host is local).
 * Production: never localhost; set REACT_APP_GUARD_AI_URL.
 */
const abeGuardAiClient = axios.create({
  baseURL: "",
  headers: { "Content-Type": "application/json" },
  withCredentials: true,
});

abeGuardAiClient.interceptors.request.use((config) => {
  const origin = getGuardAiOrigin();
  if (origin && config.url) {
    const path = config.url.startsWith("/") ? config.url : `/${config.url}`;
    config.url = `${origin.replace(/\/+$/, "")}${path}`;
    config.baseURL = "";
  }
  return config;
});

abeGuardAiClient.interceptors.request.use((config) => {
  // Use adminToken for admin endpoints
  const token = localStorage.getItem("adminToken");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
    console.log("[abeGuardAiClient] Request with token:", config.method?.toUpperCase(), config.url);
  } else {
    delete config.headers.Authorization;
    console.log("[abeGuardAiClient] Request WITHOUT token:", config.method?.toUpperCase(), config.url);
  }
  return config;
});

abeGuardAiClient.interceptors.response.use(
  (res) => res,
  (error) => {
    const status = error?.response?.status;

    if (status === 401) {
      console.error("[abeGuardAiClient] 401 Unauthorized:", error.response?.data);
      const pathname = (typeof window !== "undefined" && window.location?.pathname) ? window.location.pathname.toLowerCase() : "";
      const onReportsOrInspections = pathname.indexOf("/reports") !== -1 || pathname.indexOf("/inspections") !== -1;
      // Never clear token or redirect on Reports/Inspections — keeps page visible
      if (onReportsOrInspections) {
        return Promise.reject(error);
      }
      const msg = String(error?.response?.data?.message || "");
      const looksLikeBadToken =
        msg.toLowerCase().includes("invalid signature") ||
        msg.toLowerCase().includes("jwt expired") ||
        msg.toLowerCase().includes("invalid token") ||
        msg.toLowerCase().includes("expired");

      if (looksLikeBadToken) {
        console.warn("[abeGuardAiClient] Token expired or invalid - clearing and redirecting to login");
        localStorage.removeItem("adminToken");
        localStorage.removeItem("adminInfo");
        localStorage.removeItem("adminUser");

        if (!window.location.pathname.includes("/login")) {
          window.location.href = "/login";
        }
      }
    }
    
    if (status === 400) {
      console.error("[abeGuardAiClient] 400 Bad Request:", error.response?.data);
      console.error("[abeGuardAiClient] Error message:", error.response?.data?.message);
    }
    
    return Promise.reject(error);
  }
);

export default abeGuardAiClient;
```

---

## 5. Layout — no geographicSites on Reports/Inspections

**Path:** `src/components/Layout.jsx`

Only the **relevant snippet** is below. In `Layout.jsx`:

1. Keep the existing `isReportsPage` and add `isInspectionsPage` (if not already there):
   - `const isReportsPage = location.pathname === "/reports" || location.pathname.startsWith("/reports/");`
   - `const isInspectionsPage = location.pathname === "/inspections" || location.pathname.startsWith("/inspections/");`

2. For the **geographicSites** `useQuery`, set:
   - `enabled: !isReportsPage && !isInspectionsPage,`

So the full block for the geographicSites query is:

```js
  const isReportsPage = location.pathname === "/reports" || location.pathname.startsWith("/reports/");
  const isInspectionsPage = location.pathname === "/inspections" || location.pathname.startsWith("/inspections/");
  // ... other state ...

  // Live-updating total sites count; skip on Reports page to avoid any 401 that could affect the page
  const { data: sitesData } = useQuery({
    queryKey: ["geographicSites"],
    queryFn: async () => {
      const res = await getGeographicSites();
      const list = res.data?.data ?? res.data ?? [];
      return Array.isArray(list) ? list : [];
    },
    enabled: !isReportsPage && !isInspectionsPage,
    staleTime: 60 * 1000,
    refetchInterval: 60000,
    refetchIntervalInBackground: false,
  });
```

---

## Commit and push (copy-paste)

From the **repo root** (e.g. `admin-dashboard`):

```bash
cd /Users/ghaziabdullah/admin-dashboard

git add frontend-admin-dashboard/admin-dashboard-frontend/src/realtime/socket.js \
  frontend-admin-dashboard/admin-dashboard-frontend/src/context/NotificationContext.jsx \
  frontend-admin-dashboard/admin-dashboard-frontend/src/api/axiosClient.js \
  frontend-admin-dashboard/admin-dashboard-frontend/src/api/abeGuardAiClient.js \
  frontend-admin-dashboard/admin-dashboard-frontend/src/components/Layout.jsx \
  frontend-admin-dashboard/admin-dashboard-frontend/COMPLETE_COPY_PASTE_REPO.md

git commit -m "fix: websocket stable on Reports/Inspections; no socket on those pages; 401 no redirect; copy-paste doc"

git push origin main
```

Then in Vercel: **Redeploy** the admin project (with “Clear build cache and redeploy” if needed).
