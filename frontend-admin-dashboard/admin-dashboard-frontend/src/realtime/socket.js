/**
 * Realtime: single connection to WebSocket Gateway (Redis-backed).
 * URL resolved at connect time. Production always uses WS_GATEWAY_DEFAULT (never localhost). Env typo-safe.
 */

import { io } from "socket.io-client";

/** WebSocket gateway (realtime events). Distinct from admin API backend. */
const WS_GATEWAY_DEFAULT = "https://generous-manifestation-production-dbd9.up.railway.app";

function getGatewayUrl() {
  if (typeof window === "undefined") return null;
  const host = window.location?.hostname;
  const isLocal = host === "localhost" || host === "127.0.0.1";
  // Production (Vercel etc.): always use Railway gateway — never localhost (avoids blocked ws://localhost:4000)
  if (!isLocal) return WS_GATEWAY_DEFAULT;
  // Local only: optional env gateway; never use localhost URL from env when we're not on localhost
  const envUrl = process.env.REACT_APP_WS_GATEWAY_URL && String(process.env.REACT_APP_WS_GATEWAY_URL).replace(/[\/?]+$/, "");
  if (envUrl && !/localhost|127\.0\.0\.1/.test(envUrl)) return envUrl;
  return null;
}

let gatewaySocket = null;
let lastToken = null;

/** Polling-only in production avoids proxy/WebSocket disconnects (per WEBSOCKET_PRODUCTION_DISCONNECT_REVIEW). */
function getSocketOpts() {
  const isLocal =
    typeof window !== "undefined" &&
    (window.location?.hostname === "localhost" || window.location?.hostname === "127.0.0.1");
  return {
    path: "/socket.io",
    transports: isLocal ? ["polling", "websocket"] : ["polling"],
    upgrade: isLocal,
    autoConnect: true,
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 2000,
    reconnectionDelayMax: 10000,
    timeout: 20000,
    withCredentials: true,
  };
}

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
  const gatewayUrl = getGatewayUrl();
  if (!gatewayUrl) return null;
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
    gatewaySocket = io(gatewayUrl, {
      ...getSocketOpts(),
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
