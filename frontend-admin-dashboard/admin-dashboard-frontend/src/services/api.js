// src/services/api.js
import axiosClient from "../api/axiosClient";
import abeGuardAiClient from "../api/abeGuardAiClient";

/**
 * IMPORTANT (Option A):
 * axiosClient baseURL: 
 */

// ✅ AUTH
export const loginAdmin = (email, password) =>
  axiosClient.post("/login", { email, password });

export const registerAdmin = (name, email, password, role) =>
  axiosClient.post("/register", { name, email, password, role });

// MFA (after login returns requiresMfa)
export const verifyMfaLogin = (mfaToken, code) =>
  axiosClient.post("/mfa/verify-login", { mfaToken, code });

// MFA setup (authenticated)
export const mfaSetup = (channel, options = {}) =>
  axiosClient.post("/mfa/setup", { channel, ...options });

export const mfaVerifySetup = (code) =>
  axiosClient.post("/mfa/verify-setup", { code });

export const mfaDisable = (currentPassword) =>
  axiosClient.post("/mfa/disable", { currentPassword });

// Change password (authenticated)
export const changePassword = (currentPassword, newPassword) =>
  axiosClient.post("/change-password", { currentPassword, newPassword });

// Log out all other devices (authenticated); returns new token so this device stays logged in
export const logoutOtherDevices = () =>
  axiosClient.post("/logout-other-devices");

// Current admin profile (includes mfa_enabled, mfa_channel)
export const getMe = () => axiosClient.get("/me");

// ===== DASHBOARD =====
export const getOpenShifts = () => axiosClient.get("/dashboard/open-shifts");

export const getLiveCallouts = () => axiosClient.get("/dashboard/live-callouts");

export const getRunningLate = () => axiosClient.get("/dashboard/running-late");

export const getGuardAvailability = () =>
  axiosClient.get("/dashboard/guard-availability");

export const getClockStatus = () => axiosClient.get("/dashboard/clock-status");

// ===== OWNER DASHBOARD (company/tenant summary) =====
export const getOwnerDashboardSummary = () => axiosClient.get("/owner-dashboard/summary");
export const getOwnerStaffList = () => axiosClient.get("/owner-dashboard/staff");
export const createOwnerStaff = (data) => axiosClient.post("/owner-dashboard/staff", data);
export const updateOwnerStaff = (id, data) => axiosClient.put(`/owner-dashboard/staff/${encodeURIComponent(id)}`, data);
export const deleteOwnerStaff = (id) => axiosClient.delete(`/owner-dashboard/staff/${encodeURIComponent(id)}`);

// ===== CLOCK REPORT (weekly clock in/out by location) =====
export const getClockReport = (params = {}) =>
  axiosClient.get("/clock-report", { params });
export const exportClockReport = (params = {}) =>
  axiosClient.get("/clock-report/export", { params, responseType: "blob" });

// ===== GEOGRAPHIC DASHBOARD =====
export const getGeographicSites = () => axiosClient.get("/geographic/sites");
export const getGeographicSiteDetails = (siteId) =>
  axiosClient.get(`/geographic/sites/${encodeURIComponent(siteId)}/details`);
export const createGeographicSite = (data) => axiosClient.post("/geographic/sites", data);
export const deleteGeographicSite = (siteId) => axiosClient.delete(`/geographic/sites/${encodeURIComponent(siteId)}`);
export const getGeographicAnalytics = () => axiosClient.get("/geographic/analytics");
export const getGeographicRouteOptimize = (body) => axiosClient.post("/geographic/route-optimize", body);

// ===== OVERTIME =====
export const createOvertimeOffer = (data) =>
  axiosClient.post("/overtime/offer", data);

export const getOvertimeOffers = (params = {}) =>
  axiosClient.get("/overtime/offers", { params });

export const cancelOvertimeOffer = (offerId) =>
  axiosClient.post(`/overtime/offers/${offerId}/cancel`);

export const approveOvertimeRequest = (offerId, adminNotes) =>
  axiosClient.post(`/overtime/offers/${offerId}/approve`, { adminNotes });

export const denyOvertimeRequest = (offerId, adminNotes) =>
  axiosClient.post(`/overtime/offers/${offerId}/deny`, { adminNotes });

export const getActiveEmergencies = () => axiosClient.get("/dashboard/active-emergencies");

export const resolveEmergency = (id, resolutionNotes) =>
  axiosClient.post(`/dashboard/resolve-emergency/${id}`, { resolutionNotes });

// ===== ANALYTICS =====
export const getAnalyticsKPIs = () => axiosClient.get("/analytics/kpis");

export const getAnalyticsTrends = (days = 30) =>
  axiosClient.get(`/analytics/trends?days=${days}`);

export const getAnalyticsPerformance = (days = 30) =>
  axiosClient.get(`/analytics/performance?days=${days}`);

export const getAnalyticsComparative = () =>
  axiosClient.get("/analytics/comparative");

export const getAnalyticsOverview = (days = 30) =>
  axiosClient.get(`/analytics/overview?days=${days}`);

// ===== COMMAND CENTER =====
export const getCommandCenterFeed = (params = {}) =>
  axiosClient.get("/command-center/feed", { params });

export const getAtRiskShifts = (params = {}) =>
  axiosClient.get("/command-center/at-risk-shifts", { params });

export const generateBriefing = (data) =>
  axiosClient.post("/command-center/briefing", data);

export const askCommandCenter = (data) =>
  axiosClient.post("/command-center/ask", data);

export const getCommandCenterActions = (params = {}) =>
  axiosClient.get("/command-center/actions", { params });

export const approveAction = (actionId) =>
  axiosClient.post(`/command-center/actions/${actionId}/approve`);

export const rejectAction = (actionId, reason) =>
  axiosClient.post(`/command-center/actions/${actionId}/reject`, { reason });

export const getSiteHealth = (params = {}) =>
  axiosClient.get("/command-center/site-health", { params });

export const getSiteHealthDetails = (siteId, params = {}) =>
  axiosClient.get(`/command-center/site-health/${siteId}`, { params });

export const getGuardReadiness = (params = {}) =>
  axiosClient.get("/command-center/guard-readiness", { params });

export const getGuardReadinessDetails = (guardId, params = {}) =>
  axiosClient.get(`/command-center/guard-readiness/${guardId}`, { params });

export const generateWeeklyReport = (data) =>
  axiosClient.post("/command-center/weekly-report", data);

export const exportWeeklyReport = (params = {}) =>
  axiosClient.get("/command-center/weekly-report/export", { params, responseType: "blob" });

export const exportWeeklyReportPDF = (params = {}) =>
  axiosClient.get("/command-center/weekly-report/export-pdf", { params, responseType: "blob" });

// ===== AI RANKING =====
export const getAIRankings = (status = "OPEN") =>
  axiosClient.get(`/ai-ranking?status=${status}`);

export const overrideAIDecision = (shiftId, data) =>
  axiosClient.post(`/ai-ranking/${shiftId}/override`, data);

// If your backend does NOT have this endpoint yet, it will 404 until you add it.
// (Keep it for later dashboard chart wiring.)
export const getRecentAvailabilityLogs = (limit = 20) =>
  axiosClient.get(`/guards/availability-logs?limit=${limit}`);

// ===== GUARDS =====
export const listGuards = () => axiosClient.get("/guards");

export const createGuard = (data) => axiosClient.post("/guards", data);

export const updateGuard = (id, data) =>
  axiosClient.put(`/guards/${id}`, data);

export const deleteGuard = (id) => axiosClient.delete(`/guards/${id}`);

export const unlockGuard = (id) => axiosClient.post(`/guards/${id}/unlock`);

// ✅ PATCH (this is your availability update call)
export const updateGuardAvailability = (id, data) =>
  axiosClient.patch(`/guards/${id}`, data);

export const getGuardAvailabilityLogs = (guardId) =>
  axiosClient.get(`/guards/${guardId}/availability-logs`);

export const getGuardHistory = (guardId) =>
  axiosClient.get(`/guards/${guardId}/history`);

/** Get a short-lived JWT to view messages as a guard (for /messages/guard). */
export const getGuardViewToken = (guardId) =>
  axiosClient.post("/guards/guard-view-token", { guardId });

// ===== SHIFTS =====
export const listShifts = () => axiosClient.get("/shifts");

export const createShift = (data) => axiosClient.post("/shifts", data);

export const updateShift = (id, data) =>
  axiosClient.put(`/shifts/${id}`, data);

export const deleteShift = (id) => axiosClient.delete(`/shifts/${id}`);

// ===== USERS / PERMISSIONS =====
export const listUsers = () => axiosClient.get("/users");

export const createUser = (name, email, password, role, permissions = []) =>
  axiosClient.post("/users", { name, email, password, role, permissions });

export const setUserRole = (id, role) =>
  axiosClient.put(`/users/${id}/role`, { role });

export const setUserPermissions = (id, permissions) =>
  axiosClient.put(`/users/${id}/permissions`, { permissions });

export const deleteUser = (id) => axiosClient.delete(`/users/${id}`);

// ===== SCHEDULE =====
export const getSchedule = () => axiosClient.get("/schedule");
export const updateSchedule = (data) => axiosClient.put("/schedule", data);

// ===== CALLOUT RISK PREDICTION =====
export const getShiftRisk = (shiftId) =>
  axiosClient.get(`/callout-risk/shift/${shiftId}`);

export const getUpcomingRisks = (params = {}) =>
  axiosClient.get("/callout-risk/upcoming", { params });

export const getGuardRiskProfile = (guardId) =>
  axiosClient.get(`/callout-risk/guard/${guardId}`);

// ===== SHIFT OPTIMIZATION =====
export const getShiftRecommendations = (shiftId) =>
  axiosClient.get(`/shift-optimization/recommendations/${shiftId}`);

export const autoAssignGuard = (shiftId, options = {}) =>
  axiosClient.post(`/shift-optimization/auto-assign/${shiftId}`, options);

export const checkConflicts = (shiftId, guardId) =>
  axiosClient.post("/shift-optimization/check-conflicts", { shiftId, guardId });

export const getGuardScore = (shiftId, guardId) =>
  axiosClient.get(`/shift-optimization/score/${shiftId}/${guardId}`);

// ===== REPORT BUILDER =====
export const listReportTemplates = () =>
  axiosClient.get("/reports/templates");

export const getReportTemplate = (id) =>
  axiosClient.get(`/reports/templates/${id}`);

export const createReportTemplate = (data) =>
  axiosClient.post("/reports/templates", data);

export const updateReportTemplate = (id, data) =>
  axiosClient.put(`/reports/templates/${id}`, data);

export const deleteReportTemplate = (id) =>
  axiosClient.delete(`/reports/templates/${id}`);

export const generateReport = (data) =>
  axiosClient.post("/reports/generate", data);

export const listReportRuns = (params = {}) =>
  axiosClient.get("/reports/runs", { params });

export const getReportRun = (id) =>
  axiosClient.get(`/reports/runs/${id}`);

export const exportReport = (id, format = "pdf") =>
  axiosClient.get(`/reports/runs/${id}/export`, {
    params: { format },
    responseType: "blob",
  });

// ===== SCHEDULED REPORTS =====
export const listScheduledReports = (params = {}) =>
  axiosClient.get("/reports/scheduled", { params });
export const createScheduledReport = (data) =>
  axiosClient.post("/reports/scheduled", data);
export const updateScheduledReport = (id, data) =>
  axiosClient.put(`/reports/scheduled/${id}`, data);
export const deleteScheduledReport = (id) =>
  axiosClient.delete(`/reports/scheduled/${id}`);
export const runScheduledReportNow = (id) =>
  axiosClient.post(`/reports/scheduled/${id}/run-now`);

// ===== SCHEDULE EMAIL =====
export const getScheduleEmailPreferences = () =>
  axiosClient.get("/schedule-email/preferences");
export const getGuardScheduleEmailPreference = (guardId) =>
  axiosClient.get(`/schedule-email/preferences/${guardId}`);
export const updateGuardScheduleEmailPreference = (guardId, data) =>
  axiosClient.put(`/schedule-email/preferences/${guardId}`, data);
export const sendScheduleEmailNow = (guardId, data = {}) =>
  axiosClient.post(`/schedule-email/send-now/${guardId}`, data);
export const bulkSendScheduleEmails = (data) =>
  axiosClient.post("/schedule-email/bulk-send", data);
export const getScheduleEmailLogs = (params = {}) =>
  axiosClient.get("/schedule-email/logs", { params });

// ===== EMAIL SCHEDULER SETTINGS =====
export const getEmailSchedulerSettings = () =>
  axiosClient.get("/email-scheduler-settings");
export const updateEmailSchedulerSettings = (data) =>
  axiosClient.put("/email-scheduler-settings", data);

// ===== SUPERVISOR ASSISTANT =====
// Note: Supervisor routes are on abe-guard-ai backend (port 4000), not admin dashboard backend (port 5000)
export const askSupervisor = (question) =>
  abeGuardAiClient.post("/api/admin/supervisor/ask", { question });

export const requestScheduling = (request) =>
  abeGuardAiClient.post("/api/admin/supervisor/schedule", { request });

// ===== AI CHAT ASSISTANT (Enhanced) =====
// Unified chat endpoint with conversation history and task execution
export const chatWithAssistant = (message, conversationHistory = []) => {
  // Format conversation history for backend
  const history = conversationHistory.map(msg => ({
    role: msg.role,
    content: msg.content,
  }));
  
  return axiosClient.post("/assistant/chat", {
    message,
    history,
  });
};

/** Export guard report as PDF (blob). Use response.data and trigger download in UI. */
export const exportGuardReportPDF = (guardId, tenantId) =>
  axiosClient.get("/assistant/report/export-pdf", {
    params: { guardId, tenantId },
    responseType: "blob",
  });

// ===== ADVANCED SEARCH & FILTERS (#31) =====
export const globalSearch = (params = {}) =>
  axiosClient.get("/assistant/search", { params });

export const getSearchHistory = () =>
  axiosClient.get("/assistant/search/history");

export const getSavedSearches = () =>
  axiosClient.get("/assistant/saved-searches");

export const createSavedSearch = (name, query, filters = {}) =>
  axiosClient.post("/assistant/saved-searches", { name, query, filters });

export const deleteSavedSearch = (id) =>
  axiosClient.delete(`/assistant/saved-searches/${id}`);

// ===== SCHEDULE GENERATION =====
export const generateSchedule = (data) =>
  axiosClient.post("/schedule-generation/generate", data);

export const generateScheduleFromTemplate = (template) =>
  axiosClient.post("/schedule-generation/generate-from-template", template);

// ===== FAIRNESS REBALANCING =====
export const analyzeFairness = (params) =>
  axiosClient.get("/fairness-rebalancing/analyze", { params });

export const getRebalancingSuggestions = (params) =>
  axiosClient.get("/fairness-rebalancing/suggestions", { params });

export const autoRebalance = (data) =>
  axiosClient.post("/fairness-rebalancing/auto-rebalance", data);

// ===== GUARD REPUTATION =====
// Note: Reputation routes are on abe-guard-ai backend (port 4000)
export const getGuardReputation = (guardId) =>
  abeGuardAiClient.get(`/api/admin/guards/${guardId}/reputation`);

export const addGuardReputation = (guardId, data) =>
  abeGuardAiClient.post(`/api/admin/guards/${guardId}/reputation`, data);

export const listGuardsWithReputation = () =>
  abeGuardAiClient.get("/api/admin/reputation/guards");

// ===== INCIDENTS =====
// Note: Incident routes are on abe-guard-ai backend (port 4000)
export const listIncidents = (params = {}) => {
  const queryString = new URLSearchParams(params).toString();
  return abeGuardAiClient.get(`/api/admin/incidents${queryString ? `?${queryString}` : ""}`);
};

export const updateIncident = (id, data) =>
  abeGuardAiClient.patch(`/api/admin/incidents/${id}`, data);

export const summarizeIncident = (id) =>
  abeGuardAiClient.post(`/api/admin/incidents/${id}/summarize`);

export const listSites = (tenantId = null) => {
  const queryString = tenantId ? `?tenantId=${tenantId}` : "";
  return abeGuardAiClient.get(`/api/admin/sites${queryString}`);
};

// ===== INSPECTIONS =====
// Note: Inspection routes are on abe-guard-ai backend (port 4000)
export const createInspectionRequest = (data) =>
  abeGuardAiClient.post("/api/admin/inspections/requests", data);

export const listInspectionRequests = (params = {}) => {
  const queryString = new URLSearchParams(params).toString();
  return abeGuardAiClient.get(`/api/admin/inspections/requests${queryString ? `?${queryString}` : ""}`);
};

export const updateInspectionRequest = (id, data) =>
  abeGuardAiClient.patch(`/api/admin/inspections/requests/${id}`, data);

// Note: Use listGuards from admin dashboard backend (port 5000) for guard selection
// Guards from admin dashboard and abe-guard-ai should be in sync via shared database

// ===== SHIFT MANAGEMENT (Guard Features) =====
// Note: These endpoints are for guard-ui, but admins can also use them for management

// Shift Swap Marketplace
export const requestShiftSwap = (data) =>
  axiosClient.post("/guards/shifts/swap/request", data);

export const getAvailableSwaps = (guardId) =>
  axiosClient.get(`/guards/shifts/swap/available?guard_id=${guardId}`);

export const acceptShiftSwap = (swapId, guardId) =>
  axiosClient.post(`/guards/shifts/swap/${swapId}/accept`, { guard_id: guardId });

// Availability Preferences
export const getAvailabilityPreferences = (guardId) =>
  axiosClient.get(`/guards/availability/preferences?guard_id=${guardId}`);

export const updateAvailabilityPreferences = (data) =>
  axiosClient.put("/guards/availability/preferences", data);

// Shift Reports
export const submitShiftReport = (shiftId, data) =>
  axiosClient.post(`/guards/shifts/${shiftId}/report`, data);

export const getShiftReport = (shiftId) =>
  axiosClient.get(`/guards/shifts/${shiftId}/report`);

// Shift History & Analytics
export const getShiftHistory = (guardId, params = {}) => {
  const queryParams = new URLSearchParams({ guard_id: guardId, ...params }).toString();
  return axiosClient.get(`/guards/shifts/history?${queryParams}`);
};

export const getShiftAnalytics = (guardId, period = "month") =>
  axiosClient.get(`/guards/shifts/analytics?guard_id=${guardId}&period=${period}`);

// ===== ADMIN SHIFT SWAP MANAGEMENT =====
export const listShiftSwaps = (status = null) => {
  const query = status ? `?status=${status}` : "";
  return axiosClient.get(`/shift-swaps${query}`);
};

export const approveShiftSwap = (swapId, adminNotes = null) =>
  axiosClient.post(`/shift-swaps/${swapId}/approve`, { admin_notes: adminNotes });

export const rejectShiftSwap = (swapId, adminNotes = null) =>
  axiosClient.post(`/shift-swaps/${swapId}/reject`, { admin_notes: adminNotes });

// ===== ANNOUNCEMENTS =====
// Note: Announcement routes are on abe-guard-ai backend (port 4000)
export const listAnnouncements = () =>
  abeGuardAiClient.get("/api/admin/announcements");

export const createAnnouncement = (data) =>
  abeGuardAiClient.post("/api/admin/announcements", data);

export const updateAnnouncement = (id, data) =>
  abeGuardAiClient.put(`/api/admin/announcements/${id}`, data);

export const deleteAnnouncement = (id) =>
  abeGuardAiClient.delete(`/api/admin/announcements/${id}`);
