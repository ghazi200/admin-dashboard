// src/components/ShiftNotifications.jsx
import React, { useEffect, useState } from "react";
import {
  getGuardNotifications,
  getUnreadNotificationsCount,
  markNotificationAsRead,
  markAllNotificationsAsRead,
} from "../services/guardApi";
import "./ShiftNotifications.css";

/**
 * ShiftNotifications Component
 * 
 * Displays shift change alerts for guards
 */
export default function ShiftNotifications() {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showAll, setShowAll] = useState(false);

  // Load notifications
  const loadNotifications = async () => {
    try {
      setLoading(true);
      setError(null);

      const [notificationsRes, countRes] = await Promise.all([
        getGuardNotifications({ limit: showAll ? 50 : 5 }),
        getUnreadNotificationsCount(),
      ]);

      setNotifications(notificationsRes.data?.notifications || []);
      setUnreadCount(countRes.data?.unreadCount || 0);
    } catch (err) {
      console.error("Failed to load notifications:", err);
      setError(err.response?.data?.error || err.message || "Failed to load notifications");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadNotifications();
    const interval = setInterval(loadNotifications, 30000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showAll]);

  const handleMarkAsRead = async (notificationId) => {
    try {
      await markNotificationAsRead(notificationId);
      // Update local state
      setNotifications((prev) =>
        prev.map((n) => (n.id === notificationId ? { ...n, read_at: new Date().toISOString() } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch (err) {
      console.error("Failed to mark notification as read:", err);
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      await markAllNotificationsAsRead();
      // Update local state
      setNotifications((prev) => prev.map((n) => ({ ...n, read_at: new Date().toISOString() })));
      setUnreadCount(0);
    } catch (err) {
      console.error("Failed to mark all as read:", err);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return "—";
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return "—";
    
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return "just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    
    return date.toLocaleDateString();
  };

  const getNotificationIcon = (type) => {
    switch (type) {
      case "SHIFT_ASSIGNED":
        return "✅";
      case "SHIFT_CANCELLED":
        return "❌";
      case "SHIFT_TIME_CHANGED":
        return "🕐";
      case "SHIFT_DATE_CHANGED":
        return "📅";
      case "SHIFT_LOCATION_CHANGED":
        return "📍";
      case "SHIFT_UNASSIGNED":
        return "⚠️";
      default:
        return "🔔";
    }
  };

  const displayNotifications = showAll ? notifications : notifications.slice(0, 5);

  if (loading && notifications.length === 0) {
    return (
      <div className="shift-notifications">
        <div className="notifications-header">
          <h3>Shift Alerts</h3>
        </div>
        <div className="notifications-loading">Loading notifications...</div>
      </div>
    );
  }

  return (
    <div className="shift-notifications">
      <div className="notifications-header">
        <h3>
          Shift Alerts
          {unreadCount > 0 && <span className="unread-badge">{unreadCount}</span>}
        </h3>
        {unreadCount > 0 && (
          <button className="mark-all-read-btn" onClick={handleMarkAllAsRead}>
            Mark all read
          </button>
        )}
      </div>

      {error && <div className="notifications-error">Error: {error}</div>}

      {displayNotifications.length === 0 ? (
        <div className="notifications-empty">No notifications yet.</div>
      ) : (
        <div className="notifications-list">
          {displayNotifications.map((notification) => {
            const isUnread = !notification.read_at;
            return (
              <div
                key={notification.id}
                className={`notification-item ${isUnread ? "unread" : ""}`}
              >
                <div className="notification-icon">{getNotificationIcon(notification.type)}</div>
                <div className="notification-content">
                  <div className="notification-title">{notification.title}</div>
                  <div className="notification-message">{notification.message}</div>
                  <div className="notification-time">{formatDate(notification.created_at)}</div>
                </div>
                {isUnread && (
                  <button
                    className="mark-read-btn"
                    onClick={() => handleMarkAsRead(notification.id)}
                    title="Mark as read"
                  >
                    ✓
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {notifications.length > 5 && (
        <button className="show-more-btn" onClick={() => setShowAll(!showAll)}>
          {showAll ? "Show less" : `Show all (${notifications.length})`}
        </button>
      )}
    </div>
  );
}
