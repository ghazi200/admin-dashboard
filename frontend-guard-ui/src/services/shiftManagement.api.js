import axios from "axios";
import { getAdminApiUrl } from "../config/apiUrls";

/**
 * Shift Management API Client
 * Connects to admin-dashboard backend (port 5000). baseURL set per-request so
 * Android emulator uses 10.0.2.2:5000 when admin backend is running on host.
 */
const shiftManagementClient = axios.create({
  timeout: 20000,
  headers: {
    "Content-Type": "application/json",
  },
});

shiftManagementClient.interceptors.request.use((config) => {
  config.baseURL = `${getAdminApiUrl()}/api`;
  const token = localStorage.getItem("guardToken");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle errors
shiftManagementClient.interceptors.response.use(
  (res) => res,
  (error) => {
    const status = error?.response?.status;
    if (status === 401) {
      const msg = String(error?.response?.data?.message || "");
      const looksLikeBadToken =
        msg.toLowerCase().includes("jwt expired") ||
        msg.toLowerCase().includes("invalid token") ||
        msg.toLowerCase().includes("invalid signature");

      if (looksLikeBadToken) {
        localStorage.removeItem("guardToken");
        localStorage.removeItem("guardUser");
        if (!window.location.pathname.includes("/login")) {
          window.location.href = "/login";
        }
      }
    }
    return Promise.reject(error);
  }
);

// ==================== Shift Swap Marketplace ====================

/**
 * Request a shift swap
 * @param {Object} data - { shift_id, target_guard_id (optional), reason (optional) }
 */
export const requestShiftSwap = (data) =>
  shiftManagementClient.post("/guards/shifts/swap/request", data);

/**
 * Get available shift swaps
 * @param {string} guardId - Current guard's ID
 */
export const getAvailableSwaps = (guardId) =>
  shiftManagementClient.get(`/guards/shifts/swap/available?guard_id=${guardId}`);

/**
 * Accept a shift swap
 * @param {string} swapId - Swap ID to accept
 * @param {string} guardId - Current guard's ID
 */
export const acceptShiftSwap = (swapId, guardId) =>
  shiftManagementClient.post(`/guards/shifts/swap/${swapId}/accept`, { guard_id: guardId });

/**
 * Cancel a shift swap request
 * @param {string} swapId - Swap ID to cancel
 */
export const cancelShiftSwap = (swapId) =>
  shiftManagementClient.delete(`/guards/shifts/swap/${swapId}/cancel`);

// ==================== Availability Preferences ====================

/**
 * Get guard's availability preferences
 * @param {string} guardId - Guard ID
 */
export const getAvailabilityPreferences = (guardId) =>
  shiftManagementClient.get(`/guards/availability/preferences?guard_id=${guardId}`);

/**
 * Update guard's availability preferences
 * @param {Object} data - Preferences object
 */
export const updateAvailabilityPreferences = (data) =>
  shiftManagementClient.put("/guards/availability/preferences", data);

// ==================== Shift Reports ====================

/**
 * Submit a shift report
 * @param {string} shiftId - Shift ID
 * @param {Object} data - Report data { notes, report_type, photos }
 */
export const submitShiftReport = (shiftId, data) =>
  shiftManagementClient.post(`/guards/shifts/${shiftId}/report`, data);

/**
 * Get shift report
 * @param {string} shiftId - Shift ID
 */
export const getShiftReport = (shiftId) =>
  shiftManagementClient.get(`/guards/shifts/${shiftId}/report`);

// ==================== Shift History & Analytics ====================

/**
 * Get shift history
 * @param {string} guardId - Guard ID
 * @param {Object} params - Query params { start_date, end_date, status, limit, offset }
 */
export const getShiftHistory = (guardId, params = {}) => {
  const queryParams = new URLSearchParams({ guard_id: guardId, ...params }).toString();
  return shiftManagementClient.get(`/guards/shifts/history?${queryParams}`);
};

/**
 * Get shift analytics
 * @param {string} guardId - Guard ID
 * @param {string} period - "week" | "month" | "year"
 */
export const getShiftAnalytics = (guardId, period = "month") =>
  shiftManagementClient.get(`/guards/shifts/analytics?guard_id=${guardId}&period=${period}`);
