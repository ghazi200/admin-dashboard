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

export function connectSocket() {
  const token = localStorage.getItem("adminToken") || "";

  // 🚫 Do not create socket until admin is authenticated
  if (!token) {
    console.warn("⚠️ No adminToken yet — realtime socket not started");
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

  // 🚫 Do not create socket until admin is authenticated
  if (!token) {
    console.warn("⚠️ No adminToken yet — admin socket not started");
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
