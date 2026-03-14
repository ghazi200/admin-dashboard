/**
 * Realtime: single connection to WebSocket Gateway.
 * No localhost in bundle — use REACT_APP_SOCKET_URL or REACT_APP_WS_GATEWAY_URL. Local dev: set to your gateway URL.
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

function getSocketUrl() {
  if (isProductionOrigin()) return WS_GATEWAY_PRODUCTION;
  const envUrl = (process.env.REACT_APP_SOCKET_URL || process.env.REACT_APP_WS_GATEWAY_URL || "").replace(/\/+$/, "");
  return envUrl || WS_GATEWAY_PRODUCTION;
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
    autoConnect: true,
    forceNew: false,
  });

  socket.on("connect", () => {
    if (typeof console !== "undefined") console.log("✅ Socket connected:", socket.id);
    socket.emit("join_admin");
  });

  socket.on("reconnect", (attemptNumber) => {
    if (typeof console !== "undefined") console.log("🔄 Socket reconnected after", attemptNumber, "attempts");
    socket.emit("join_admin");
  });

  socket.on("disconnect", (reason) => {
    if (typeof console !== "undefined") console.warn("⚠️ Socket disconnected:", reason);

    if (reason === "io client disconnect") return;

    if (socket && !socket.connected) {
      reconnectTimer = setTimeout(() => {
        if (socket && !socket.connected) {
          socket.connect();
        }
        reconnectTimer = null;
      }, 100);
    }
  });

  socket.on("connect_error", (err) => {
    if (typeof console !== "undefined") console.error("❌ Socket connect_error:", err?.message);
    if (err?.message === "Authentication error" || (err?.message && err.message.includes("auth"))) {
      if (typeof console !== "undefined") console.log("Auth error, will retry with current token");
    }
  });

  socket.io.on("reconnect_attempt", () => {
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
