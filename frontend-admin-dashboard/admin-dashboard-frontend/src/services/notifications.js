// src/services/notifications.service.js
import axiosClient from "../api/axiosClient";

/**
 * Option A:
 * Uses axiosClient (getBackendOrigin → /api/admin or Railway).
 * → ALL admin routes must start with /admin
 */

export const fetchNotifications = (limit = 25) =>
  axiosClient.get(`/notifications?limit=${limit}`);

export const markNotificationRead = (id) =>
  axiosClient.post(`/notifications/${id}/read`);

export const fetchUnreadCount = () =>
  axiosClient.get(`/notifications/unread-count`);

// Smart Notifications
export const fetchSmartNotifications = (params = {}) =>
  axiosClient.get(`/notifications/smart`, { params });

export const fetchNotificationDigest = (params = {}) =>
  axiosClient.get(`/notifications/digest`, { params });

// Notification Preferences
export const fetchNotificationPreferences = () =>
  axiosClient.get(`/notifications/preferences`);

export const updateNotificationPreferences = (data) =>
  axiosClient.put(`/notifications/preferences`, data);

export const resetNotificationPreferences = () =>
  axiosClient.post(`/notifications/preferences/reset`);
