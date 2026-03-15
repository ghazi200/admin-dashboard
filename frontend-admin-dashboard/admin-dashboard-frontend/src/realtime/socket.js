/**
 * Realtime: single connection to WebSocket Gateway.
 * Production (Vercel): ALWAYS use Railway gateway — never localhost.
 * Local dev: use REACT_APP_SOCKET_URL or REACT_APP_WS_GATEWAY_URL, or Railway URL.
 */

import { io } from "socket.io-client";

const WS_GATEWAY_PRODUCTION = "https://generous-manifestation-production-dbd9.up.railway.app";

let socket = null;
let lastToken = null;
let reconnectTimer = null;

/** True when the app is served from a real host (e.g. vercel.app), not local dev. */
function isProductionOrigin() {
  if (typeof window === "undefined" || !window.location || !window.location.hostname) return false;
  const h = window.location.hostname.toLowerCase();
  return h !== "localhost" && h !== "127.0.0.1";
}

/** Socket URL: production host ALWAYS gets Railway; localhost uses env or Railway. Never use localhost URL when not on localhost. */
function getSocketUrl() {
  if (typeof window !== "undefined" && window.location && window.location.hostname) {
    const h = window.location.hostname.toLowerCase();
    const isProd = h !== "localhost" && h !== "127.0.0.1";
    if (isProd) return WS_GATEWAY_PRODUCTION;
    const envUrl = (process.env.REACT_APP_SOCKET_URL || process.env.REACT_APP_WS_GATEWAY_URL || "").replace(/\/+$/, "");
    const url = envUrl || WS_GATEWAY_PRODUCTION;
    if (/localhost|127\.0\.0\.1/.test(url)) return url;
    return url;
  }
  return WS_GATEWAY_PRODUCTION;
}

export function connectSocket() {
  const token = typeof localStorage !== "undefined" ? localStorage.getItem("adminToken") || "" : "";
  if (!token) {
    if (typeof console !== "undefined") console.warn("⚠️ Socket disabled: no adminToken");
    return null;
  }

  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  if (socket) {
    if (lastToken !== token) {
      lastToken = token;
      socket.auth = { token };
      if (socket.connected) {
        socket.disconnect();
        socket.connect();
      } else {
        socket.connect();
      }
    }
    return socket;
  }

  lastToken = token;

  const urlToConnect = getSocketUrl();
  if (typeof console !== "undefined") {
    const isProd = isProductionOrigin();
    console.log("🔬 2-MIN SOCKET TEST ACTIVE — URL:", urlToConnect, isProd ? "(production)" : "(local)");
  }

  socket = io(urlToConnect, {
    path: "/socket.io",
    transports: ["websocket"],
    upgrade: false,
    auth: { token },
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 3000,
    reconnectionDelayMax: 15000,
    randomizationFactor: 0.5,
    timeout: 30000,
    withCredentials: true,
    autoConnect: true,
    forceNew: false,
  });

  // --- 2-minute test: global socket debugging ---
  socket.on("connect", () => {
    if (typeof console !== "undefined") console.log("🟢 SOCKET CONNECTED", socket.id);
    socket.emit("join_admin");
  });

  socket.on("reconnect", (attemptNumber) => {
    if (typeof console !== "undefined") console.log("🔄 Socket reconnected after", attemptNumber, "attempts");
    socket.emit("join_admin");
  });

  socket.on("disconnect", (reason) => {
    if (typeof console !== "undefined") console.log("🔴 SOCKET DISCONNECTED:", reason);
    // Rely on Socket.IO built-in reconnection only (reconnectionDelay 3s, reconnectionDelayMax 15s)
  });

  socket.on("connect_error", (err) => {
    if (typeof console !== "undefined") console.log("⚠️ SOCKET ERROR:", err?.message);
    if (err?.message === "Authentication error" || (err?.message && err.message.includes("auth"))) {
      if (typeof console !== "undefined") console.log("Auth error, will retry with current token");
    }
  });

  socket.io.on("reconnect_attempt", (attempt) => {
    if (typeof console !== "undefined") console.log("🔁 RECONNECT ATTEMPT:", attempt);
    const currentToken = typeof localStorage !== "undefined" ? localStorage.getItem("adminToken") || "" : "";
    if (currentToken && socket) socket.auth = { token: currentToken };
  });

  socket.io.on("reconnect_error", (err) => {
    if (typeof console !== "undefined") console.error("❌ Reconnection error:", err?.message);
  });

  socket.io.on("reconnect_failed", () => {
    if (typeof console !== "undefined") console.error("❌ Reconnection failed after all attempts");
    reconnectTimer = setTimeout(() => {
      if (socket && !socket.connected) socket.connect();
      reconnectTimer = null;
    }, 5000);
  });

  return socket;
}

export function connectAdminSocket() {
  return connectSocket();
}

export function disconnectSocket() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (socket) {
    try {
      socket.removeAllListeners();
      socket.disconnect();
    } catch (_) {}
    socket = null;
  }
  lastToken = null;
}

export function getSocket() {
  return socket;
}

export function isSocketConnected() {
  return !!(socket && socket.connected);
}

export { socket as gatewaySocket };
