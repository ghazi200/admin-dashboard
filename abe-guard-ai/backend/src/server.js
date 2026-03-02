// backend/src/server.js
require("dotenv").config();

const logger = require("./logger");

if (process.env.NODE_ENV === "production") {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 16) {
    logger.error("JWT_SECRET is required in production and must be at least 16 characters");
    process.exit(1);
  }
}

const http = require("http");
const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");

// Import Express app
const app = require("./app");

const PORT = process.env.PORT || 4000;

// ✅ DB + Models (THIS IS THE CORRECT WIRING FOR YOUR EXPORTS)
const { sequelize } = require("./config/db");
const models = require("./models");

// Create HTTP server
const server = http.createServer(app);

// Create Socket.IO server
const io = new Server(server, {
  cors: { origin: "*" },
  
  // ✅ Keepalive tuning (prevents ping timeout disconnect loops)
  pingInterval: 25000, // send ping every 25s
  pingTimeout: 60000,  // wait up to 60s for pong before disconnect
});

// Make io available inside routes/controllers
app.set("io", io);
function emitAdmin(event, payload) {
  // Get count of sockets in "admins" room for debugging
  const adminRoom = io.sockets.adapter.rooms.get("admins");
  const adminCount = adminRoom ? adminRoom.size : 0;
  
  logger.info({ event, adminCount }, "emitAdmin: Emitting to admins room");
  io.to("admins").emit(event, payload);
  if (adminCount === 0) {
    logger.warn("emitAdmin: No sockets in admins room - event will not be received");
  }
}
app.set("emitAdmin", emitAdmin);

// ========== Socket.IO Authentication Middleware ==========
// Extracts user info from JWT token and auto-joins appropriate rooms
io.use((socket, next) => {
  const token = socket.handshake.auth?.token || 
                socket.handshake.headers?.authorization?.replace('Bearer ', '') ||
                socket.handshake.query?.token;
  
  if (token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      // Extract user info based on token type
      if (decoded.adminId !== undefined || decoded.adminId === 0) {
        // Admin token
        socket.data.user = {
          type: 'admin',
          id: decoded.adminId || decoded.id,
          tenant_id: decoded.tenant_id || null,
          role: decoded.role || 'admin',
          isSuperAdmin: (decoded.role || 'admin') === 'super_admin',
        };
      } else if (decoded.guardId || decoded.id) {
        // Guard token
        socket.data.user = {
          type: 'guard',
          id: decoded.guardId || decoded.id,
          tenant_id: decoded.tenant_id || null,
        };
      }
    } catch (e) {
      // Token invalid/expired - still allow connection but no user data
      logger.warn({ err: e.message }, "Socket auth failed");
    }
  }
  
  next(); // Always allow connection (auth is optional)
});

// ========== Socket Connection Handler ==========
io.on("connection", (socket) => {
  const user = socket.data.user;
  logger.info({ socketId: socket.id, userType: user?.type }, "socket connected");

  // Auto-join rooms based on user type and tenant
  if (user?.type === 'admin') {
    // Global admin room (all admins)
    socket.join("admins");
    
    // Tenant-specific admin room
    if (user.tenant_id) {
      socket.join(`admins:${user.tenant_id}`);
      logger.info({ socketId: socket.id, tenantId: user.tenant_id }, "Admin socket joined tenant room");
    }
    
    // Super admin room (cross-tenant access)
    if (user.isSuperAdmin) {
      socket.join("super_admin");
      logger.info({ socketId: socket.id }, "Super admin socket joined super_admin room");
    }
  } else if (user?.type === 'guard') {
    // Global guard room (all guards)
    socket.join("guards");
    
    // Tenant-specific guard room
    if (user.tenant_id) {
      socket.join(`guards:${user.tenant_id}`);
      logger.info({ socketId: socket.id, tenantId: user.tenant_id }, "Guard socket joined tenant room");
    }
    
    // Per-guard room
    if (user.id) {
      socket.join(`guard:${user.id}`);
      logger.info({ socketId: socket.id, guardId: user.id }, "Guard socket joined personal room");
    }
  }

  // ========== Manual Room Join Handlers (Backward Compatibility) ==========
  
  // ✅ Admin frontend calls: socket.emit("join_admin")
  socket.on("join_admin", () => {
    socket.join("admins");
    logger.info({ socketId: socket.id }, "socket manually joined room: admins");
  });

  // ✅ Join tenant-specific admin room
  socket.on("join-admin-tenant", ({ tenantId }) => {
    if (tenantId && user?.type === 'admin') {
      socket.join(`admins:${tenantId}`);
      logger.info({ socketId: socket.id, tenantId }, "socket manually joined tenant room");
    }
  });

  // ✅ Join super admin room
  socket.on("join-super-admin", () => {
    if (user?.isSuperAdmin) {
      socket.join("super_admin");
      logger.info({ socketId: socket.id }, "socket manually joined super_admin room");
    }
  });

  // ✅ Guard UI joins a per-guard room
  socket.on("join_guard", (guardId) => {
    if (guardId) {
      socket.join(`guard:${guardId}`);
      logger.info({ socketId: socket.id, guardId }, "socket manually joined room: guard");
    }
  });

  socket.on("disconnect", (reason) => {
    logger.info({ socketId: socket.id, reason }, "socket disconnected");
  });
});


// Start late clock-in job AFTER io exists
const { startLateClockInJob } = require("./jobs/lateClockIn.job");
startLateClockInJob(io);

// ✅ Bootstrap DB + expose models to all controllers
async function bootstrap() {
  try {
    await sequelize.authenticate();
    logger.info("Sequelize connected");

    // 🔑 Controllers can now do: req.app.locals.models
    app.locals.models = { sequelize, ...models };

    server.listen(PORT, "0.0.0.0", () => {
      logger.info({ port: PORT }, "ABE Security real-time backend running (0.0.0.0)");
    });
  } catch (err) {
    logger.error({ err: err.message }, "Failed to start server");
    process.exit(1);
  }
}

bootstrap();

module.exports = { io, server };
