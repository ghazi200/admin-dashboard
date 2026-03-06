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

const REALTIME_URL =
  process.env.REACT_APP_GUARD_REALTIME_URL || "http://localhost:4000";
const ADMIN_REALTIME_URL =
  process.env.REACT_APP_ADMIN_REALTIME_URL || "http://localhost:5000";

// Never connect to localhost from a non-localhost page (avoids mixed content / blocked ws)
function isLocalhostUrl(url) {
  if (!url || typeof url !== "string") return false;
  try {
    const host = new URL(url).hostname;
    return host === "localhost" || host === "127.0.0.1";
  } catch {
    return (url || "").includes("localhost") || (url || "").includes("127.0.0.1");
  }
}
function isCurrentPageLocalhost() {
  if (typeof window === "undefined") return false;
  const h = window.location?.hostname || "";
  return h === "localhost" || h === "127.0.0.1";
}

export function connectSocket() {
  const token = localStorage.getItem("adminToken") || "";

  if (!token) return null;

  // 🚫 Never connect to localhost from a deployed site — browser blocks ws:// and spams errors
  if (isLocalhostUrl(REALTIME_URL) && !isCurrentPageLocalhost()) {
    return null;
  }

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

  // ✅ CREATE SOCKET (ONCE)
  socket = io(REALTIME_URL, {
    path: "/socket.io",

    // Socket.IO auth payload
    auth: { token },

    // Polling first then upgrade to websocket (avoids "closed before connection established" behind proxies)
    transports: ["polling", "websocket"],
    upgrade: true,

    autoConnect: true,

    // Stable reconnect behavior
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 500,
    reconnectionDelayMax: 2000,

    timeout: 20000,
    withCredentials: true,
  });

  // =============================
  // SOCKET LIFECYCLE LOGGING
  // =============================

  socket.on("connect", () => {
    console.log("✅ Admin realtime socket connected:", socket.id);

    // Join admin room so io.to("admins") emits reach this client
    socket.emit("join_admin");
    console.log("📤 Emitted join_admin - should join 'admins' room");
  });

  socket.on("disconnect", (reason) => {
    console.warn("⚠️ Admin realtime socket disconnected:", reason);
    console.log("💡 Socket will automatically reconnect and rejoin 'admins' room");
  });

  socket.on("reconnect", (attemptNumber) => {
    console.log("🔄 Socket reconnected after", attemptNumber, "attempt(s)");
    // Re-join admin room on reconnect
    socket.emit("join_admin");
    console.log("📤 Re-emitted join_admin after reconnect");
  });

  socket.on("connect_error", (err) => {
    console.error("❌ Admin realtime socket connect_error:", err?.message || err);
    console.warn("💡 Make sure abe-guard-ai is running on port 4000");
    console.warn("💡 Socket connection will retry automatically...");
  });

  return socket;
}

// ✅ Connect to admin-dashboard socket server (port 5000) for admin-specific events
export function connectAdminSocket() {
  const token = localStorage.getItem("adminToken") || "";

  if (!token) return null;

  if (isLocalhostUrl(ADMIN_REALTIME_URL) && !isCurrentPageLocalhost()) {
    return null;
  }

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
  adminSocket = io(ADMIN_REALTIME_URL, {
    path: "/socket.io",
    auth: { token },
    transports: ["polling", "websocket"],
    upgrade: true,
    autoConnect: true,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 500,
    reconnectionDelayMax: 2000,
    timeout: 20000,
    withCredentials: true,
  });

  adminSocket.on("connect", () => {
    console.log("✅ Admin dashboard socket connected:", adminSocket.id);
    // All connections are automatically joined to "role:all" on the server
  });

  adminSocket.on("disconnect", (reason) => {
    console.warn("⚠️ Admin dashboard socket disconnected:", reason);
  });

  adminSocket.on("reconnect", (attemptNumber) => {
    console.log("🔄 Admin dashboard socket reconnected after", attemptNumber, "attempt(s)");
  });

  adminSocket.on("connect_error", (err) => {
    console.error("❌ Admin dashboard socket connect_error:", err?.message || err);
    console.warn("💡 Make sure admin-dashboard backend is running on port 5000");
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
