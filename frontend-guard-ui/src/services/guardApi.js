// src/services/guardApi.js
import axios from "axios";
import { guardClient } from "../api/axiosClients";
import { getAdminApiUrl, getGuardApiUrl, getUnifiedBackendUrl } from "../config/apiUrls";
import { isNativeCapable, nativeGetJson, nativePostJson } from "../utils/nativeHttp";
import { GEO_GET_CURRENT_RELAXED } from "../utils/geolocationOptions";

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

/**
 * Readable API errors. Backend catch-all uses { error: "Not Found", path } (no message).
 */
export function formatGuardApiError(e) {
  const st = e?.response?.status ?? 0;
  const d = e?.response?.data;
  const body = d && typeof d === "object" ? d : {};
  const fromBody = body.message || body.error;
  const base = fromBody || e?.message || "Request failed";

  if (st === 404) {
    if (body.path) {
      return `404: no route at ${body.path}. Use Railway NODE URL (root "backend"). Test in browser: YOUR-HOST/time-clock-ready (then /api/guard/time-clock-ready). Emulator: http://10.0.2.2:5000`;
    }
    if (typeof base === "string" && /shift not found/i.test(base)) {
      return `${base} Pick a shift from the list or seed shifts on this database.`;
    }
    const vague = !fromBody || /^HTTP\s*\d+/i.test(String(base).trim());
    if (vague) {
      return `404 (empty error body). App tried POST /api/guard/shifts/…/clock-in then POST /shifts/…/clock-in. In browser open HOST/time-clock-ready — expect ok:true. If 404, redeploy Railway (Root Directory=backend). Path is “guard”, not “guest”.`;
    }
    return `${base} (404). Redeploy backend; verify GET /api/guard/time-clock-ready returns ok:true.`;
  }

  return String(base);
}

/** POST once; returns { ok, status, data, error? } */
async function postToGuardPath(path, body, headers) {
  const p = path.startsWith("/") ? path : `/${path}`;
  if (isNativeCapable()) {
    const base = getGuardApiUrl().replace(/\/+$/, "");
    const res = await nativePostJson(`${base}${p}`, body, headers);
    return { ok: res.ok, status: res.status, data: res.data, error: res.error };
  }
  try {
    const r = await guardClient.post(p, body, { headers });
    return { ok: true, status: r.status, data: r.data };
  } catch (e) {
    return {
      ok: false,
      status: e.response?.status ?? 0,
      data: e.response?.data,
      error: e.message,
    };
  }
}

/**
 * Time punch: admin-dashboard uses POST /api/guard/shifts/:id/clock-in; abe-guard-ai uses POST /shifts/:id/clock-in.
 * Try primary first, then legacy path so one app build works with either Railway service.
 */
async function guardPostPunch(shiftId, action, body = {}) {
  const id = encodeURIComponent(shiftId);
  const headers = guardAuthHeaders();
  const primary = `/api/guard/shifts/${id}/${action}`;
  const fallback = `/shifts/${id}/${action}`;

  let res = await postToGuardPath(primary, body, headers);
  if (!res.ok && res.status === 404) {
    res = await postToGuardPath(fallback, body, headers);
  }
  if (!res.ok) {
    const err = new Error(
      res.data?.message || res.data?.error || res.error || `Request failed (${res.status})`
    );
    err.response = { status: res.status, data: res.data || {} };
    throw err;
  }
  return { data: res.data };
}

/** Running late: unified host tries /api/guard/... first (admin backend), then /shifts/... (abe-guard-ai). */
async function guardPostRunningLate(shiftId, body) {
  const id = encodeURIComponent(shiftId);
  const headers = guardAuthHeaders();
  const primary = `/api/guard/shifts/${id}/running-late`;
  const fallback = `/shifts/${id}/running-late`;

  let res = await postToGuardPath(primary, body, headers);
  if (!res.ok && res.status === 404) {
    res = await postToGuardPath(fallback, body, headers);
  }
  if (!res.ok) {
    const err = new Error(
      res.data?.message || res.data?.error || res.error || `Request failed (${res.status})`
    );
    err.response = { status: res.status, data: res.data || {} };
    throw err;
  }
  return { data: res.data };
}

/* ================= AUTH ================= */

// Guard login (guard backend mounts auth at /auth). Longer timeout for cold start.
export const loginGuard = (email, password) =>
  guardClient.post("/auth/login", { email, password }, { timeout: 60000 });

/* ================= SHIFTS ================= */

/**
 * List shifts for the logged-in guard (OPEN + assigned). Uses admin-dashboard /api/guard/shifts
 * — do not call GET /shifts (admin JWT only on this backend).
 */
export async function listShifts() {
  if (isNativeCapable()) {
    const base = getGuardApiUrl().replace(/\/+$/, "");
    const token = localStorage.getItem("guardToken") || localStorage.getItem("token") || "";
    const res = await nativeGetJson(`${base}/api/guard/shifts`, {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    });
    if (!res.ok) {
      const err = new Error(res.data?.message || res.data?.error || res.error || "Failed to load shifts");
      err.response = { status: res.status, data: res.data || {} };
      throw err;
    }
    return { data: res.data };
  }
  return guardClient.get("/api/guard/shifts", { headers: guardAuthHeaders() });
}

export async function getShiftState(shiftId) {
  if (isNativeCapable()) {
    const base = getGuardApiUrl().replace(/\/+$/, "");
    const token = localStorage.getItem("guardToken") || localStorage.getItem("token") || "";
    const res = await nativeGetJson(`${base}/api/guard/shifts/${encodeURIComponent(shiftId)}/state`, {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    });
    if (!res.ok) {
      const err = new Error(res.data?.message || res.data?.error || res.error || "Failed to load shift state");
      err.response = { status: res.status, data: res.data || {} };
      throw err;
    }
    return { data: res.data };
  }
  return guardClient.get(`/api/guard/shifts/${encodeURIComponent(shiftId)}/state`, {
    headers: guardAuthHeaders(),
  });
}

/**
 * Best-effort GPS for clock-in. Never throws — returns {} if denied, unsupported, or timeout.
 */
export function getOptionalClockInLocation() {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      return resolve({});
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracyM: position.coords.accuracy,
        });
      },
      () => resolve({}),
      GEO_GET_CURRENT_RELAXED
    );
  });
}

/** Clock in: attach GPS when allowed; still succeeds if user denied location. */
export async function clockInWithOptionalLocation(shiftId, _unused) {
  const locationData = await getOptionalClockInLocation();
  return clockIn(shiftId, locationData);
}

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
  guardPostPunch(shiftId, "clock-in", {
    lat: locationData.lat,
    lng: locationData.lng,
    accuracyM: locationData.accuracyM,
    deviceId: locationData.deviceId,
    deviceType: locationData.deviceType,
    deviceOS: locationData.deviceOS,
  });

export const clockOut = (shiftId) => guardPostPunch(shiftId, "clock-out", {});

export const breakStart = (shiftId) => guardPostPunch(shiftId, "break-start", {});

export const breakEnd = (shiftId) => guardPostPunch(shiftId, "break-end", {});

/**
 * ✅ Support BOTH running-late call patterns:
 * 1) runningLate(shiftId, reason)
 * 2) runningLate({ shiftId, minutesLate, reason })
 */
export const runningLate = async (arg1, arg2) => {
  // object form
  if (arg1 && typeof arg1 === "object") {
    const { shiftId, minutesLate, reason } = arg1 || {};
    if (!shiftId) throw new Error("Missing shiftId");

    const body = {
      minutesLate,
      etaMinutes: minutesLate,
      reason,
    };
    return guardPostRunningLate(shiftId, body);
  }

  const shiftId = arg1;
  if (!shiftId) throw new Error("Missing shiftId");
  if (arg2 && typeof arg2 === "object") {
    return guardPostRunningLate(shiftId, {
      minutesLate: arg2.minutesLate,
      etaMinutes: arg2.minutesLate ?? arg2.etaMinutes,
      reason: arg2.reason,
    });
  }
  return guardPostRunningLate(shiftId, { reason: arg2 });
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
export async function getGuardNotifications(options = {}) {
  const params = new URLSearchParams();
  if (options.limit) params.append("limit", options.limit);
  if (options.unreadOnly) params.append("unreadOnly", "true");
  const queryString = params.toString();
  const path = `/api/guard/notifications${queryString ? `?${queryString}` : ""}`;

  if (isNativeCapable()) {
    const base = getGuardApiUrl().replace(/\/+$/, "");
    const token = localStorage.getItem("guardToken") || localStorage.getItem("token") || "";
    const res = await nativeGetJson(`${base}${path}`, {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    });
    if (!res.ok) {
      const err = new Error(res.data?.message || res.error || "Notifications failed");
      err.response = { status: res.status, data: res.data || {} };
      throw err;
    }
    return { data: res.data };
  }
  return guardClient.get(path);
}

/**
 * Get count of unread notifications
 */
export async function getUnreadNotificationsCount() {
  if (isNativeCapable()) {
    const base = getGuardApiUrl().replace(/\/+$/, "");
    const token = localStorage.getItem("guardToken") || localStorage.getItem("token") || "";
    const res = await nativeGetJson(`${base}/api/guard/notifications/unread-count`, {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    });
    if (!res.ok) {
      const err = new Error(res.data?.message || res.error || "Unread count failed");
      err.response = { status: res.status, data: res.data || {} };
      throw err;
    }
    return { data: res.data };
  }
  return guardClient.get("/api/guard/notifications/unread-count");
}

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
export async function getCombinedAlert(shiftId, options = {}) {
  const params = {
    origin: options.origin,
    includeTransit: options.includeTransit !== false,
  };
  const qs = new URLSearchParams();
  if (params.origin != null && params.origin !== "") qs.set("origin", String(params.origin));
  if (params.includeTransit !== false) qs.set("includeTransit", "true");
  const q = qs.toString();
  const path = `/api/guard/alerts/combined/${encodeURIComponent(shiftId)}${q ? `?${q}` : ""}`;

  if (isNativeCapable()) {
    const base = getGuardApiUrl().replace(/\/+$/, "");
    const token = localStorage.getItem("guardToken") || localStorage.getItem("token") || "";
    const res = await nativeGetJson(`${base}${path}`, {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    });
    if (!res.ok) {
      const err = new Error(res.data?.message || res.error || "Alerts request failed");
      err.response = { status: res.status, data: res.data || {} };
      throw err;
    }
    return { data: res.data };
  }
  return guardClient.get(`/api/guard/alerts/combined/${encodeURIComponent(shiftId)}`, {
    params: {
      origin: options.origin,
      includeTransit: options.includeTransit !== false,
    },
  });
}

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

/* ================= SCHEDULE (weekly template) ================= */

/**
 * Bases to try for GET /api/guard/schedule (unified Railway host, or split :4000 login + :5000 admin).
 */
function scheduleBackendBases() {
  const unified = getUnifiedBackendUrl().replace(/\/+$/, "");
  const admin = getAdminApiUrl().replace(/\/+$/, "");
  const guard = getGuardApiUrl().replace(/\/+$/, "");
  const out = [];
  const push = (b) => {
    if (!b || (!b.startsWith("http://") && !b.startsWith("https://"))) return;
    if (!out.includes(b)) out.push(b);
  };
  push(unified);
  push(admin);
  push(guard);
  return out;
}

/**
 * Weekly schedule: GET /api/guard/schedule (guard JWT). Tries multiple hosts so 404s from a
 * guard-only :4000 server fall through to the admin/unified host (e.g. :5000 or Railway).
 */
export async function getGuardSchedule() {
  const headers = guardAuthHeaders();
  const bases = scheduleBackendBases();

  async function fetchFromBase(base, suffix) {
    const path = suffix.startsWith("/") ? suffix : `/${suffix}`;
    const url = `${base.replace(/\/+$/, "")}${path}`;
    if (isNativeCapable()) {
      const res = await nativeGetJson(url, headers);
      if (!res.ok) {
        const err = new Error(res.data?.message || res.data?.error || res.error || "Failed to load schedule");
        err.response = { status: res.status, data: res.data || {} };
        throw err;
      }
      return { data: res.data };
    }
    return axios.get(url, { headers, timeout: 45000 });
  }

  async function tryScheduleOnBase(base) {
    try {
      return await fetchFromBase(base, "/api/guard/schedule");
    } catch (e) {
      if (e?.response?.status === 404) {
        return await fetchFromBase(base, "/schedule");
      }
      throw e;
    }
  }

  let lastErr;
  for (const base of bases) {
    try {
      return await tryScheduleOnBase(base);
    } catch (e) {
      lastErr = e;
      if (e?.response?.status === 404) continue;
      throw e;
    }
  }
  throw lastErr;
}

/* ================= DASHBOARD ================= */

/**
 * Get comprehensive dashboard data (Personal Dashboard + Performance + Achievements)
 * Uses native HTTP on Capacitor so Android/iOS avoid WebView CORS on authenticated GET.
 */
export async function getGuardDashboard() {
  if (isNativeCapable()) {
    const base = getGuardApiUrl().replace(/\/+$/, "");
    const token = localStorage.getItem("guardToken") || localStorage.getItem("token") || "";
    const res = await nativeGetJson(`${base}/api/guard/dashboard`, {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    });
    if (!res.ok) {
      const err = new Error(res.data?.message || res.data?.error || res.error || "Failed to load dashboard");
      err.response = { status: res.status, data: res.data || {} };
      throw err;
    }
    return { data: res.data };
  }
  return guardClient.get("/api/guard/dashboard");
}

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
