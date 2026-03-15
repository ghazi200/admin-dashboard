/**
 * Socket Manager — alternative socket layer (NOT USED by the app; app uses socket.js).
 * Kept in sync with socket.js so if anything imports this, it uses same URL and transport.
 * - Production: always Railway gateway (no localhost).
 * - Transport: websocket only (gateway does not support polling).
 */

import { io } from "socket.io-client";

const WS_GATEWAY_PRODUCTION = "https://generous-manifestation-production-dbd9.up.railway.app";
const MAX_RECONNECT_ATTEMPTS = 20;

function getSocketUrl() {
  if (typeof window === "undefined" || !window.location?.hostname) return WS_GATEWAY_PRODUCTION;
  const h = window.location.hostname.toLowerCase();
  if (h !== "localhost" && h !== "127.0.0.1") return WS_GATEWAY_PRODUCTION;
  const envUrl = (process.env.REACT_APP_SOCKET_URL || process.env.REACT_APP_WS_GATEWAY_URL || "").replace(/\/+$/, "");
  return envUrl || WS_GATEWAY_PRODUCTION;
}

function getApiBase() {
  const fromEnv = (process.env.REACT_APP_API_URL || process.env.REACT_APP_ADMIN_API_URL || "").replace(/\/+$/, "");
  return fromEnv ? (fromEnv.includes("/api") ? fromEnv : fromEnv + "/api/admin") : "https://admin-dashboard-production-2596.up.railway.app/api/admin";
}

class SocketManager {
  socket = null;
  isConnecting = false;
  reconnectAttempts = 0;
  /** Pending listeners when socket not yet created: Map<event, Set<callback>> */
  listeners = new Map();

  #getToken() {
    try {
      return typeof localStorage !== "undefined" ? localStorage.getItem("adminToken") || "" : "";
    } catch (e) {
      if (typeof console !== "undefined") console.error("[SocketManager] localStorage access failed:", e);
      return "";
    }
  }

  #isTokenValid() {
    const token = this.#getToken();
    if (!token) return false;
    try {
      const parts = token.split(".");
      if (parts.length !== 3) return true;
      const payload = JSON.parse(atob(parts[1]));
      return payload.exp != null && payload.exp * 1000 > Date.now();
    } catch {
      return true;
    }
  }

  connect() {
    if (this.socket?.connected) {
      return this.socket;
    }
    if (this.isConnecting && this.socket) {
      return this.socket;
    }

    const token = this.#getToken();
    if (!token || !this.#isTokenValid()) {
      if (typeof console !== "undefined") console.warn("[SocketManager] No valid token, socket not started");
      return null;
    }

    // Clean up existing disconnected socket so we never have multiple instances
    if (this.socket) {
      try {
        this.socket.removeAllListeners();
        this.socket.disconnect();
      } catch (_) {}
      this.socket = null;
    }

    this.isConnecting = true;
    this.reconnectAttempts = 0;
    const url = getSocketUrl();
    if (typeof console !== "undefined" && url === WS_GATEWAY_PRODUCTION) {
      console.log("[SocketManager] Using Railway gateway");
    }

    this.socket = io(url, {
      path: "/socket.io",
      transports: ["websocket"],
      upgrade: false,
      auth: { token },
      reconnection: true,
      reconnectionAttempts: MAX_RECONNECT_ATTEMPTS,
      reconnectionDelay: 3000,
      reconnectionDelayMax: 15000,
      timeout: 30000,
      withCredentials: true,
    });

    this.socket.on("connect", () => {
      if (typeof console !== "undefined") console.log("✅ Socket connected:", this.socket.id);
      this.isConnecting = false;
      this.reconnectAttempts = 0;
      this.socket.emit("join_admin");
      this.#attachPendingListeners();
    });

    this.socket.on("reconnect", () => {
      this.reconnectAttempts = 0;
      this.socket.emit("join_admin");
    });

    this.socket.on("disconnect", (reason) => {
      if (typeof console !== "undefined") console.warn("⚠️ Socket disconnected:", reason);
      if (reason === "io server disconnect" || reason === "transport close") {
        if (!this.#isTokenValid()) {
          if (typeof console !== "undefined") console.log("[SocketManager] Token expired after disconnect");
          this.#handleTokenRefresh();
        }
      }
    });

    this.socket.on("connect_error", (err) => {
      const msg = (err?.message || "").toLowerCase();
      if (typeof console !== "undefined") console.error("❌ Socket connect_error:", err?.message);
      this.isConnecting = false;
      if (msg.includes("auth") || msg.includes("unauthorized") || msg.includes("invalid") || msg.includes("expired")) {
        if (typeof console !== "undefined") console.log("[SocketManager] Auth error, attempting refresh");
        this.#handleTokenRefresh();
        return;
      }
      this.reconnectAttempts++;
      if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
        if (typeof console !== "undefined") console.error("[SocketManager] Max reconnection attempts reached");
        this.destroy();
      }
    });

    this.socket.io.on("reconnect_attempt", () => {
      const t = this.#getToken();
      if (t && this.socket) this.socket.auth = { token: t };
    });

    return this.socket;
  }

  #attachPendingListeners() {
    if (!this.socket) return;
    this.listeners.forEach((callbacks, event) => {
      callbacks.forEach((cb) => {
        try {
          this.socket.on(event, cb);
        } catch (_) {}
      });
    });
    this.listeners.clear();
  }

  on(event, callback) {
    if (this.socket) {
      this.socket.on(event, callback);
      return;
    }
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event).add(callback);
  }

  off(event, callback) {
    if (this.socket) {
      try {
        this.socket.off(event, callback);
      } catch (_) {}
    }
    if (this.listeners.has(event)) {
      this.listeners.get(event).delete(callback);
    }
  }

  emit(event, data, retries = 3) {
    if (this.socket?.connected) {
      this.socket.emit(event, data);
      return true;
    }
    if (retries > 0) {
      setTimeout(() => this.emit(event, data, retries - 1), 1000);
      return false;
    }
    return false;
  }

  async #handleTokenRefresh() {
    const refreshToken = typeof localStorage !== "undefined" ? localStorage.getItem("refreshToken") || "" : "";
    if (!refreshToken) {
      this.#handleLogout();
      return;
    }
    try {
      const base = getApiBase();
      const res = await fetch(`${base.replace(/\/+$/, "")}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        const token = data?.token;
        if (token) {
          localStorage.setItem("adminToken", token);
          if (typeof console !== "undefined") console.log("[SocketManager] Token refreshed, reconnecting");
          setTimeout(() => this.connect(), 500);
          return;
        }
      }
    } catch (e) {
      if (typeof console !== "undefined") console.error("[SocketManager] Token refresh failed:", e);
    }
    this.#handleLogout();
  }

  #handleLogout() {
    try {
      ["adminToken", "adminUser", "adminInfo", "refreshToken"].forEach((k) => localStorage.removeItem(k));
    } catch (_) {}
    try {
      window.dispatchEvent(new CustomEvent("auth:logout"));
    } catch (_) {}
    if (typeof window !== "undefined" && !window.location.pathname.includes("/login")) {
      window.location.href = "/login";
    }
  }

  getSocket() {
    return this.socket ?? null;
  }

  isConnected() {
    return !!this.socket?.connected;
  }

  disconnect() {
    if (this.socket) {
      try {
        this.socket.removeAllListeners();
        this.socket.disconnect();
      } catch (_) {}
      this.socket = null;
    }
    this.isConnecting = false;
    this.reconnectAttempts = 0;
  }

  destroy() {
    this.disconnect();
    this.listeners.clear();
  }
}

export default new SocketManager();
