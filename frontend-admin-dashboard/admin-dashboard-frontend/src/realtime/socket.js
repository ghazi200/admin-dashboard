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
    transports: ["websocket"],
    upgrade: false,
    auth: { token },
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 2000,
    reconnectionDelayMax: 10000,
    timeout: 20000,
    withCredentials: true,
  });

  socket.on("connect", () => {
    console.log("✅ Socket connected:", socket.id);
    socket.emit("join_admin");
  });

  socket.on("reconnect", () => {
    socket.emit("join_admin");
  });

  socket.on("disconnect", (reason) => {
    console.warn("⚠️ Socket disconnected:", reason);
    if (reason === "io server disconnect" || reason === "transport close") {
      socket.connect();
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
