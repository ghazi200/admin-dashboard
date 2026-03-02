// backend/src/models/index.js

const Admin = require("./Admin");
const Tenant = require("./Tenant");
const Guard = require("./Guard");
const Shift = require("./Shift");
const Callout = require("./Callout");
const AIDecision = require("./AIDecision");
const ShiftTimeEntry = require("./ShiftTimeEntry");
const TimeEntry = require("./TimeEntry");
const ClockInVerification = require("./ClockInVerification");
const Site = require("./Site");
const Incident = require("./Incident");
const InspectionRequest = require("./InspectionRequest");
const InspectionSubmission = require("./InspectionSubmission");

// ✅ Emergency SOS models
const EmergencyEvent = require("./EmergencyEvent");
const EmergencyContact = require("./EmergencyContact");

// ✅ Announcements & Notices models
const Announcement = require("./Announcement");
const AnnouncementRead = require("./AnnouncementRead");

// ✅ Guard Notifications
const GuardNotification = require("./GuardNotification");

// ✅ Policy AI models
const PolicyDocument = require("./PolicyDocument");
const PolicyChunk = require("./PolicyChunk");
const AIPolicyQA = require("./AIPolicyQA");

// ✅ Payroll models
const PayStub = require("./PayStub");
const PayPeriod = require("./PayPeriod");
const Timesheet = require("./Timesheet");
const TimesheetLine = require("./TimesheetLine");
const PayrollAdjustment = require("./PayrollAdjustment");

/* =====================
   Associations
===================== */

// ---- Tenant core ----
Tenant.hasMany(Admin, { foreignKey: "tenant_id" });
Tenant.hasMany(Guard, { foreignKey: "tenant_id" });
Tenant.hasMany(Shift, { foreignKey: "tenant_id" });

Admin.belongsTo(Tenant, { foreignKey: "tenant_id" });

Guard.belongsTo(Tenant, { foreignKey: "tenant_id" });
Guard.hasMany(Callout, { foreignKey: "guard_id" });

Shift.belongsTo(Tenant, { foreignKey: "tenant_id" });
Shift.belongsTo(Guard, { foreignKey: "guard_id" });
Shift.hasMany(Callout, { foreignKey: "shift_id" });

Callout.belongsTo(Guard, { foreignKey: "guard_id" });
Callout.belongsTo(Shift, { foreignKey: "shift_id" });

// ---- AI Decision ----
Shift.hasMany(AIDecision, { foreignKey: "shift_id" });
AIDecision.belongsTo(Shift, { foreignKey: "shift_id" });

// ---- Time Entries ----
Shift.hasMany(ShiftTimeEntry, { foreignKey: "shift_id" });
Guard.hasMany(ShiftTimeEntry, { foreignKey: "guard_id" });
ShiftTimeEntry.belongsTo(Shift, { foreignKey: "shift_id" });
ShiftTimeEntry.belongsTo(Guard, { foreignKey: "guard_id" });

TimeEntry.hasMany(ClockInVerification, { foreignKey: "time_entry_id", as: "verifications" });
Guard.hasMany(ClockInVerification, { foreignKey: "guard_id", as: "clockInVerifications" });
Shift.hasMany(ClockInVerification, { foreignKey: "shift_id", as: "clockInVerifications" });
Tenant.hasMany(ClockInVerification, { foreignKey: "tenant_id", as: "clockInVerifications" });
ClockInVerification.belongsTo(TimeEntry, { foreignKey: "time_entry_id" });
ClockInVerification.belongsTo(Guard, { foreignKey: "guard_id" });
ClockInVerification.belongsTo(Shift, { foreignKey: "shift_id" });
ClockInVerification.belongsTo(Tenant, { foreignKey: "tenant_id" });

// ---- Payroll (Pay Stub Upload Mode A) ----
Tenant.hasMany(PayStub, { foreignKey: "tenant_id" });
Guard.hasMany(PayStub, { foreignKey: "guard_id" });
PayStub.belongsTo(Tenant, { foreignKey: "tenant_id" });
PayStub.belongsTo(Guard, { foreignKey: "guard_id" });

// ---- Payroll (Calculated Payroll Mode B) ----
Tenant.hasMany(PayPeriod, { foreignKey: "tenant_id" });
PayPeriod.belongsTo(Tenant, { foreignKey: "tenant_id" });
PayPeriod.belongsTo(Admin, { foreignKey: "locked_by_admin_id", as: "lockedByAdmin" });

Tenant.hasMany(Timesheet, { foreignKey: "tenant_id" });
Guard.hasMany(Timesheet, { foreignKey: "guard_id" });
PayPeriod.hasMany(Timesheet, { foreignKey: "pay_period_id" });
Timesheet.belongsTo(Tenant, { foreignKey: "tenant_id" });
Timesheet.belongsTo(Guard, { foreignKey: "guard_id" });
Timesheet.belongsTo(PayPeriod, { foreignKey: "pay_period_id" });
Timesheet.belongsTo(Admin, { foreignKey: "approved_by_admin_id", as: "approvedByAdmin" });
Timesheet.hasMany(TimesheetLine, { foreignKey: "timesheet_id", as: "lines" });

TimesheetLine.belongsTo(Timesheet, { foreignKey: "timesheet_id" });
TimesheetLine.belongsTo(Shift, { foreignKey: "shift_id" });
Shift.hasMany(TimesheetLine, { foreignKey: "shift_id" });

Tenant.hasMany(PayrollAdjustment, { foreignKey: "tenant_id" });
Guard.hasMany(PayrollAdjustment, { foreignKey: "guard_id" });
PayPeriod.hasMany(PayrollAdjustment, { foreignKey: "pay_period_id" });
Timesheet.hasMany(PayrollAdjustment, { foreignKey: "timesheet_id" });
PayrollAdjustment.belongsTo(Tenant, { foreignKey: "tenant_id" });
PayrollAdjustment.belongsTo(Guard, { foreignKey: "guard_id" });
PayrollAdjustment.belongsTo(PayPeriod, { foreignKey: "pay_period_id" });
PayrollAdjustment.belongsTo(Timesheet, { foreignKey: "timesheet_id" });
PayrollAdjustment.belongsTo(Admin, { foreignKey: "requested_by_admin_id", as: "requestedByAdmin" });
PayrollAdjustment.belongsTo(Admin, { foreignKey: "approved_by_admin_id", as: "approvedByAdmin" });

// ---- Policy AI ----
// These are required because retrieval uses include: { as: "document" }
PolicyDocument.hasMany(PolicyChunk, { foreignKey: "document_id", as: "chunks" });
PolicyChunk.belongsTo(PolicyDocument, { foreignKey: "document_id", as: "document" });

// ---- Guard Reputation ----
const GuardReputation = require("./GuardReputation");
Tenant.hasMany(GuardReputation, { foreignKey: "tenant_id" });
Guard.hasMany(GuardReputation, { foreignKey: "guard_id" });
Admin.hasMany(GuardReputation, { foreignKey: "reviewed_by_admin_id", as: "reviews" });
Shift.hasMany(GuardReputation, { foreignKey: "related_shift_id", as: "reviews" });
GuardReputation.belongsTo(Tenant, { foreignKey: "tenant_id" });
GuardReputation.belongsTo(Guard, { foreignKey: "guard_id" });
GuardReputation.belongsTo(Admin, { foreignKey: "reviewed_by_admin_id", as: "reviewedBy" });
GuardReputation.belongsTo(Shift, { foreignKey: "related_shift_id", as: "relatedShift" });

// ---- Sites & Incidents ----
Tenant.hasMany(Site, { foreignKey: "tenant_id" });
Site.belongsTo(Tenant, { foreignKey: "tenant_id" });

Tenant.hasMany(Incident, { foreignKey: "tenant_id" });
Guard.hasMany(Incident, { foreignKey: "guard_id" });
Shift.hasMany(Incident, { foreignKey: "shift_id" });
Site.hasMany(Incident, { foreignKey: "site_id" });
Incident.belongsTo(Tenant, { foreignKey: "tenant_id" });
Incident.belongsTo(Guard, { foreignKey: "guard_id" });
Incident.belongsTo(Shift, { foreignKey: "shift_id" });
Incident.belongsTo(Site, { foreignKey: "site_id" });

// Site association for shifts (optional)
Shift.belongsTo(Site, { foreignKey: "site_id" });
Site.hasMany(Shift, { foreignKey: "site_id" });

// ---- Inspection Requests & Submissions ----
Tenant.hasMany(InspectionRequest, { foreignKey: "tenant_id" });
Site.hasMany(InspectionRequest, { foreignKey: "site_id" });
Shift.hasMany(InspectionRequest, { foreignKey: "shift_id" });
Guard.hasMany(InspectionRequest, { foreignKey: "guard_id" });
Admin.hasMany(InspectionRequest, { foreignKey: "requested_by_admin_id", as: "inspectionRequests" });
InspectionRequest.belongsTo(Tenant, { foreignKey: "tenant_id" });
InspectionRequest.belongsTo(Site, { foreignKey: "site_id" });
InspectionRequest.belongsTo(Shift, { foreignKey: "shift_id" });
InspectionRequest.belongsTo(Guard, { foreignKey: "guard_id" });
InspectionRequest.belongsTo(Admin, { foreignKey: "requested_by_admin_id", as: "requestedBy" });
InspectionRequest.hasMany(InspectionSubmission, { foreignKey: "request_id", as: "submissions" });

Tenant.hasMany(InspectionSubmission, { foreignKey: "tenant_id" });
Guard.hasMany(InspectionSubmission, { foreignKey: "guard_id" });
InspectionSubmission.belongsTo(Tenant, { foreignKey: "tenant_id" });
InspectionSubmission.belongsTo(Guard, { foreignKey: "guard_id" });
InspectionSubmission.belongsTo(InspectionRequest, { foreignKey: "request_id", as: "request" });

// ---- Emergency SOS ----
Tenant.hasMany(EmergencyEvent, { foreignKey: "tenant_id" });
Guard.hasMany(EmergencyEvent, { foreignKey: "guard_id" });
Admin.hasMany(EmergencyEvent, { foreignKey: "supervisor_id", as: "supervisedEmergencies" });
EmergencyEvent.belongsTo(Tenant, { foreignKey: "tenant_id" });
EmergencyEvent.belongsTo(Guard, { foreignKey: "guard_id" });
EmergencyEvent.belongsTo(Admin, { foreignKey: "supervisor_id", as: "supervisor" });

Tenant.hasMany(EmergencyContact, { foreignKey: "tenant_id" });
Guard.hasMany(EmergencyContact, { foreignKey: "guard_id" });
EmergencyContact.belongsTo(Tenant, { foreignKey: "tenant_id" });
EmergencyContact.belongsTo(Guard, { foreignKey: "guard_id" });

// ---- Announcements & Notices ----
Tenant.hasMany(Announcement, { foreignKey: "tenant_id" });
Site.hasMany(Announcement, { foreignKey: "site_id" });
Admin.hasMany(Announcement, { foreignKey: "created_by_admin_id", as: "announcements" });
Announcement.belongsTo(Tenant, { foreignKey: "tenant_id" });
Announcement.belongsTo(Site, { foreignKey: "site_id" });
Announcement.belongsTo(Admin, { foreignKey: "created_by_admin_id", as: "createdBy" });

Announcement.hasMany(AnnouncementRead, { foreignKey: "announcement_id", as: "reads" });
Guard.hasMany(AnnouncementRead, { foreignKey: "guard_id", as: "announcementReads" });
AnnouncementRead.belongsTo(Announcement, { foreignKey: "announcement_id" });
AnnouncementRead.belongsTo(Guard, { foreignKey: "guard_id" });

// ---- Guard Notifications ----
Guard.hasMany(GuardNotification, { foreignKey: "guard_id", as: "notifications" });
Shift.hasMany(GuardNotification, { foreignKey: "shift_id", as: "notifications" });
GuardNotification.belongsTo(Guard, { foreignKey: "guard_id" });
GuardNotification.belongsTo(Shift, { foreignKey: "shift_id" });

module.exports = {
  Admin,
  Tenant,
  Guard,
  Shift,
  Callout,
  AIDecision,
  ShiftTimeEntry,
  TimeEntry,
  ClockInVerification,
  // ✅ Export policy models
  PolicyDocument,
  PolicyChunk,
  AIPolicyQA,
  // ✅ Export payroll models
  PayStub,
  PayPeriod,
  Timesheet,
  TimesheetLine,
  PayrollAdjustment,
  GuardReputation,
  Site,
  Incident,
  InspectionRequest,
  InspectionSubmission,
  // ✅ Emergency SOS
  EmergencyEvent,
  EmergencyContact,
  // ✅ Announcements & Notices
  Announcement,
  AnnouncementRead,
  // ✅ Guard Notifications
  GuardNotification,
};
