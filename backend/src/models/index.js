// backend/src/models/index.js
const path = require("path");
const fs = require("fs");
// Load .env from backend directory (backend/.env)
// __dirname is backend/src/models, so ../../ goes to backend/, then .env is at backend/.env
const envPath = path.resolve(__dirname, "../../.env"); // backend/.env
if (fs.existsSync(envPath)) {
  require("dotenv").config({ path: envPath });
} else {
  // Fallback to default dotenv behavior (looks for .env in current working directory)
  require("dotenv").config();
}

const { Sequelize, DataTypes } = require("sequelize");

/**
 * DB selection rules (minimal change, based on your current file):
 * - test => SQLite in-memory (fast, isolated)
 * - otherwise => Postgres using DB_* env vars (single source of truth)
 */
const isTest = process.env.NODE_ENV === "test";

const sequelize = isTest
  ? new Sequelize({
      dialect: "sqlite",
      storage: "file::memory:",
      logging: false,
    })
  : process.env.DATABASE_URL
    ? new Sequelize(process.env.DATABASE_URL, {
        // Use DATABASE_URL if available (same as abe-guard-ai)
        dialect: "postgres",
        logging: false,
      })
    : new Sequelize(
        process.env.DB_NAME,
        process.env.DB_USER,
        process.env.DB_PASS,
        {
          host: process.env.DB_HOST,
          dialect: "postgres",
          logging: false,
        }
      );

// ✅ Require correct database (abe_guard) — exit if wrong
const REQUIRED_DB_NAMES = ["abe_guard", "abe-guard"];
if (!isTest && sequelize.getDialect() === "postgres") {
  (async () => {
    try {
      await sequelize.authenticate();
      const [dbInfo] = await sequelize.query("SELECT current_database() as db_name");
      const dbName = dbInfo[0]?.db_name;
      if (!dbName || !REQUIRED_DB_NAMES.includes(dbName)) {
        console.error("❌ ERROR: Wrong database. Must use abe_guard.");
        console.error(`   Current: ${dbName || "(unknown)"}`);
        console.error("   Set DATABASE_URL in backend/.env to postgresql://.../abe_guard");
        process.exit(1);
      }
      if (process.env.DEBUG_STARTUP) console.log(`✅ Verified: Connected to correct database (${dbName})`);
    } catch (error) {
      console.warn("⚠️  Could not verify database connection:", error.message);
    }
  })();
}

/**
 * Load models (FACTORY pattern) - UNCHANGED
 */
const Admin = require("./Admin")(sequelize, DataTypes);
const Guard = require("./Guard")(sequelize, DataTypes);
const Shift = require("./Shift")(sequelize, DataTypes);
const CallOut = require("./CallOut")(sequelize, DataTypes);
const ContactPreference = require("./ContactPreference")(sequelize, DataTypes);
const AvailabilityLog = require("./AvailabilityLog")(sequelize, DataTypes);

// ✅ Notifications
const Notification = require("./Notification")(sequelize, DataTypes);
const NotificationRead = require("./NotificationRead")(sequelize, DataTypes);
const NotificationPreference = require("./NotificationPreference")(sequelize, DataTypes);

// ✅ Command Center
const OpEvent = require("./OpEvent")(sequelize, DataTypes);
const CommandCenterAction = require("./CommandCenterAction")(sequelize, DataTypes);

// ✅ Incidents
const Incident = require("./Incident")(sequelize, DataTypes);

// ✅ Report Builder
const ReportTemplate = require("./ReportTemplate")(sequelize, DataTypes);
const ScheduledReport = require("./ScheduledReport")(sequelize, DataTypes);
const ReportRun = require("./ReportRun")(sequelize, DataTypes);
const ReportShare = require("./ReportShare")(sequelize, DataTypes);
const ScheduleEmailPreference = require("./ScheduleEmailPreference")(sequelize, DataTypes);
const ScheduleEmailLog = require("./ScheduleEmailLog")(sequelize, DataTypes);
const ScheduleConfig = require("./ScheduleConfig")(sequelize, DataTypes);
const EmailSchedulerSettings = require("./EmailSchedulerSettings")(sequelize, DataTypes);

// ✅ Shift Management
const ShiftSwap = require("./ShiftSwap")(sequelize, DataTypes);
const GuardAvailabilityPref = require("./GuardAvailabilityPref")(sequelize, DataTypes);
const ShiftReportPhoto = require("./ShiftReportPhoto")(sequelize, DataTypes);

// ✅ Super-Admin: Tenant Management
const Tenant = require("./Tenant")(sequelize, DataTypes);

// ✅ In-App Messaging
const Conversation = require("./Conversation")(sequelize, DataTypes);
const ConversationParticipant = require("./ConversationParticipant")(sequelize, DataTypes);
const Message = require("./Message")(sequelize, DataTypes);
const MessageRead = require("./MessageRead")(sequelize, DataTypes);
const MessageHidden = require("./MessageHidden")(sequelize, DataTypes);
const Site = require("./Site")(sequelize, DataTypes);
const SavedSearch = require("./SavedSearch")(sequelize, DataTypes);
const Staff = require("./Staff")(sequelize, DataTypes);

/**
 * Associations - UNCHANGED
 */
// Shift model uses 'guard_id' field, not 'assignedGuardId'
Guard.hasMany(Shift, { foreignKey: "guard_id", as: "shifts" });
Guard.hasMany(CallOut, { foreignKey: "guard_id" });
CallOut.belongsTo(Guard, { foreignKey: "guard_id" });
Guard.hasMany(ContactPreference, { foreignKey: "guardId" });

// ✅ AvailabilityLog association
Guard.hasMany(AvailabilityLog, { foreignKey: "guardId" });
AvailabilityLog.belongsTo(Guard, { foreignKey: "guardId" });

// ✅ Notification read tracking (per-admin)
Admin.belongsToMany(Notification, {
  through: NotificationRead,
  foreignKey: "adminId",
  otherKey: "notificationId",
});

Notification.belongsToMany(Admin, {
  through: NotificationRead,
  foreignKey: "notificationId",
  otherKey: "adminId",
});

// ✅ Notification preferences (one-to-one with Admin)
Admin.hasOne(NotificationPreference, { foreignKey: "adminId", as: "notificationPreferences" });
NotificationPreference.belongsTo(Admin, { foreignKey: "adminId" });

// ✅ Schedule Email Preferences (one-to-one with Guard)
Guard.hasOne(ScheduleEmailPreference, { foreignKey: "guard_id", as: "scheduleEmailPreference" });
ScheduleEmailPreference.belongsTo(Guard, { foreignKey: "guard_id" });
ScheduleEmailPreference.belongsTo(Tenant, { foreignKey: "tenant_id" });

// ✅ Schedule Email Logs (many-to-one with Guard)
Guard.hasMany(ScheduleEmailLog, { foreignKey: "guard_id", as: "scheduleEmailLogs" });
ScheduleEmailLog.belongsTo(Guard, { foreignKey: "guard_id" });
ScheduleEmailLog.belongsTo(Tenant, { foreignKey: "tenant_id" });

// ✅ Incident associations
Incident.belongsTo(Tenant, { foreignKey: "tenant_id" });
Incident.belongsTo(Guard, { foreignKey: "guard_id", as: "guard" });
Incident.belongsTo(Shift, { foreignKey: "shift_id", as: "shift" });
Guard.hasMany(Incident, { foreignKey: "guard_id", as: "incidents" });
Shift.hasMany(Incident, { foreignKey: "shift_id", as: "incidents" });

// ✅ Shift Management associations
Shift.hasMany(ShiftSwap, { foreignKey: "shift_id", as: "swapRequests" });
ShiftSwap.belongsTo(Shift, { foreignKey: "shift_id", as: "shift" });
ShiftSwap.belongsTo(Shift, { foreignKey: "target_shift_id", as: "targetShift" });
Guard.hasMany(ShiftSwap, { foreignKey: "requester_guard_id", as: "swapRequests" });
Guard.hasMany(ShiftSwap, { foreignKey: "target_guard_id", as: "swapOffers" });
Guard.hasOne(GuardAvailabilityPref, { foreignKey: "guard_id", as: "availabilityPrefs" });
GuardAvailabilityPref.belongsTo(Guard, { foreignKey: "guard_id" });
Shift.hasMany(ShiftReportPhoto, { foreignKey: "shift_id", as: "reportPhotos" });
ShiftReportPhoto.belongsTo(Shift, { foreignKey: "shift_id" });
ShiftReportPhoto.belongsTo(Guard, { foreignKey: "uploaded_by", as: "uploadedBy" });

// ✅ Messaging associations
Conversation.hasMany(ConversationParticipant, { foreignKey: "conversation_id", as: "participants" });
ConversationParticipant.belongsTo(Conversation, { foreignKey: "conversation_id", as: "conversation" });

Conversation.hasMany(Message, { foreignKey: "conversation_id", as: "messages" });
Message.belongsTo(Conversation, { foreignKey: "conversation_id", as: "conversation" });

Message.hasMany(MessageRead, { foreignKey: "message_id", as: "reads" });
MessageRead.belongsTo(Message, { foreignKey: "message_id", as: "message" });
Message.hasMany(MessageHidden, { foreignKey: "message_id", as: "hiddenFor" });
MessageHidden.belongsTo(Message, { foreignKey: "message_id", as: "message" });

// Tenant association
Conversation.belongsTo(Tenant, { foreignKey: "tenant_id", as: "tenant" });

// Shift association (for shift-based group chats)
Conversation.belongsTo(Shift, { foreignKey: "shift_id", as: "shift" });
Shift.hasMany(Conversation, { foreignKey: "shift_id", as: "conversations" });

// Advanced Search: saved searches per admin (no DB FK — admins table name may differ)
Admin.hasMany(SavedSearch, { foreignKey: "admin_id", as: "savedSearches", constraints: false });
SavedSearch.belongsTo(Admin, { foreignKey: "admin_id", as: "admin", constraints: false });

module.exports = {
  sequelize,
  Admin,
  Guard,
  Shift,
  CallOut,
  ContactPreference,
  AvailabilityLog,

  // ✅ export these
  Notification,
  NotificationRead,
  NotificationPreference,

  // ✅ Command Center
  OpEvent,
  CommandCenterAction,

  // ✅ Report Builder
  ReportTemplate,
  ScheduledReport,
  ReportRun,
  ReportShare,

  // ✅ Super-Admin: Tenant Management
  Tenant,

  // ✅ Schedule Email
  ScheduleEmailPreference,
  ScheduleEmailLog,
  
  // ✅ Schedule Config
  ScheduleConfig,
  
  // ✅ Email Scheduler Settings
  EmailSchedulerSettings,
  
  // ✅ Shift Management
  ShiftSwap,
  GuardAvailabilityPref,
  ShiftReportPhoto,
  
  // ✅ Incidents
  Incident,

  // ✅ In-App Messaging
  Conversation,
  ConversationParticipant,
  Message,
  MessageRead,
  MessageHidden,

  // Geographic Dashboard
  Site,

  // Advanced Search & Filters (#31)
  SavedSearch,

  // Staff directory (admin-managed, owner view)
  Staff,
};
