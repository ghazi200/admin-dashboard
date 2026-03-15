/**
 * WebSocket Gateway
 *
 * Handles only client connections and broadcasts. Subscribes to Redis for events.
 * Core API (and abe-guard-ai) publish to Redis; this service emits to Socket.IO clients.
 *
 * Env: PORT, REDIS_URL, JWT_SECRET, FRONTEND_URL (or CORS_ORIGINS), CORE_API_URL (for conversation:join)
 */

require("dotenv").config();
// So logs show this is the Gateway, not the backend (if you see "DATABASE_URL is required" you're running the wrong service)
console.log("WebSocket Gateway starting (no database)");
const express = require("express");
const http = require("http");
const { createServer } = require("http");
const { Server } = require("socket.io");
const { createClient } = require("redis");
const { createAdapter } = require("@socket.io/redis-adapter");
const jwt = require("jsonwebtoken");
const cors = require("cors");

const app = express();
const server = createServer(app);
const PORT = process.env.PORT || 4001;

// CORS for Socket.IO handshake — allow localhost + any *.vercel.app + env list
const corsOrigins = [
  "http://localhost:3000",
  "http://localhost:3001",
  "http://localhost:3002",
  "https://admin-dashboard-frontend-flax.vercel.app",
  "https://admin-dashboard-frontend-techworldstarzllcs-projects.vercel.app",
  "https://frontend-guard-ui.vercel.app",
];
const extra = (process.env.CORS_ORIGINS || process.env.FRONTEND_URL || "")
  .split(",")
  .map((s) => s.trim().replace(/[\/?]+$/, ""))
  .filter(Boolean);
extra.forEach((o) => { if (o && !corsOrigins.includes(o)) corsOrigins.push(o); });

function allowOrigin(origin, cb) {
  if (!origin) return cb(null, true);
  if (corsOrigins.includes(origin)) return cb(null, true);
  try {
    if (new URL(origin).hostname.endsWith(".vercel.app")) return cb(null, true);
  } catch (_) {}
  return cb(null, false);
}

app.use(cors({ origin: allowOrigin }));
app.get("/", (req, res) => res.json({ service: "websocket-gateway", status: "OK" }));

// Lightweight observability: connection count for monitoring
let connectedClientCount = 0;
app.get("/health", (req, res) => {
  res.json({ status: "OK", connectedClients: connectedClientCount });
});

const io = new Server(server, {
  cors: { origin: allowOrigin, credentials: true, methods: ["GET", "POST"] },
  transports: ["websocket"],
  // Shorter interval = connection looks "active" to proxies (Railway, etc.)
  pingInterval: 15000,
  // Long timeout so delayed pongs (proxy buffering, mobile) don't close the connection
  pingTimeout: 120000,
  connectTimeout: 45000,
  maxHttpBufferSize: 1e6,
});

// JWT auth (same as Core API)
io.use((socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error("Unauthorized"));

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (decoded.adminId || decoded.role === "admin" || decoded.role === "super_admin") {
      socket.admin = {
        id: decoded.adminId || decoded.id,
        role: decoded.role,
        permissions: decoded.permissions || [],
        tenant_id: decoded.tenant_id || null,
      };
    }
    if (decoded.guardId || (decoded.role === "guard" && !socket.admin)) {
      socket.guard = {
        id: decoded.guardId || decoded.id,
        role: decoded.role || "guard",
        tenant_id: decoded.tenant_id || null,
      };
    }
    if (!socket.admin && !socket.guard) {
      return next(new Error("Invalid token: must be admin or guard"));
    }
    next();
  } catch (err) {
    next(new Error("Unauthorized"));
  }
});

// Participant ID for messaging rooms (must match Core API messagingId logic)
function toParticipantId(userType, userId) {
  if (userId == null) return null;
  const crypto = require("crypto");
  const s = String(userId);
  if (s.length === 36 && s.includes("-")) return s;
  const prefix = userType === "admin" ? "admin-messaging-" : "guard-messaging-";
  const buf = crypto.createHash("sha256").update(prefix + s).digest();
  const hex = buf.slice(0, 16).toString("hex");
  return hex.replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, "$1-$2-$3-$4-$5");
}

io.on("connection", (socket) => {
  connectedClientCount++;
  console.log("Admin connected:", socket.id, "total:", connectedClientCount);

  socket.conn.on("close", (reason) => {
    console.log("Transport closed:", socket.id, reason);
  });

  socket.join("role:all");
  if (socket.admin) {
    socket.join("role:admin");
    if (socket.admin.permissions && socket.admin.permissions.includes("supervisor")) {
      socket.join("role:supervisor");
    }
    if (socket.admin.tenant_id) {
      socket.join(`tenant:${socket.admin.tenant_id}`);
    }
    const pid = toParticipantId("admin", socket.admin.id);
    if (pid) socket.join(`admin:${pid}`);
  }
  if (socket.guard) {
    socket.join(`guard:${socket.guard.id}`);
    if (socket.guard.tenant_id) {
      socket.join(`tenant:${socket.guard.tenant_id}`);
    }
    const pid = toParticipantId("guard", socket.guard.id);
    if (pid) socket.join(`guard:${pid}`);
  }

  socket.on("disconnect", (reason) => {
    connectedClientCount = Math.max(0, connectedClientCount - 1);
    console.log("Socket disconnected:", socket.id, reason, "total:", connectedClientCount);
  });

  // conversation:join — verify with Core API then join room
  socket.on("conversation:join", async (data) => {
    const conversationId = data?.conversationId;
    const coreUrl = (process.env.CORE_API_URL || "").replace(/[\/?]+$/, "");
    const token = socket.handshake.auth?.token;
    if (!coreUrl || !token || !conversationId) {
      socket.emit("error", { message: "Missing config or conversationId" });
      return;
    }
    try {
      const res = await fetch(`${coreUrl}/api/internal/socket/join-conversation`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ conversationId }),
      });
      if (res.ok) {
        socket.join(`conversation:${conversationId}`);
      } else {
        socket.emit("error", { message: "Not a participant in this conversation" });
      }
    } catch (e) {
      socket.emit("error", { message: "Failed to join conversation" });
    }
  });

  socket.on("conversation:leave", (data) => {
    const id = data?.conversationId;
    if (id) socket.leave(`conversation:${id}`);
  });
});

function isRedisUrlValid(url) {
  if (!url || typeof url !== "string") return false;
  const u = url.trim();
  if (!u) return false;
  try {
    const parsed = new URL(u);
    return parsed.protocol === "redis:" || parsed.protocol === "rediss:";
  } catch (_) {
    return false;
  }
}

async function main() {
  const rawRedis = process.env.REDIS_URL || process.env.REDIS_PRIVATE_URL || "";
  const redisUrl = rawRedis.trim();
  const isProduction = process.env.NODE_ENV === "production";

  if (!redisUrl) {
    console.warn("REDIS_URL not set — Redis adapter disabled, single-instance only");
    if (isProduction) {
      console.warn("Production: set REDIS_URL (e.g. Railway Redis) so the gateway receives events from Core API and can scale horizontally.");
    }
  } else if (!isRedisUrlValid(redisUrl)) {
    console.warn("REDIS_URL is invalid (must be redis://... or rediss://...). Check Railway Variables. Redis adapter disabled.");
  } else {
    try {
      const pubClient = createClient({ url: redisUrl });
      const subClient = pubClient.duplicate();
      await pubClient.connect();
      await subClient.connect();
      io.adapter(createAdapter(pubClient, subClient));
      console.log("Redis adapter attached");
    } catch (e) {
      console.warn("Redis connect failed:", e.message);
    }
  }

  const redisOk = redisUrl && isRedisUrlValid(redisUrl);
  // Separate subscriber for app channel (adapter uses its own subClient)
  if (redisOk) {
    try {
      const eventsSub = createClient({ url: redisUrl });
      await eventsSub.connect();
      await eventsSub.subscribe("realtime:events");
      eventsSub.on("message", (channel, message) => {
        if (channel !== "realtime:events") return;
        try {
          const msg = JSON.parse(message);
          const rooms = Array.isArray(msg.rooms) ? msg.rooms : [msg.room].filter(Boolean);
          const type = msg.type;
          const payload = msg.payload;
          if (!type) return;
          for (const room of rooms) {
            io.to(room).emit(type, payload);
          }
        } catch (e) {
          console.warn("Invalid Redis message:", e.message);
        }
      });
      console.log("Subscribed to realtime:events");
    } catch (e) {
      console.warn("Redis subscribe failed:", e.message);
    }
  }

  server.listen(PORT, () => {
    console.log("WebSocket Gateway listening on port", PORT);
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
