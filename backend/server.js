 /** server.js
 * ADMIN DASHBOARD BACKEND
 * ------------------------------------
 * Port: 5000
 *
 * Handles:
 * - /api/admin/login
 * - /api/admin/register
 * - /api/admin/dashboard/*
 * - /api/admin/guards
 * - /api/admin/notifications
 *
 * Real-time:
 * - Socket.IO admin events
 *
 * Frontend:
 * - admin-dashboard-frontend (port 3000)
 */

// Load .env from backend directory so DATABASE_URL is always from backend/.env (abe_guard)
const path = require("path");
const crypto = require("crypto");
const envPath = path.resolve(__dirname, ".env");
require("dotenv").config({ path: envPath });

const logger = require("./logger");

// ---------- PATCH SEQUELIZE SO ContactPreference NEVER CREATES FK ----------
// ContactPreference guardId vs guards.id type mismatch → FK cannot be implemented.
// 1) Patch Model.sync: when ContactPreference.sync() is called, create table by raw SQL (no FK) and return.
// 2) Patch Sequelize.prototype.sync: skip ContactPreference in loop and create table by raw SQL.
const Sequelize = require("sequelize");
const Model = Sequelize.Model;
const CONTACT_PREFS_SKIP = ["ContactPreference", "ContactPreferences"];

function createContactPreferencesTableRaw(seq) {
  if (!seq || seq.getDialect?.() !== "postgres") return Promise.resolve();
  return seq.query(`DROP TABLE IF EXISTS "ContactPreferences" CASCADE`).catch(() => {})
    .then(() => seq.query(`
      CREATE TABLE "ContactPreferences" (
        id SERIAL PRIMARY KEY,
        "guardId" UUID NOT NULL,
        "contactType" VARCHAR(32) NOT NULL,
        "active" BOOLEAN DEFAULT true,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `).catch(() => {}))
    .then(() => seq.query(`CREATE INDEX IF NOT EXISTS "contact_preferences_guard_id" ON "ContactPreferences" ("guardId")`).catch(() => {}));
}

const OrigModelSync = Model.sync;
Model.sync = async function (options) {
  const name = this.name;
  const t = this.options?.tableName || (typeof this.getTableName === "function" ? this.getTableName(options) : "");
  const tableName = typeof t === "string" ? t : (t?.tableName || t?.name || "");
  const isContactPref = name === "ContactPreference" || name === "ContactPreferences" || String(tableName) === "ContactPreferences";
  if (isContactPref && this.sequelize) {
    await createContactPreferencesTableRaw(this.sequelize);
    return this;
  }
  return OrigModelSync.apply(this, arguments);
};

Sequelize.prototype.sync = async function (options) {
  const opts = options || {};
  if (opts.hooks !== false) await this.runHooks("beforeBulkSync", opts).catch(() => {});
  if (opts.force) await this.drop(opts).catch(() => {});
  const allModels = this.modelManager?.models || [];
  const toSync = allModels.filter((m) => m && !CONTACT_PREFS_SKIP.includes(m.name) && m.tableName !== "ContactPreferences");
  for (const model of toSync) await model.sync(opts);
  await createContactPreferencesTableRaw(this);
  if (opts.hooks !== false) await this.runHooks("afterBulkSync", opts).catch(() => {});
  return this;
};
// ---------- END PATCH ----------

// Require JWT_SECRET in production so the app never runs with a weak/missing secret
if (process.env.NODE_ENV === "production") {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 16) {
    logger.error("JWT_SECRET is required in production and must be at least 16 characters");
    process.exit(1);
  }
  if (!process.env.DATABASE_URL || !process.env.DATABASE_URL.includes("://")) {
    logger.error("DATABASE_URL is required in production. In Railway: add variable DATABASE_URL = ${{ Postgres.DATABASE_URL }} (or paste the URL from your PostgreSQL service).");
    process.exit(1);
  }
  try {
    const u = process.env.DATABASE_URL;
    const host = u && (u.split("@")[1] || "").split("/")[0];
    logger.info({ hasDatabaseUrl: true, host: host || "(redacted)" }, "Production DATABASE_URL is set");
  } catch (_) {
    logger.info("Production DATABASE_URL is set");
  }
}

const express = require("express");
const jwt = require("jsonwebtoken");
const http = require("http");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");

const app = express();
const PORT = process.env.PORT || 5000;

// Root and health registered first so GET / never 404s (Railway/load balancer)
app.get("/", (req, res) => res.json({ service: "admin-dashboard-backend", status: "OK", health: "/health", ready: "/health/ready" }));
app.get("/health", (req, res) => res.json({ status: "OK" }));

// Cron endpoint: run shift reminders (for external cron when process may have been sleeping)
// Call: GET /api/cron/shift-reminders?secret=YOUR_CRON_SECRET or Header: X-Cron-Secret: YOUR_CRON_SECRET
app.get("/api/cron/shift-reminders", async (req, res) => {
  const secret = req.query.secret || req.get("X-Cron-Secret") || "";
  const want = process.env.CRON_SECRET;
  if (want && secret !== want) {
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }
  if (!app.locals.models) {
    return res.status(503).json({ ok: false, error: "Models not ready" });
  }
  try {
    const { runAllShiftReminders } = require("./src/services/shiftReminders.service");
    await runAllShiftReminders(app);
    return res.json({ ok: true, ran: "shift-reminders" });
  } catch (err) {
    logger.warn({ err: err?.message }, "Cron shift-reminders error");
    return res.status(500).json({ ok: false, error: err?.message || "Run failed" });
  }
});

// Correct database for all features (admin, guards, messaging)
const REQUIRED_DB_NAMES = ["abe_guard", "abe-guard", "railway"];
function isAllowedDb(name) {
  if (!name) return false;
  return REQUIRED_DB_NAMES.includes(name) || name.toLowerCase() === "railway";
}

// Log which DB config points to (from DATABASE_URL or DB_NAME) — only if DEBUG_STARTUP
if (process.env.DEBUG_STARTUP) {
  const dbFromUrl = process.env.DATABASE_URL?.split("/").pop()?.split("?")[0] || process.env.DB_NAME || "(not set)";
  logger.info({ dbFromUrl, required: REQUIRED_DB_NAMES.includes(dbFromUrl), jwtPresent: Boolean(process.env.JWT_SECRET) }, "Database config / JWT");
}

// ✅ Middleware FIRST
;const cors = require("cors");

// CORS: built-in + optional env (comma-separated: CORS_ORIGINS or GUARD_APP_URL, ADMIN_APP_URL)
const corsOrigins = [
  "http://localhost:3000", // guard-ui
  "http://localhost:3001", // admin frontend
  "http://localhost:3002",
  "capacitor://localhost", // Capacitor iOS
  "http://localhost",      // Capacitor Android
  "https://localhost",
  // Vercel admin dashboard frontends (always allow so login works even if CORS_ORIGINS env is wrong)
  "https://admin-dashboard-frontend-flax.vercel.app",
  "https://admin-dashboard-frontend-techworldstarzllcs-projects.vercel.app",
  "https://frontend-guard-ui.vercel.app",
];
[process.env.CORS_ORIGINS, process.env.GUARD_APP_URL, process.env.ADMIN_APP_URL]
  .filter(Boolean)
  .flatMap((s) => s.split(",").map((o) => o.trim().replace(/[\/?]+$/, "")).filter(Boolean))
  .forEach((o) => { if (o && !corsOrigins.includes(o)) corsOrigins.push(o); });

let productionCorsBlockWarningLogged = false;
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) {
        return callback(null, true);
      }
      if (process.env.NODE_ENV !== "production") {
        return callback(null, true);
      }
      if (corsOrigins.includes(origin)) return callback(null, true);
      // Allow any Vercel deployment (*.vercel.app)
      try {
        const u = new URL(origin);
        if (u.hostname.endsWith(".vercel.app")) return callback(null, true);
      } catch (_) {}
      if (origin.startsWith("http://10.0.2.2") || origin.startsWith("http://localhost") || origin.startsWith("capacitor://") || origin.startsWith("file://")) {
        return callback(null, true);
      }
      if (!productionCorsBlockWarningLogged) {
        productionCorsBlockWarningLogged = true;
        logger.warn({ origin }, "Production CORS: request blocked; set CORS_ORIGINS in .env to allow this origin");
      }
      callback(null, false);
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.options("*", cors());

// Request ID for structured logs (attach to req and to logger child)
app.use((req, res, next) => {
  req.id = req.headers["x-request-id"] || crypto.randomBytes(8).toString("hex");
  req.log = logger.child({ reqId: req.id, method: req.method, url: req.originalUrl });
  next();
});

// Security headers (production-ready)
app.use(helmet({ contentSecurityPolicy: false })); // CSP often needs tuning per app; disable by default

// General API rate limit (per IP). Default 500/15min so AI Agent 24 / assistant use doesn't hit limit.
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX || "500", 10),
  message: { message: "Too many requests; try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use("/api", generalLimiter);

// ✅ BODY PARSERS
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request-scoped logger (req.id + req.log for structured logs)
app.use((req, res, next) => {
  req.id = req.headers["x-request-id"] || crypto.randomBytes(8).toString("hex");
  req.log = logger.child({ reqId: req.id });
  next();
});

// ✅ Static file serving for uploads
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

/* 🔎 debug route (optional)
app.get("/debug-jwt", (req, res) => {
  const hdr = req.headers.authorization || "";
  const token = hdr.startsWith("Bearer ") ? hdr.slice(7) : null;

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    return res.json({ ok: true, decoded });
  } catch (e) {
    return res.status(401).json({
      ok: false,
      error: e.message,
      jwtSecretPresent: Boolean(process.env.JWT_SECRET),
      jwtSecretLen: process.env.JWT_SECRET?.length || 0,
    });
  }
});
*/

// ✅ Load models ONCE (Sequelize.prototype.sync already patched above)
const models = require("./src/models");
app.locals.models = models;

// Force instance-level overrides so ContactPreferences is NEVER created with FK (works even if old code calls seq.sync or ContactPreference.sync)
const seq = models?.sequelize;
if (seq) {
  // 1) Override seq.sync so any call uses safe sync (skips ContactPreference)
  if (typeof seq.sync === "function") {
    const safeSync = async function (options) {
      const opts = options || {};
      if (opts.hooks !== false) await this.runHooks("beforeBulkSync", opts).catch(() => {});
      if (opts.force) await this.drop(opts).catch(() => {});
      const skip = ["ContactPreference", "ContactPreferences"];
      const list = (this.modelManager?.models || []).filter(
        (m) => m && !skip.includes(m.name) && m.tableName !== "ContactPreferences"
      );
      for (const m of list) await m.sync(opts);
      await createContactPreferencesTableRaw(this);
      if (opts.hooks !== false) await this.runHooks("afterBulkSync", opts).catch(() => {});
      return this;
    };
    seq.sync = safeSync.bind(seq);
  }
  // 2) Intercept queryInterface.createTable so creating "ContactPreferences" uses raw SQL (no FK)
  const qi = seq.getQueryInterface?.() || seq.queryInterface;
  if (qi && typeof qi.createTable === "function") {
    const origCreateTable = qi.createTable.bind(qi);
    qi.createTable = async function (tableName, attributes, options, model) {
      const name = typeof tableName === "string" ? tableName : (tableName?.tableName ?? "");
      const isContactPrefTable = name === "ContactPreferences" || (model && (model.name === "ContactPreference" || model.options?.tableName === "ContactPreferences"));
      if (isContactPrefTable) {
        await createContactPreferencesTableRaw(seq);
        return;
      }
      return origCreateTable(tableName, attributes, options, model);
    };
  }
}

if (process.env.DEBUG_STARTUP) logger.debug({ modelKeys: Object.keys(app.locals.models || {}) }, "MODELS KEYS");

// Sync notification_preferences table on startup if it doesn't exist
(async () => {
  try {
    const { NotificationPreference } = models;
    // Check if table exists by trying to query it
    await NotificationPreference.findOne({ limit: 1 }).catch(async (err) => {
      if (err.name === "SequelizeDatabaseError" && err.message.includes("does not exist")) {
        logger.info("notification_preferences table does not exist, creating...");
        await NotificationPreference.sync({ force: false });
        logger.info("notification_preferences table created");
      }
    });
  } catch (err) {
    logger.warn({ err: err.message }, "Could not sync notification_preferences table");
  }
  try {
    const { MessageHidden } = models;
    await MessageHidden.findOne({ limit: 1 }).catch(async (err) => {
      if (err.name === "SequelizeDatabaseError" && err.message.includes("does not exist")) {
        await MessageHidden.sync({ force: false });
      }
    });
  } catch (err) {
    logger.warn({ err: err.message }, "Could not sync message_hidden table");
  }
})();

// ✅ Routes (after models)
// Internal: Gateway calls this to verify conversation membership (conversation:join)
const { toParticipantId } = require("./src/utils/messagingId");
app.post("/api/internal/socket/join-conversation", async (req, res) => {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  const { conversationId } = req.body || {};
  if (!token || !conversationId) {
    return res.status(400).json({ ok: false, error: "Missing token or conversationId" });
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userType = decoded.adminId || decoded.role === "admin" || decoded.role === "super_admin" ? "admin" : "guard";
    const userId = decoded.adminId || decoded.guardId || decoded.id;
    const participantId = toParticipantId(userType, userId);
    const models = req.app.locals.models;
    if (!models?.ConversationParticipant) {
      return res.status(503).json({ ok: false, error: "Models not ready" });
    }
    const participant = await models.ConversationParticipant.findOne({
      where: {
        conversation_id: conversationId,
        participant_type: userType,
        participant_id: participantId,
      },
    });
    if (participant) {
      return res.json({ ok: true });
    }
    return res.status(403).json({ ok: false, error: "Not a participant" });
  } catch (e) {
    if (e.name === "JsonWebTokenError" || e.name === "TokenExpiredError") {
      return res.status(401).json({ ok: false, error: "Unauthorized" });
    }
    return res.status(500).json({ ok: false, error: e?.message || "Server error" });
  }
});

const devSeedRoutes = require("./src/routes/devSeed.routes");
app.use("/api/dev", devSeedRoutes);

// Login/register: app.all catches every method so OPTIONS gets 204 and POST gets login (no 404)
const adminAuthController = require("./src/controllers/adminAuth.Controller");
const { loginValidators, handleLoginValidation } = require("./src/middleware/validateLogin");
const loginRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.AUTH_RATE_LIMIT_MAX || "10", 10),
  message: { message: "Too many login attempts; try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});

app.all("/api/admin/login", (req, res, next) => {
  const method = (req.method || "").toUpperCase();
  if (method === "OPTIONS") {
    return res.sendStatus(204);
  }
  if (method !== "POST") {
    return res.status(400).json({
      message: "Use POST with JSON body: { email, password }. This URL was called with " + req.method + ".",
      path: req.originalUrl,
    });
  }
  loginRateLimit(req, res, (err) => {
    if (err) return next(err);
    let i = 0;
    const runValidator = () => {
      if (i >= loginValidators.length) {
        return handleLoginValidation(req, res, (err2) => {
          if (err2) return next(err2);
          adminAuthController.login(req, res);
        });
      }
      loginValidators[i++](req, res, (err2) => {
        if (err2) return next(err2);
        runValidator();
      });
    };
    runValidator();
  });
});

app.all("/api/admin/register", (req, res, next) => {
  const method = (req.method || "").toUpperCase();
  if (method === "OPTIONS") return res.sendStatus(204);
  if (method !== "POST") return res.status(400).json({ message: "Use POST", path: req.originalUrl });
  adminAuthController.register(req, res);
});

app.get("/api/admin", (req, res) => res.json({ ok: true, service: "admin-api", paths: ["/api/admin/login", "/api/admin/register", "/api/admin/dashboard", "..."] }));

const adminAuthRoutes = require("./src/routes/adminAuth.routes");
app.use("/api/admin", adminAuthRoutes);

const adminShiftsRoutes = require("./src/routes/adminShifts.routes");
app.use("/api/admin/shifts", adminShiftsRoutes);

const analyticsRoutes = require("./src/routes/analytics.routes");
app.use("/api/admin/analytics", analyticsRoutes);
// Also support /shifts path for compatibility (if frontend calls it directly)
app.use("/shifts", adminShiftsRoutes);

const adminNotificationsRoutes = require("./src/routes/adminNotifications.routes");
app.use("/api/admin/notifications", adminNotificationsRoutes);

const adminMessagesRoutes = require("./src/routes/adminMessages.routes");
app.use("/api/admin/messages", adminMessagesRoutes);

// Ensure DELETE .../conversations/:id/messages/:id is matched (router mount can miss it in some setups)
const MESSAGE_DELETE_TIMEOUT_MS = 25000;
app.delete("/api/admin/messages/conversations/:conversationId/messages/:messageId", (req, res, next) => {
  const origUrl = req.url;
  const pathOnly = (req.originalUrl || req.url || "").split("?")[0];
  req.url = pathOnly.replace(/^\/api\/admin\/messages/, "") || "/";
  let settled = false;
  const done = (err) => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    req.url = origUrl;
    next(err);
  };
  const timer = setTimeout(() => {
    if (settled) return;
    settled = true;
    req.url = origUrl;
    if (!res.headersSent) res.status(504).json({ message: "Delete request timed out" });
  }, MESSAGE_DELETE_TIMEOUT_MS);
  adminMessagesRoutes(req, res, done);
});

const adminDashboardRoutes = require("./src/routes/adminDashboard.routes");
app.use("/api/admin/dashboard", adminDashboardRoutes);

const adminAIRankingRoutes = require("./src/routes/adminAIRanking.routes");
app.use("/api/admin/ai-ranking", adminAIRankingRoutes);

const adminGuardsRoutes = require("./src/routes/adminGuards.routes");
app.use("/api/admin/guards", adminGuardsRoutes);

const adminUsersRoutes = require("./src/routes/adminUsers.routes");
app.use("/api/admin/users", adminUsersRoutes);
// Also support /users path for compatibility (if frontend calls it directly)
app.use("/users", adminUsersRoutes);

const adminScheduleRoutes = require("./src/routes/adminSchedule.routes");
app.use("/api/admin/schedule", adminScheduleRoutes);

const adminCommandCenterRoutes = require("./src/routes/adminCommandCenter.routes");
app.use("/api/admin/command-center", adminCommandCenterRoutes);

const calloutRiskRoutes = require("./src/routes/calloutRisk.routes");
app.use("/api/admin/callout-risk", calloutRiskRoutes);

const shiftOptimizationRoutes = require("./src/routes/shiftOptimization.routes");
app.use("/api/admin/shift-optimization", shiftOptimizationRoutes);

const reportBuilderRoutes = require("./src/routes/reportBuilder.routes");
app.use("/api/admin/reports", reportBuilderRoutes);

const scheduledReportsRoutes = require("./src/routes/scheduledReports.routes");
app.use("/api/admin/reports/scheduled", scheduledReportsRoutes);

const overtimeOffersRoutes = require("./src/routes/overtimeOffers.routes");
app.use("/api/admin/overtime", overtimeOffersRoutes);

const superAdminRoutes = require("./src/routes/superAdmin.routes");
app.use("/api/super-admin", superAdminRoutes);

const scheduleEmailRoutes = require("./src/routes/scheduleEmail.routes");
app.use("/api/admin/schedule-email", scheduleEmailRoutes);

const emailSchedulerSettingsRoutes = require("./src/routes/emailSchedulerSettings.routes");
app.use("/api/admin/email-scheduler-settings", emailSchedulerSettingsRoutes);

const assistantRoutes = require("./src/routes/assistant.routes");
app.use("/api/admin/assistant", assistantRoutes);

const scheduleGenerationRoutes = require("./src/routes/scheduleGeneration.routes");
app.use("/api/admin/schedule-generation", scheduleGenerationRoutes);

const fairnessRebalancingRoutes = require("./src/routes/fairnessRebalancing.routes");
app.use("/api/admin/fairness-rebalancing", fairnessRebalancingRoutes);

const guardShiftManagementRoutes = require("./src/routes/guardShiftManagement.routes");
app.use("/api/guards", guardShiftManagementRoutes);

const guardMessagesRoutes = require("./src/routes/guardMessages.routes");
app.use("/api/guard/messages", guardMessagesRoutes);

const guardAuthRoutes = require("./src/routes/guardAuth.routes");
app.use("/api/guard", guardAuthRoutes);

const geographicDashboardRoutes = require("./src/routes/geographicDashboard.routes");
app.use("/api/admin/geographic", geographicDashboardRoutes);

const ownerDashboardRoutes = require("./src/routes/ownerDashboard.routes");
app.use("/api/admin/owner-dashboard", ownerDashboardRoutes);

const clockReportRoutes = require("./src/routes/clockReport.routes");
app.use("/api/admin/clock-report", clockReportRoutes);

if (process.env.NODE_ENV !== "production") {
  logger.info("Geographic dashboard: GET/POST /api/admin/geographic/sites, POST /route-optimize, GET /analytics");
}

const messageUploadRoutes = require("./src/routes/messageUpload.routes");
app.use("/api/messages/upload", messageUploadRoutes);

const adminShiftSwapRoutes = require("./src/routes/adminShiftSwap.routes");
app.use("/api/admin/shift-swaps", adminShiftSwapRoutes);

// Backend check: proves this URL is the Node API (not frontend)
app.get("/api/backend-ping", (req, res) => res.json({ ok: true, service: "admin-dashboard-backend" }));

// Debug: see exactly what path/method the server receives (proves deploy is latest)
app.get("/api/admin/login-debug", (req, res) => {
  res.json({
    message: "login-endpoint-active",
    path: req.originalUrl,
    method: req.method,
    pathNoQuery: (req.originalUrl || "").split("?")[0],
  });
});

// Catch ALL /api requests — handle OPTIONS (CORS preflight) and login/register
app.use("/api", (req, res, next) => {
  if (res.headersSent) return next();
  const raw = (req.originalUrl || req.url || "").split("?")[0] || "";
  const pathOnly = raw.replace(/\/+$/, "");

  // CORS preflight: browser sends OPTIONS before POST; must return 2xx or POST is blocked
  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }

  const isLogin = pathOnly.includes("admin") && pathOnly.includes("login");
  const isRegister = pathOnly.includes("admin") && pathOnly.includes("register");
  if (req.method === "POST" && (isLogin || isRegister)) {
    const adminAuthController = require("./src/controllers/adminAuth.Controller");
    if (isLogin) {
      return adminAuthController.login(req, res);
    }
    return adminAuthController.register(req, res);
  }

  (req.log || logger).warn({ method: req.method, url: req.originalUrl }, "Unmatched API path [404]");
  res.status(404).json({ error: "Not Found", path: req.originalUrl });
});

// Readiness: DB connected — use for load balancer / k8s readiness probe
const READINESS_TIMEOUT_MS = 5000;
app.get("/health/ready", async (req, res) => {
  const seq = req.app.locals?.models?.sequelize;
  if (!seq) {
    return res.status(503).json({ status: "not ready", database: "no connection" });
  }
  try {
    await Promise.race([
      seq.authenticate(),
      new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), READINESS_TIMEOUT_MS)),
    ]);
    return res.json({ status: "ready", database: "connected" });
  } catch (e) {
    return res.status(503).json({
      status: "not ready",
      database: "disconnected",
      error: process.env.NODE_ENV === "production" ? undefined : e?.message,
    });
  }
});

// ✅ HTTP server (realtime via WebSocket Gateway + Redis; no Socket.IO in this process)
const server = http.createServer(app);

const { emitToRealtime } = require("./src/services/realtime.service");
app.locals.emitToRealtime = emitToRealtime;
app.set("emitToRealtime", emitToRealtime);

// ✅ Initialize callout notification listener (connects to abe-guard-ai, publishes to Redis)
const { initCalloutNotificationListener } = require("./src/services/calloutNotificationListener");
initCalloutNotificationListener(app);

// ✅ Global Express error handler (after routes)
app.use((err, req, res, next) => {
  (req.log || logger).error({
    method: req.method,
    url: req.originalUrl,
    message: err.message,
    stack: err.stack,
  }, "Express error");

  res.status(500).json({
    message: "Internal Server Error",
    error: err.message,
  });
});

// Startup timeout so we don't hang forever on DB (default 45s)
const STARTUP_TIMEOUT_MS = parseInt(process.env.STARTUP_TIMEOUT_MS || "45000", 10);

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`${label || "Operation"} timed out after ${ms}ms`)), ms)
    ),
  ]);
}

// ✅ Start server after DB verification and sync
(async () => {
  try {
    const seq = models?.sequelize;
    if (!seq) {
      logger.error("models.sequelize not found");
      process.exit(1);
    }

    await withTimeout(seq.authenticate(), STARTUP_TIMEOUT_MS, "Database authenticate");
    const dialect = seq.getDialect();
    if (dialect === "postgres") {
      const [rows] = await seq.query("SELECT current_database() AS db_name");
      const dbName = rows?.[0]?.db_name;
      if (!dbName) {
        logger.error("Could not read current database name");
        process.exit(1);
      }
      if (!isAllowedDb(dbName)) {
        logger.error({ dbName }, "Wrong database. Backend must use abe_guard or railway. Set DATABASE_URL to postgresql://.../abe_guard or .../railway and restart");
        process.exit(1);
      }
      logger.info({ dbName }, "Database ready (messaging and all APIs use this)");
    }

    await createContactPreferencesTableRaw(seq);
      const reset = String(process.env.RESET_DB).toLowerCase() === "true";
      const opts = { force: reset };
      // Ensure tenants table exists first (other models may reference it)
      const Tenant = models?.Tenant;
      if (Tenant) {
        try {
          await withTimeout(Tenant.sync(opts), STARTUP_TIMEOUT_MS, "sync Tenant");
        } catch (err) {
          logger.warn({ err: err?.message }, "Tenant.sync failed (continuing)");
        }
      }
      const skipNames = ["ContactPreference", "ContactPreferences", "Tenant"];
      let synced = 0;
      for (const name of Object.keys(seq.models || {})) {
        const m = seq.models[name];
        const tbl = m.options?.tableName ?? (typeof m.getTableName === "function" ? m.getTableName() : "");
        if (!m || skipNames.includes(name) || tbl === "ContactPreferences" || tbl === "tenants") continue;
        try {
          await withTimeout(m.sync(opts), STARTUP_TIMEOUT_MS, `sync ${name}`);
          synced++;
        } catch (err) {
          const msg = err?.message || "";
          if (msg.includes("ContactPreferences_guardId_fkey")) {
            await createContactPreferencesTableRaw(seq);
            logger.warn({ model: name }, "Skipped sync after FK error; ContactPreferences created without FK");
          } else {
            throw err;
          }
        }
      }
      await createContactPreferencesTableRaw(seq);
      logger.info(reset ? "DB reset complete (force: true)" : "Sequelize synced", { modelsSynced: synced });

    server.listen(PORT, "0.0.0.0", () => {
      logger.info({ port: PORT }, "Admin Dashboard backend running (0.0.0.0)");

      // Run post-listen init in background so server stays responsive if something hangs
      (async () => {
        try {
          const emailService = require("./src/services/email.service");
          emailService.initEmailTransporter();

          const emailSchedulerManager = require("./src/services/emailSchedulerManager.service");
          await emailSchedulerManager.initializeSchedulers(models);
          app.set("emailSchedulerManager", emailSchedulerManager);
        } catch (e) {
          logger.warn({ err: e?.message }, "Email/scheduler init failed (server still running)");
        }

        try {
          const unfilledShiftNotification = require("./src/services/unfilledShiftNotification.service");
          const checkInterval = parseInt(process.env.UNFILLED_SHIFT_CHECK_INTERVAL_MINUTES || "5", 10);
          unfilledShiftNotification.startUnfilledShiftChecker(models, app, checkInterval);
          logger.info("Unfilled shift notification checker initialized");
        } catch (e) {
          logger.warn({ err: e?.message }, "Unfilled shift checker init failed");
        }

        try {
          const shiftRemindersService = require("./src/services/shiftReminders.service");
          shiftRemindersService.scheduleShiftReminders(app);
          logger.info("Shift reminders service initialized");
        } catch (e) {
          logger.warn({ err: e?.message }, "Shift reminders init failed");
        }
      })();
    });
  } catch (e) {
    const msg = e?.message || String(e);
    logger.error({ err: msg, stack: e?.stack }, "Startup failed");
    if (msg.includes("timed out")) {
      logger.error("Database may be unreachable or slow. Check PostgreSQL and DATABASE_URL.");
    }
    if (msg.includes("ECONNREFUSED") || msg.includes("connect")) {
      logger.error("Cannot connect to database. Check DATABASE_URL in Railway Variables (use the URL from your Postgres service).");
    }
    process.exit(1);
  }
})();
