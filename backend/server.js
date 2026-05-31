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
    logger.error("JWT_SECRET is required in production and must be at least 16 characters. In Railway: open this service → Variables → add JWT_SECRET with a long random string (e.g. 32+ chars). See backend/RAILWAY_VARIABLES.txt");
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

// Root + /health are registered AFTER CORS below so guard mobile WebView fetch() gets ACAO headers.

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
// Railway Postgres often uses database name "postgres" — excluding it caused deploy crash (process.exit).
const REQUIRED_DB_NAMES = ["abe_guard", "abe-guard", "railway", "postgres"];
function isAllowedDb(name) {
  if (!name) return false;
  if (String(process.env.SKIP_DB_NAME_CHECK).toLowerCase() === "true") return true;
  const n = String(name).trim();
  const lower = n.toLowerCase();
  if (REQUIRED_DB_NAMES.includes(n) || lower === "railway" || lower === "postgres") return true;
  const extra = process.env.EXTRA_ALLOWED_DB_NAMES;
  if (extra) {
    const allowed = extra.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
    if (allowed.includes(lower)) return true;
  }
  return false;
}

// Log which DB config points to (from DATABASE_URL or DB_NAME) — only if DEBUG_STARTUP
if (process.env.DEBUG_STARTUP) {
  const dbFromUrl = process.env.DATABASE_URL?.split("/").pop()?.split("?")[0] || process.env.DB_NAME || "(not set)";
  logger.info({ dbFromUrl, required: REQUIRED_DB_NAMES.includes(dbFromUrl), jwtPresent: Boolean(process.env.JWT_SECRET) }, "Database config / JWT");
}

// ✅ Middleware FIRST
const cors = require("cors");

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

// Allow all origins so guard mobile app (Capacitor/WebView) can reach /health and /auth/login.
// Set CORS_ORIGINS_ONLY=true in .env to restrict to CORS_ORIGINS list instead.
const allowAllOrigins = process.env.CORS_ORIGINS_ONLY !== "true";
app.use(
  cors({
    origin: (origin, callback) => {
      if (allowAllOrigins) return callback(null, true);
      if (!origin || origin === "null") return callback(null, true);
      if (corsOrigins.includes(origin)) return callback(null, true);
      try {
        const u = new URL(origin);
        const h = u.hostname || "";
        if (h.endsWith(".vercel.app") || h.endsWith(".up.railway.app") || h.includes(".railway.app")) return callback(null, true);
      } catch (_) {}
      if (origin.startsWith("http://10.0.2.2") || origin.startsWith("http://localhost") || origin.startsWith("http://127.0.0.1") || origin.startsWith("capacitor://") || origin.startsWith("file://")) {
        return callback(null, true);
      }
      callback(null, false);
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.options("*", cors());

function sendTimeClockReady(req, res) {
  res.json({
    ok: true,
    service: "admin-dashboard-backend",
    check: "time-clock-ready",
    postClockIn: "/api/guard/shifts/:shiftId/clock-in",
    postClockInLegacy: "/shifts/:shiftId/clock-in",
    note: "If you still get 404 on clock-in after seeing this JSON, redeploy failed or wrong service.",
  });
}

// After CORS: WebView/Capacitor "Test connection" and cross-origin reads work
app.get("/", (req, res) =>
  res.json({
    service: "admin-dashboard-backend",
    status: "OK",
    health: "/health",
    ready: "/health/ready",
    timeClockReady: "/time-clock-ready",
  })
);
app.get("/health", (req, res) => res.json({ status: "OK" }));
/** Root-level check (no /api prefix) — use this URL in browser if /api/guard/time-clock-ready 404s on an old proxy */
app.get("/time-clock-ready", sendTimeClockReady);

// Request ID for structured logs (attach to req and to logger child)
app.use((req, res, next) => {
  req.id = req.headers["x-request-id"] || crypto.randomBytes(8).toString("hex");
  req.log = logger.child({ reqId: req.id, method: req.method, url: req.originalUrl });
  next();
});

// Security headers (production-ready)
app.use(
  helmet({
    contentSecurityPolicy: false,
    // Required for guard mobile app (Capacitor WebView) to read fetch() responses from this API
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);

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
  max: parseInt(process.env.AUTH_RATE_LIMIT_MAX || "30", 10),
  message: { message: "Too many login attempts; try again later." },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // only count failed attempts so successful login doesn't block
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
// Guard punch routes MUST be registered before app.use("/shifts", ...) or POST /shifts/:id/clock-in never reaches them.
const authGuardPunch = require("./src/middleware/authGuard");
const guardTimePunchCtrl = require("./src/controllers/guardTimePunch.controller");
const guardShiftsControllerEarly = require("./src/controllers/guardShifts.controller");
app.post("/shifts/accept/:shiftId", authGuardPunch, guardShiftsControllerEarly.acceptGuardShift);
app.post("/shifts/:shiftId/clock-in", authGuardPunch, guardTimePunchCtrl.clockIn);
app.post("/shifts/:shiftId/clock-out", authGuardPunch, guardTimePunchCtrl.clockOut);
app.post("/shifts/:shiftId/break-start", authGuardPunch, guardTimePunchCtrl.breakStart);
app.post("/shifts/:shiftId/break-end", authGuardPunch, guardTimePunchCtrl.breakEnd);
app.post("/shifts/:shiftId/running-late", authGuardPunch, guardTimePunchCtrl.runningLate);
// Also support /shifts path for compatibility (admin JWT list/get/update on same prefix)
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

// Guard personal dashboard (guard-ui) — MUST be registered BEFORE app.use("/api/guard", ...).
// The /api/guard mount matches all /api/guard/* paths; the auth router only has POST /login, so GET /dashboard
// would otherwise fall through to the catch-all /api handler and return 404.
const authGuard = require("./src/middleware/authGuard");
const { getGuardDashboard } = require("./src/controllers/guardDashboard.controller");
const guardShiftsController = guardShiftsControllerEarly;
const guardTimePunchController = require("./src/controllers/guardTimePunch.controller");
const guardOvertimeController = require("./src/controllers/guardOvertime.controller");
const guardUiStubs = require("./src/controllers/guardUiStubs.controller");
const adminScheduleController = require("./src/controllers/adminSchedule.controller");

app.get("/api/guard/dashboard", authGuard, getGuardDashboard);
// Weekly building schedule (same payload as GET /api/admin/schedule; guard JWT + tenant)
app.get("/api/guard/schedule", authGuard, adminScheduleController.getSchedule);
// Legacy guard-ui builds: GET {GUARD_API_URL}/schedule (no /api/guard prefix)
app.get("/schedule", authGuard, adminScheduleController.getSchedule);
// Guard Home: shifts + state (never use GET /shifts — that is admin JWT only on this server)
app.get("/api/guard/shifts/:shiftId/state", authGuard, guardShiftsController.getGuardShiftState);
app.get("/api/guard/shifts", authGuard, guardShiftsController.listGuardShifts);
// Same as GET /time-clock-ready (kept for docs that mention /api/guard/…)
app.get("/api/guard/time-clock-ready", sendTimeClockReady);
// Time clock — MUST use /api/guard/shifts/... (not /shifts/...) so this is registered BEFORE app.use("/shifts", adminShiftsRoutes) is irrelevant; avoids admin router eating POST /shifts/*/clock-in.
app.post("/api/guard/shifts/:shiftId/clock-in", authGuard, guardTimePunchController.clockIn);
app.post("/api/guard/shifts/:shiftId/clock-out", authGuard, guardTimePunchController.clockOut);
app.post("/api/guard/shifts/:shiftId/break-start", authGuard, guardTimePunchController.breakStart);
app.post("/api/guard/shifts/:shiftId/break-end", authGuard, guardTimePunchController.breakEnd);
app.post("/api/guard/shifts/:shiftId/running-late", authGuard, guardTimePunchController.runningLate);
app.post("/api/guard/shifts/:shiftId/accept", authGuard, guardShiftsController.acceptGuardShift);
app.get("/api/guard/overtime/status/:shiftId", authGuard, guardOvertimeController.getOvertimeStatus);
app.get("/api/guard/overtime/offers", authGuard, guardOvertimeController.getOvertimeOffers);
app.post("/api/guard/overtime/request", authGuard, guardOvertimeController.requestOvertime);
app.post("/api/guard/overtime/offers/:offerId/accept", authGuard, guardOvertimeController.acceptOvertimeOffer);
app.post("/api/guard/overtime/offers/:offerId/decline", authGuard, guardOvertimeController.declineOvertimeOffer);

// Guard callouts: guard-ui posts to /callouts/* (historical abe-guard-ai API).
// This backend is the unified Railway host, so proxy to abe-guard-ai when configured.
function getAbeGuardAiBase() {
  const raw = process.env.ABE_GUARD_AI_URL || process.env.GUARD_AI_URL || "";
  const trimmed = String(raw).trim().replace(/\/+$/, "");
  if (!trimmed) return "";
  // Accept values like "foo.up.railway.app" (add https://) or full https://...
  if (!/^https?:\/\//i.test(trimmed)) return `https://${trimmed}`;
  return trimmed;
}

async function proxyToAbeGuardAi(req, res, method, path, body) {
  const base = getAbeGuardAiBase();
  if (!base) {
    return res.status(501).json({
      message: "Callouts service not configured. Set ABE_GUARD_AI_URL on the backend (Railway Variables).",
      needed: "ABE_GUARD_AI_URL=https://<your-abe-guard-ai-backend>.up.railway.app",
    });
  }
  try {
    const axios = require("axios");
    const url = `${base}${path.startsWith("/") ? path : `/${path}`}`;
    const auth = req.headers.authorization ? { Authorization: req.headers.authorization } : {};
    const r = await axios.request({
      url,
      method,
      data: body,
      headers: { "Content-Type": "application/json", Accept: "application/json", ...auth },
      timeout: 60000,
      validateStatus: () => true,
    });
    return res.status(r.status).json(r.data);
  } catch (e) {
    const msg = e?.message || String(e);
    return res.status(502).json({
      message: "Callouts proxy failed",
      error: msg,
      hint: "Verify ABE_GUARD_AI_URL is the public abe-guard-ai backend URL (include https://).",
    });
  }
}

app.post("/callouts/trigger", authGuard, async (req, res) => {
  const shiftId = req.body?.shiftId;
  const reason = req.body?.reason;
  const payload = {
    shiftId,
    reason,
    callerGuardId: req.guard?.id || null,
    tenantId: req.guard?.tenant_id || null,
  };
  return proxyToAbeGuardAi(req, res, "POST", "/callouts/trigger", payload);
});

app.post("/callouts/:calloutId/respond", authGuard, async (req, res) => {
  const calloutId = String(req.params.calloutId || "").trim();
  return proxyToAbeGuardAi(req, res, "POST", `/callouts/${encodeURIComponent(calloutId)}/respond`, {
    response: req.body?.response,
  });
});
// Notifications / alerts stubs (guard JWT) — avoids hitting admin-only routes or 404
app.get("/api/guard/notifications/unread-count", authGuard, guardUiStubs.guardNotificationsUnreadCount);
app.get("/api/guard/notifications", authGuard, guardUiStubs.listGuardNotifications);
app.post("/api/guard/notifications/mark-all-read", authGuard, guardUiStubs.markAllGuardNotificationsRead);
app.post("/api/guard/notifications/:id/read", authGuard, guardUiStubs.markGuardNotificationRead);
app.get("/api/guard/alerts/combined/:shiftId", authGuard, guardUiStubs.getCombinedAlerts);

// Incident report: list sites for guard tenant (guard-ui GET /sites or /api/guard/sites)
const guardSitesRoutes = require("./src/routes/guardSites.routes");
app.use("/api/guard/sites", guardSitesRoutes);
app.use("/sites", guardSitesRoutes);

const guardAuthRoutes = require("./src/routes/guardAuth.routes");
app.use("/api/guard", guardAuthRoutes);
// Alias so guard-ui can use admin backend for login when REACT_APP_GUARD_API_URL points here
app.use("/auth", guardAuthRoutes);

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
app.get("/api/backend-ping", (req, res) =>
  res.json({
    ok: true,
    service: "admin-dashboard-backend",
    timeClockReady: "/time-clock-ready",
  })
);

// Debug: see exactly what path/method the server receives (proves deploy is latest)
app.get("/api/admin/login-debug", (req, res) => {
  res.json({
    message: "login-endpoint-active",
    path: req.originalUrl,
    method: req.method,
    pathNoQuery: (req.originalUrl || "").split("?")[0],
  });
});

// Guard app login: create/update bob@abe.com — MUST be before catch-all /api (otherwise 404)
const bcryptSeedBob = require("bcryptjs");
const { DEFAULT_TEST_TENANT_ID: TENANT_SEED_BOB } = require("./src/config/tenantConfig");
app.post("/api/dev/seed-guard-bob", async (req, res) => {
  try {
    const { Guard } = req.app.locals.models;
    const email = "bob@abe.com";
    const password = "password123";
    const hashed = await bcryptSeedBob.hash(password, 10);
    let guard = await Guard.findOne({ where: { email } });
    if (guard) {
      await guard.update({
        password_hash: hashed,
        failed_login_attempts: 0,
        locked_until: null,
        name: guard.name || "Bob Smith",
        tenant_id: guard.tenant_id || TENANT_SEED_BOB,
      });
      return res.json({
        ok: true,
        created: false,
        email,
        creds: { email, password },
        note: "Guard bob@abe.com password set to password123.",
      });
    }
    guard = await Guard.create({
      name: "Bob Smith",
      email,
      password_hash: hashed,
      tenant_id: TENANT_SEED_BOB,
    });
    return res.json({
      ok: true,
      created: true,
      email,
      creds: { email, password },
      note: "Guard bob@abe.com created.",
    });
  } catch (e) {
    console.error("seed-guard-bob failed:", e);
    return res.status(500).json({ message: "Seed failed", error: e.message });
  }
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

// ✅ Initialize callout notification listener (optional; must not crash boot if misconfigured)
try {
  const { initCalloutNotificationListener } = require("./src/services/calloutNotificationListener");
  initCalloutNotificationListener(app);
} catch (e) {
  logger.warn({ err: e?.message }, "calloutNotificationListener init skipped");
}

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
        logger.error(
          { dbName },
          "Database name not in allowlist. Set DATABASE_URL to use abe_guard / railway / postgres, or set EXTRA_ALLOWED_DB_NAMES=mydb or SKIP_DB_NAME_CHECK=true (emergency only)."
        );
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

        // Realtime: log Redis publisher status so operators know events will reach the WebSocket Gateway
        try {
          const { getPublisher } = require("./src/services/realtime.service");
          const pub = await getPublisher();
          if (pub) {
            logger.info("Realtime: Redis publisher connected (events will reach WebSocket Gateway)");
          } else {
            logger.warn("Realtime: REDIS_URL not set; realtime events disabled. Set REDIS_URL so Core API can publish to the gateway.");
          }
        } catch (e) {
          logger.warn({ err: e?.message }, "Realtime: Redis publisher check failed (realtime events may be disabled)");
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
