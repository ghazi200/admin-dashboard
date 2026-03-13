/**
 * Realtime: single connection to WebSocket Gateway.
 * Uses REACT_APP_SOCKET_URL (or REACT_APP_WS_GATEWAY_URL). Production fallback to Railway so we never use localhost.
 */

import { io } from "socket.io-client";

const WS_GATEWAY_PRODUCTION = "https://generous-manifestation-production-dbd9.up.railway.app";

let socket = null;
let lastToken = null;

function getGatewayUrl() {
  if (typeof window === "undefined") return null;
  const host = window.location?.hostname;
  const isLocal = host === "localhost" || host === "127.0.0.1";
  // Production: never read env for URL — always use Railway. Stops ws://localhost:4000 no matter what Vercel built with.
  if (!isLocal) return WS_GATEWAY_PRODUCTION;
  const envUrl = (process.env.REACT_APP_SOCKET_URL || process.env.REACT_APP_WS_GATEWAY_URL || "").replace(/[\/?]+$/, "");
  if (envUrl && !/localhost|127\.0\.0\.1/.test(envUrl)) return envUrl;
  return WS_GATEWAY_PRODUCTION;
}

export function connectSocket() {
  const token = typeof localStorage !== "undefined" ? localStorage.getItem("adminToken") || "" : "";
  if (!token) {
    console.warn("⚠️ Socket disabled: no adminToken");
    return null;
  }

  const isLocal =
    typeof window !== "undefined" &&
    (window.location?.hostname === "localhost" || window.location?.hostname === "127.0.0.1");

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

  // Production (vercel.app or any non-localhost): ONLY use this literal. Never attempt localhost (browser blocks ws:// from HTTPS).
  const RAILWAY_GATEWAY = "https://generous-manifestation-production-dbd9.up.railway.app";
  let urlToConnect = isLocal ? (getGatewayUrl() || RAILWAY_GATEWAY) : RAILWAY_GATEWAY;
  if (!urlToConnect || /localhost|127\.0\.0\.1/i.test(String(urlToConnect))) {
    urlToConnect = RAILWAY_GATEWAY;
  }

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
