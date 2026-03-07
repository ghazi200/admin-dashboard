// src/realtime/socket.js
import { io } from "socket.io-client";

/**
 * SINGLE shared socket instance for Admin Dashboard
 * Uses POLLING ONLY to avoid "WebSocket connection failed" / "closed before connection" errors.
 * Override: REACT_APP_GUARD_REALTIME_URL, REACT_APP_ADMIN_REALTIME_URL
 */

let socket = null;
let adminSocket = null;
let lastToken = null;

const GUARD_REALTIME_URL_ENV = process.env.REACT_APP_GUARD_REALTIME_URL;
const ADMIN_REALTIME_URL_ENV = process.env.REACT_APP_ADMIN_REALTIME_URL;

function isCurrentPageLocalhost() {
  if (typeof window === "undefined") return false;
  const h = window.location?.hostname || "";
  return h === "localhost" || h === "127.0.0.1";
}

function getGuardRealtimeUrl() {
  return GUARD_REALTIME_URL_ENV || null;
}
function getAdminRealtimeUrl() {
  if (ADMIN_REALTIME_URL_ENV) return ADMIN_REALTIME_URL_ENV;
  return isCurrentPageLocalhost() ? "http://localhost:5000" : null;
}

function isProductionOrigin() {
  if (typeof window === "undefined") return false;
  return window.location?.protocol === "https:" && !window.location?.hostname?.includes("localhost");
}

// Shared options: polling-only = no WebSocket. Fewer retries in production to avoid connect/disconnect flash loops.
const POLLING_ONLY_OPTS = {
  path: "/socket.io",
  transports: ["polling"],
  upgrade: false,
  autoConnect: true,
  reconnection: true,
  reconnectionAttempts: isProductionOrigin() ? 2 : 5,
  reconnectionDelay: isProductionOrigin() ? 3000 : 1000,
  reconnectionDelayMax: 10000,
  timeout: 20000,
  withCredentials: true,
};

export function connectSocket() {
  const token = localStorage.getItem("adminToken") || "";
  if (!token) return null;

  const url = getGuardRealtimeUrl();
  if (!url) return null;

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

  try {
    socket = io(url, {
      ...POLLING_ONLY_OPTS,
      auth: { token },
    });

    socket.on("connect", () => {
      socket.emit("join_admin");
    });
    socket.on("reconnect", () => {
      socket.emit("join_admin");
    });
    socket.on("connect_error", () => {
      // Log once; polling failure is silent after first warning
      if (!socket._connectErrorLogged) {
        socket._connectErrorLogged = true;
        if (typeof console !== "undefined" && console.warn) {
          console.warn("⚠️ Guard realtime unavailable. Set REACT_APP_GUARD_REALTIME_URL when abe-guard-ai is running.");
        }
      }
    });
  } catch (err) {
    if (typeof console !== "undefined" && console.warn) {
      console.warn("⚠️ Guard socket init failed:", err?.message || err);
    }
    socket = null;
    return null;
  }

  return socket;
}

export function connectAdminSocket() {
  const token = localStorage.getItem("adminToken") || "";
  if (!token) return null;

  const url = getAdminRealtimeUrl();
  if (!url) return null;

  if (adminSocket) {
    if (lastToken !== token) {
      lastToken = token;
      adminSocket.auth = { token };
      if (adminSocket.connected) adminSocket.disconnect();
      adminSocket.connect();
    }
    return adminSocket;
  }

  lastToken = token;

  try {
    adminSocket = io(url, {
      ...POLLING_ONLY_OPTS,
      auth: { token },
    });

    adminSocket.on("connect_error", () => {
      if (!adminSocket._connectErrorLogged) {
        adminSocket._connectErrorLogged = true;
        if (typeof console !== "undefined" && console.warn) {
          console.warn("⚠️ Admin dashboard socket unavailable. Set REACT_APP_ADMIN_REALTIME_URL when backend supports Socket.IO.");
        }
      }
    });
  } catch (err) {
    if (typeof console !== "undefined" && console.warn) {
      console.warn("⚠️ Admin socket init failed:", err?.message || err);
    }
    adminSocket = null;
    return null;
  }

  return adminSocket;
}

export function disconnectSocket() {
  if (socket) {
    try {
      socket.disconnect();
    } catch {}
    socket = null;
  }
  if (adminSocket) {
    try {
      adminSocket.disconnect();
    } catch {}
    adminSocket = null;
  }
  lastToken = null;
}

// Export both sockets
export { adminSocket };
