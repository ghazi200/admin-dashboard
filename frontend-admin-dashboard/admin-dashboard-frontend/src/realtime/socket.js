/**
 * Realtime: single connection to WebSocket Gateway.
 * No localhost in bundle — use REACT_APP_SOCKET_URL or REACT_APP_WS_GATEWAY_URL. Local dev: set to your gateway URL.
 */

import { io } from "socket.io-client";

const WS_GATEWAY_PRODUCTION = "https://generous-manifestation-production-dbd9.up.railway.app";

let socket = null;
let lastToken = null;

function getSocketUrl() {
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

  const urlToConnect = getSocketUrl();
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
