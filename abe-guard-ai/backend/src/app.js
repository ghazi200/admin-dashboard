/**
 * ABE GUARD AI BACKEND
 * ------------------------------------
 * Port: 4000
 *
 * Handles:
 * - /api/guard/*
 * - /api/ai/policy
 * - /api/ai/payroll
 * - /api/time/*
 * - /api/sms
 * - /api/email
 *
 * Used by:
 * - Guard UI (port 3001)
 * - Admin Dashboard (policy + AI views)
 */

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const logger = require("./logger");

const app = express(); // ✅ must be before app.use

app.use(helmet({ contentSecurityPolicy: false }));

const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX || "200", 10),
  message: { message: "Too many requests; try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use("/auth", generalLimiter);
app.use("/api", generalLimiter);

// Routes
const authRoutes = require("./routes/auth.routes");
const shiftRoutes = require("./routes/shifts.routes");
const calloutRoutes = require("./routes/callouts.routes");
const guardPolicyRoutes = require("./routes/guardPolicy.routes");
const scheduleRoutes = require("./routes/schedule.routes");

// ✅ Admin
const adminRoutes = require("./routes/admin.routes");
const adminTenantsRoutes = require("./routes/adminTenants.routes");

// Middleware
// CORS configuration - allow specific origins when credentials are used
const allowedOrigins = [
  "http://localhost:3000", // Guard UI (default)
  "http://localhost:3001", // Admin Dashboard frontend
  "http://localhost:3002",
  "http://localhost:5173", // Vite dev server
  "http://127.0.0.1:3000",
  "http://127.0.0.1:3001",
  "capacitor://localhost", // Capacitor iOS
  "http://localhost",     // Capacitor Android
  "https://localhost",
  process.env.FRONTEND_URL,
  process.env.ADMIN_DASHBOARD_URL,
  process.env.GUARD_APP_URL,
].filter(Boolean);
// Optional: comma-separated CORS_ORIGINS for production
(process.env.CORS_ORIGINS || "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean)
  .forEach((o) => { if (!allowedOrigins.includes(o)) allowedOrigins.push(o); });

let productionCorsBlockWarningLogged = false;
app.use(
  cors({
    origin: (origin, callback) => {
      try {
        // Allow requests with no origin (mobile apps, curl, Postman)
        if (!origin) {
          logger.info("CORS: Allowing request with no origin");
          return callback(null, true);
        }
        // In development, allow all origins (so Android/iOS app always works when hitting Mac IP)
        if (process.env.NODE_ENV !== "production") {
          logger.info({ origin }, "CORS: Allowing origin (dev)");
          return callback(null, true);
        }
        logger.debug({ origin }, "CORS request from origin");
        if (allowedOrigins.includes(origin)) {
          logger.info({ origin }, "CORS: Allowing origin");
          callback(null, true);
        } else if (origin.includes("localhost") || origin.startsWith("capacitor://") || origin.startsWith("file://")) {
          logger.info({ origin }, "CORS: Allowing origin");
          callback(null, true);
        } else {
          if (!productionCorsBlockWarningLogged) {
            productionCorsBlockWarningLogged = true;
            logger.warn({ origin }, "Production CORS: request blocked; set CORS_ORIGINS in .env to allow this origin");
          }
          callback(null, false);
        }
      } catch (err) {
        logger.error({ err: err.message }, "CORS error handler error");
        callback(err);
      }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
    preflightContinue: false,
    optionsSuccessStatus: 204,
  })
);
app.use(express.json());

// ✅ Serve uploaded files (paystubs, policies, etc.)
app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

// ================= ROOT (Guard UI) =================
// Guard UI expects these (NO /api prefix)
app.use("/auth", authRoutes);
app.use("/shifts", shiftRoutes);
app.use("/callouts", calloutRoutes);
app.use("/schedule", scheduleRoutes);
app.use("/incidents", require("./routes/guardIncidents.routes")); // Guard UI expects no /api
app.use("/sites", require("./routes/guardSites.routes")); // Guard UI expects no /api
app.use("/inspections", require("./routes/guardInspections.routes")); // Guard UI expects no /api
app.use("/emergency", require("./routes/emergencySOS.routes")); // Guard UI expects no /api
app.use("/announcements", require("./routes/announcements.routes")); // Guard UI expects no /api
app.use("/api/guard/notifications", require("./routes/guardNotifications.routes")); // Guard notifications
app.use("/api/guard/alerts", require("./routes/guardAlerts.routes")); // Guard alerts (weather, traffic, transit)
app.use("/api/guard/overtime", require("./routes/overtime.routes")); // Guard overtime status and offers

// ✅ Guard payroll routes (read-only paystubs access)
app.use("/api/guard/paystubs", require("./routes/guardPaystubs.routes"));

// ✅ Guard dashboard route (Personal Dashboard + Performance + Achievements)
app.use("/api/guard/dashboard", require("./routes/guardDashboard.routes"));

// ✅ Guard earnings tracker route
app.use("/api/guard/earnings", require("./routes/guardEarnings.routes"));

// ✅ Guard incidents & sites routes (also with /api prefix for consistency)
app.use("/api/guard/incidents", require("./routes/guardIncidents.routes"));
app.use("/api/guard/sites", require("./routes/guardSites.routes"));
app.use("/api/guard/inspections", require("./routes/guardInspections.routes"));
app.use("/api/guards/emergency", require("./routes/emergencySOS.routes"));

// ================= API (Admin + Services) =================
app.use("/api/sms", require("./routes/sms.routes"));
app.use("/api/email", require("./routes/email.routes"));
app.use("/api/ai/policy", require("./routes/aiPolicy.routes"));
app.use("/api/ai/payroll", require("./routes/aiPayroll.routes"));
app.use("/api/guard", guardPolicyRoutes);
app.use("/api/time", require("./routes/timeEntries.routes"));

// ✅ Admin API (Admin Dashboard should call /api/admin/...)
app.use("/api/admin", adminRoutes);

// ✅ Tenants routes (keep separate so it doesn't collide with /api/admin)
app.use("/api/admin/tenants", adminTenantsRoutes);

// ✅ Admin payroll routes (pay stub upload + calculated payroll scaffold)
app.use("/api/admin/paystubs", require("./routes/paystubs.routes"));
app.use("/api/admin/payroll", require("./routes/payroll.routes"));
app.use("/api/admin/adjustments", require("./routes/adjustments.routes"));

// ✅ Supervisor Assistant routes (Q&A + Scheduling Copilot)
// Mount under /api/admin/supervisor so it works with admin dashboard axios client
app.use("/api/admin/supervisor", require("./routes/supervisorAssistant.routes"));

// ✅ Guard Reputation routes
app.use("/api/admin", require("./routes/guardReputation.routes"));

// ✅ Admin Incidents & Sites routes
app.use("/api/admin/incidents", require("./routes/adminIncidents.routes"));
app.use("/api/admin/sites", require("./routes/adminSites.routes"));

// ✅ Admin Inspections routes
app.use("/api/admin/inspections", require("./routes/adminInspections.routes"));

// ✅ Admin Announcements routes
app.use("/api/admin/announcements", require("./routes/adminAnnouncements.routes"));

// Optional debug (safe)
if (process.env.LOG_LEVEL === "debug") {
  const routes = calloutRoutes.stack
    ?.map(
      (r) =>
        r.route &&
        Object.keys(r.route.methods)[0].toUpperCase() + " " + r.route.path
    )
    .filter(Boolean);
  logger.debug({ routes }, "CALL OUT ROUTES");
}

// Health: liveness (process is up)
app.get("/health", (req, res) => {
  res.json({ status: "OK" });
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

module.exports = app;
