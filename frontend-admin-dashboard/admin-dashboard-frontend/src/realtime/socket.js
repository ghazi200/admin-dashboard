/**
 * Realtime: single connection to WebSocket Gateway (Redis-backed).
 * Set REACT_APP_WS_GATEWAY_URL to your Gateway URL (e.g. https://your-gateway.up.railway.app).
 * Same socket is used for all events (admin + guard-style); Gateway emits by room.
 */

import { io } from "socket.io-client";

const RAILWAY_ORIGIN = "https://admin-dashboard-production-2596.up.railway.app";

// Prefer WebSocket gateway; fallback to Railway when on production (Vercel) so sockets don't go through serverless
const GATEWAY_URL =
  (process.env.REACT_APP_WS_GATEWAY_URL && process.env.REACT_APP_WS_GATEWAY_URL.replace(/[\/?]+$/, "")) ||
  (typeof window !== "undefined" && window.location?.hostname !== "localhost" && window.location?.hostname !== "127.0.0.1"
    ? RAILWAY_ORIGIN
    : null);

let gatewaySocket = null;
let lastToken = null;

const OPTS = {
  path: "/socket.io",
  transports: ["polling", "websocket"],
  autoConnect: true,
  reconnection: true,
  reconnectionAttempts: 10,
  reconnectionDelay: 2000,
  reconnectionDelayMax: 10000,
  timeout: 20000,
  withCredentials: true,
};

/**
 * Connect to the WebSocket Gateway. Returns one shared socket for both "guard" and "admin" events.
 */
export function connectSocket() {
  return connectGateway();
}

/**
 * Same as connectSocket — single Gateway connection for all realtime events.
 */
export function connectAdminSocket() {
  return connectGateway();
}

function connectGateway() {
  if (!GATEWAY_URL) return null;
  const token = typeof localStorage !== "undefined" ? localStorage.getItem("adminToken") || "" : "";
  if (!token) return null;

  if (gatewaySocket) {
    if (lastToken !== token) {
      lastToken = token;
      gatewaySocket.auth = { token };
      if (gatewaySocket.connected) gatewaySocket.disconnect();
      gatewaySocket.connect();
    }
    return gatewaySocket;
  }

  lastToken = token;
  try {
    gatewaySocket = io(GATEWAY_URL, {
      ...OPTS,
      auth: { token },
    });

    gatewaySocket.on("connect", () => {
      gatewaySocket.emit("join_admin");
    });
    gatewaySocket.on("reconnect", () => {
      gatewaySocket.emit("join_admin");
    });
    gatewaySocket.on("connect_error", () => {
      if (!gatewaySocket._connectErrorLogged) {
        gatewaySocket._connectErrorLogged = true;
        if (typeof console !== "undefined" && console.warn) {
          console.warn("⚠️ Realtime gateway unavailable. Set REACT_APP_WS_GATEWAY_URL to your WebSocket Gateway URL.");
        }
      }
    });
    gatewaySocket.on("disconnect", (reason) => {
      if (reason === "io server disconnect" || reason === "transport close") {
        gatewaySocket.connect();
      }
    });
  } catch (err) {
    if (typeof console !== "undefined" && console.warn) {
      console.warn("⚠️ Gateway socket init failed:", err?.message || err);
    }
    gatewaySocket = null;
    return null;
  }

  return gatewaySocket;
}

export function disconnectSocket() {
  if (gatewaySocket) {
    try {
      gatewaySocket.disconnect();
    } catch (_) {}
    gatewaySocket = null;
  }
  lastToken = null;
}

export { gatewaySocket };
