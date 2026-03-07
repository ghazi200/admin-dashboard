// src/realtime/socket.js
import { io } from "socket.io-client";

/**
 * SINGLE shared socket instance for Admin Dashboard
 * ------------------------------------------------
 * REST  → http://localhost:5000
 * SOCKET → http://localhost:4000 (abe-guard-ai for guard events)
 * ADMIN_SOCKET → http://localhost:5000 (admin-dashboard for admin events)
 *
 * Override with:
 * REACT_APP_GUARD_REALTIME_URL=http://localhost:4000
 * REACT_APP_ADMIN_REALTIME_URL=http://localhost:5000
 */

let socket = null;
let adminSocket = null; // Separate socket for admin-dashboard events
let lastToken = null;

const GUARD_REALTIME_URL_ENV = process.env.REACT_APP_GUARD_REALTIME_URL;
const ADMIN_REALTIME_URL_ENV = process.env.REACT_APP_ADMIN_REALTIME_URL;

function isCurrentPageLocalhost() {
  if (typeof window === "undefined") return false;
  const h = window.location?.hostname || "";
  return h === "localhost" || h === "127.0.0.1";
}

// Guard socket: only connect when explicitly configured (stops "websocket error" / "closed before connection" when abe-guard-ai isn't running)
function getGuardRealtimeUrl() {
  return GUARD_REALTIME_URL_ENV || null;
}
function getAdminRealtimeUrl() {
  if (ADMIN_REALTIME_URL_ENV) return ADMIN_REALTIME_URL_ENV;
  return isCurrentPageLocalhost() ? "http://localhost:5000" : null;
}

export function connectSocket() {
  const token = localStorage.getItem("adminToken") || "";

  if (!token) return null;

  const url = getGuardRealtimeUrl();
  if (!url) return null;

  // ♻️ If socket exists and token changed → reconnect safely (NO new instance)
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

  const guardReconnectionAttempts = GUARD_REALTIME_URL_ENV ? Infinity : 3;
  // Polling-only when using default localhost — avoids "websocket closed before connection" when server isn't running
  const guardTransports = GUARD_REALTIME_URL_ENV ? ["polling", "websocket"] : ["polling"];

  socket = io(url, {
    path: "/socket.io",
    auth: { token },
    transports: guardTransports,
    upgrade: !!GUARD_REALTIME_URL_ENV,
    autoConnect: true,
    reconnection: true,
    reconnectionAttempts: guardReconnectionAttempts,
    reconnectionDelay: 500,
    reconnectionDelayMax: 2000,
    timeout: 20000,
    withCredentials: true,
  });

  let guardConnectErrorLogged = false;
  socket.on("connect", () => {
    guardConnectErrorLogged = false;
    console.log("✅ Admin realtime socket connected:", socket.id);
    socket.emit("join_admin");
  });

  socket.on("disconnect", (reason) => {
    if (guardReconnectionAttempts === Infinity) {
      console.warn("⚠️ Admin realtime socket disconnected:", reason);
    }
  });

  socket.on("reconnect", (attemptNumber) => {
    socket.emit("join_admin");
  });

  socket.on("connect_error", () => {
    if (!guardConnectErrorLogged) {
      guardConnectErrorLogged = true;
      if (typeof console !== "undefined" && console.warn) {
        console.warn("⚠️ Guard realtime socket unavailable. Set REACT_APP_GUARD_REALTIME_URL when abe-guard-ai is running.");
      }
    }
  });

  return socket;
}

// ✅ Connect to admin-dashboard socket server (port 5000) for admin-specific events
export function connectAdminSocket() {
  const token = localStorage.getItem("adminToken") || "";
  if (!token) return null;

  const url = getAdminRealtimeUrl();
  if (!url) return null;

  // ♻️ If socket exists and token changed → reconnect safely
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

  // ✅ CREATE ADMIN SOCKET (for admin-dashboard events on port 5000)
  const adminReconnectionAttempts = ADMIN_REALTIME_URL_ENV ? Infinity : 3;
  const adminTransports = ADMIN_REALTIME_URL_ENV ? ["polling", "websocket"] : ["polling"];
  adminSocket = io(url, {
    path: "/socket.io",
    auth: { token },
    transports: adminTransports,
    upgrade: !!ADMIN_REALTIME_URL_ENV,
    autoConnect: true,
    reconnection: true,
    reconnectionAttempts: adminReconnectionAttempts,
    reconnectionDelay: 500,
    reconnectionDelayMax: 2000,
    timeout: 20000,
    withCredentials: true,
  });

  let adminConnectErrorLogged = false;
  adminSocket.on("connect", () => {
    adminConnectErrorLogged = false;
    console.log("✅ Admin dashboard socket connected:", adminSocket.id);
  });

  adminSocket.on("disconnect", (reason) => {
    if (adminReconnectionAttempts === Infinity) {
      console.warn("⚠️ Admin dashboard socket disconnected:", reason);
    }
  });

  adminSocket.on("connect_error", () => {
    if (!adminConnectErrorLogged) {
      adminConnectErrorLogged = true;
      if (typeof console !== "undefined" && console.warn) {
        console.warn("⚠️ Admin dashboard socket unavailable. Set REACT_APP_ADMIN_REALTIME_URL when backend supports Socket.IO.");
      }
    }
  });

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
