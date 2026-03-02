// src/services/guardApi.js
import { guardClient } from "../api/axiosClients";

/**
 * Always send guardToken for guard backend calls
 */
function guardAuthHeaders() {
  const token =
    localStorage.getItem("guardToken") ||
    localStorage.getItem("token") || // fallback if older code stored it generically
    "";

  return token ? { Authorization: `Bearer ${token}` } : {};
}

/* ================= AUTH ================= */

// Guard login (guard backend mounts auth at /auth)
export const loginGuard = (email, password) =>
  guardClient.post("/auth/login", { email, password });

/* ================= SHIFTS ================= */

export const listShifts = () =>
  guardClient.get("/shifts", { headers: guardAuthHeaders() });

export const getShiftState = (shiftId) =>
  guardClient.get(`/shifts/${shiftId}/state`, { headers: guardAuthHeaders() });

/**
 * Clock in with geolocation data
 * @param {string} shiftId - Shift ID
 * @param {Object} locationData - Geolocation and device data
 * @param {number} locationData.lat - Latitude
 * @param {number} locationData.lng - Longitude
 * @param {number} locationData.accuracyM - GPS accuracy in meters
 * @param {string} locationData.deviceId - Device identifier
 * @param {string} locationData.deviceType - Device type (e.g., "iOS", "Android")
 * @param {string} locationData.deviceOS - Device OS version
 */
export const clockIn = (shiftId, locationData = {}) =>
  guardClient.post(
    `/shifts/${shiftId}/clock-in`,
    {
      lat: locationData.lat,
      lng: locationData.lng,
      accuracyM: locationData.accuracyM,
      deviceId: locationData.deviceId,
      deviceType: locationData.deviceType,
      deviceOS: locationData.deviceOS,
    },
    { headers: guardAuthHeaders() }
  );

export const clockOut = (shiftId) =>
  guardClient.post(
    `/shifts/${shiftId}/clock-out`,
    {},
    { headers: guardAuthHeaders() }
  );

export const breakStart = (shiftId) =>
  guardClient.post(
    `/shifts/${shiftId}/break-start`,
    {},
    { headers: guardAuthHeaders() }
  );

export const breakEnd = (shiftId) =>
  guardClient.post(
    `/shifts/${shiftId}/break-end`,
    {},
    { headers: guardAuthHeaders() }
  );

/**
 * ✅ Support BOTH running-late call patterns:
 * 1) runningLate(shiftId, reason)
 * 2) runningLate({ shiftId, minutesLate, reason })
 */
export const runningLate = (arg1, arg2) => {
  // object form
  if (arg1 && typeof arg1 === "object") {
    const { shiftId, minutesLate, reason } = arg1 || {};
    if (!shiftId) throw new Error("Missing shiftId");

    // guardClient interceptor already adds token, no need for guardAuthHeaders()
    return guardClient.post(
      `/shifts/${shiftId}/running-late`,
      { minutesLate, reason }
    );
  }

  // legacy form
  const shiftId = arg1;
  const reason = arg2;
  if (!shiftId) throw new Error("Missing shiftId");

  // guardClient interceptor already adds token, no need for guardAuthHeaders()
  return guardClient.post(
    `/shifts/${shiftId}/running-late`,
    { reason }
  );
};

/**
 * ✅ Accept shift
 * POST /shifts/accept/:shiftId
 */
export const acceptShift = (shiftId) => {
  if (!shiftId) throw new Error("Missing shiftId");
  return guardClient.post(
    `/shifts/accept/${shiftId}`,
    {},
    { headers: guardAuthHeaders() }
  );
};

/* ================= CALLOUTS ================= */

export const triggerCallout = (payload) =>
  guardClient.post("/callouts/trigger", payload, { headers: guardAuthHeaders() });

export const respondToCallout = (calloutId, response = "ACCEPTED") =>
  guardClient.post(
    `/callouts/${calloutId}/respond`,
    { response },
    { headers: guardAuthHeaders() }
  );

/* ================= POLICY ================= */

export const askPolicy = (payload) =>
  guardClient.post("/api/guard/policy/ask", payload);

/* ================= PAYROLL ================= */

export const askPayroll = (payload) =>
  guardClient.post("/api/ai/payroll/ask", payload, { headers: guardAuthHeaders() });

/* ================= INCIDENTS ================= */

/**
 * List sites for the guard's tenant
 * GET /api/guard/sites or /sites
 */
export const listSites = () =>
  guardClient.get("/sites", { headers: guardAuthHeaders() });

/**
 * Create incident report
 * POST /api/guard/incidents or /incidents
 * multipart/form-data with files
 */
export const createIncident = (formData) =>
  guardClient.post("/incidents", formData, {
    headers: {
      ...guardAuthHeaders(),
      "Content-Type": "multipart/form-data",
    },
  });

/* ================= EMERGENCY SOS ================= */

/**
 * Trigger emergency SOS alert
 * POST /api/guards/emergency/sos
 */
export const triggerEmergencySOS = (locationData) =>
  guardClient.post(
    "/emergency/sos",
    {
      lat: locationData?.lat,
      lng: locationData?.lng,
      accuracy: locationData?.accuracy,
    },
    { headers: guardAuthHeaders() }
  );

/**
 * Get emergency contacts
 * GET /api/guards/emergency/contacts
 */
export const getEmergencyContacts = () =>
  guardClient.get("/emergency/contacts", { headers: guardAuthHeaders() });

/**
 * Add emergency contact
 * POST /api/guards/emergency/contacts
 */
export const addEmergencyContact = (contact) =>
  guardClient.post(
    "/emergency/contacts",
    { name: contact.name, phone: contact.phone },
    { headers: guardAuthHeaders() }
  );

/* ================= ANNOUNCEMENTS ================= */

/**
 * Get all announcements for the guard
 * GET /announcements
 * Note: guardClient interceptor already adds token, but we include headers for safety
 */
export const getAnnouncements = () =>
  guardClient.get("/announcements", { headers: guardAuthHeaders() });

/**
 * Get unread announcements count
 * GET /announcements/unread-count
 */
export const getUnreadAnnouncementsCount = () =>
  guardClient.get("/announcements/unread-count", { headers: guardAuthHeaders() });

/* ================= NOTIFICATIONS ================= */

/**
 * Get all notifications for the authenticated guard
 * @param {Object} options - Query options
 * @param {number} options.limit - Maximum number of notifications to return (default: 50)
 * @param {boolean} options.unreadOnly - If true, only return unread notifications
 */
export const getGuardNotifications = (options = {}) => {
  const params = new URLSearchParams();
  if (options.limit) params.append("limit", options.limit);
  if (options.unreadOnly) params.append("unreadOnly", "true");
  
  const queryString = params.toString();
  const url = `/api/guard/notifications${queryString ? `?${queryString}` : ""}`;
  
  // guardClient interceptor already adds token
  return guardClient.get(url);
};

/**
 * Get count of unread notifications
 */
export const getUnreadNotificationsCount = () =>
  guardClient.get("/api/guard/notifications/unread-count");

/**
 * Mark a notification as read
 * @param {string} notificationId - Notification ID
 */
export const markNotificationAsRead = (notificationId) =>
  guardClient.post(`/api/guard/notifications/${notificationId}/read`);

/**
 * Mark all notifications as read
 */
export const markAllNotificationsAsRead = () =>
  guardClient.post("/api/guard/notifications/mark-all-read");

/* ================= ALERTS (WEATHER, TRAFFIC, TRANSIT) ================= */

/**
 * Get weather alert for a shift
 * @param {string} shiftId - Shift ID
 */
export const getWeatherAlert = (shiftId) =>
  guardClient.get(`/api/guard/alerts/weather/${shiftId}`);

/**
 * Get traffic alert for a shift
 * @param {string} shiftId - Shift ID
 * @param {string} origin - Guard's starting location (address or "lat,lng")
 */
export const getTrafficAlert = (shiftId, origin) =>
  guardClient.get(`/api/guard/alerts/traffic/${shiftId}`, {
    params: { origin },
  });

/**
 * Get transit options for a shift
 * @param {string} shiftId - Shift ID
 * @param {string} origin - Guard's starting location
 */
export const getTransitAlert = (shiftId, origin) =>
  guardClient.get(`/api/guard/alerts/transit/${shiftId}`, {
    params: { origin },
  });

/**
 * Get combined alerts (weather + traffic + transit) for a shift
 * @param {string} shiftId - Shift ID
 * @param {Object} options - { origin, includeTransit }
 */
export const getCombinedAlert = (shiftId, options = {}) =>
  guardClient.get(`/api/guard/alerts/combined/${shiftId}`, {
    params: {
      origin: options.origin,
      includeTransit: options.includeTransit !== false,
    },
  });

/**
 * Get alerts for all upcoming shifts
 * @param {Object} options - { origin, includeTransit, limit }
 */
export const getUpcomingAlerts = (options = {}) =>
  guardClient.get("/api/guard/alerts/upcoming", {
    params: {
      origin: options.origin,
      includeTransit: options.includeTransit !== false,
      limit: options.limit || 5,
    },
  });

/**
 * Mark announcement as read
 * POST /announcements/:id/read
 */
export const markAnnouncementAsRead = (announcementId) =>
  guardClient.post(
    `/announcements/${announcementId}/read`,
    {},
    { headers: guardAuthHeaders() }
  );

/* ================= DASHBOARD ================= */

/**
 * Get comprehensive dashboard data (Personal Dashboard + Performance + Achievements)
 */
export const getGuardDashboard = () =>
  guardClient.get("/api/guard/dashboard");

/* ================= OVERTIME ================= */

/**
 * Get overtime status for a shift
 * GET /api/guard/overtime/status/:shiftId
 */
export const getOvertimeStatus = (shiftId) =>
  guardClient.get(`/api/guard/overtime/status/${shiftId}`, { headers: guardAuthHeaders() });

/**
 * Get pending overtime offers
 * GET /api/guard/overtime/offers
 */
export const getOvertimeOffers = () =>
  guardClient.get("/api/guard/overtime/offers", { headers: guardAuthHeaders() });

/**
 * Accept an overtime offer
 * POST /api/guard/overtime/offers/:offerId/accept
 */
export const acceptOvertimeOffer = (offerId) =>
  guardClient.post(`/api/guard/overtime/offers/${offerId}/accept`, {}, { headers: guardAuthHeaders() });

/**
 * Decline an overtime offer
 * POST /api/guard/overtime/offers/:offerId/decline
 */
export const declineOvertimeOffer = (offerId) =>
  guardClient.post(`/api/guard/overtime/offers/${offerId}/decline`, {}, { headers: guardAuthHeaders() });

/**
 * Request overtime (guard-initiated)
 * POST /api/guard/overtime/request
 */
export const requestOvertime = (data) =>
  guardClient.post("/api/guard/overtime/request", data, { headers: guardAuthHeaders() });

/* ================= EARNINGS TRACKER ================= */

/**
 * Get comprehensive earnings tracker data (real-time earnings, pay periods, tax estimates, payment history)
 */
export const getGuardEarnings = () =>
  guardClient.get("/api/guard/earnings");

/* ================= PAY STUBS ================= */

/**
 * Get current (most recent) pay stub for the authenticated guard
 */
export const getCurrentPayStub = () =>
  guardClient.get("/api/guard/paystubs/current");

/**
 * Get all pay stubs for the authenticated guard (most recent first)
 */
export const getPayStubs = () =>
  guardClient.get("/api/guard/paystubs");
