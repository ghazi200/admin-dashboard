// src/pages/Announcements.jsx
import React, { useEffect, useState } from "react";
import NavBar from "../components/NavBar";
import { getAnnouncements, markAnnouncementAsRead } from "../services/guardApi";
import "./announcements.css";

const CATEGORY_LABELS = {
  COMPANY_WIDE: "Company Announcement",
  SITE_SPECIFIC: "Site Notice",
  POLICY_UPDATE: "Policy Update",
  SHIFT_CHANGE: "Shift Change",
  EMERGENCY_ALERT: "Emergency Alert",
  TRAINING_NOTICE: "Training Notice",
  SYSTEM_UPDATE: "System Update",
};

const PRIORITY_COLORS = {
  CRITICAL: "#dc2626",
  HIGH: "#ea580c",
  MEDIUM: "#f59e0b",
  LOW: "#3b82f6",
};

const PRIORITY_ICONS = {
  CRITICAL: "🚨",
  HIGH: "⚠️",
  MEDIUM: "ℹ️",
  LOW: "📢",
};

function formatDate(dateString) {
  if (!dateString) return "";
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch (e) {
    return dateString;
  }
}

export default function Announcements() {
  const [announcements, setAnnouncements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [unreadCount, setUnreadCount] = useState(0);

  const loadAnnouncements = async () => {
    setError("");
    setLoading(true);
    try {
      // Check if token exists before making request
      const token = localStorage.getItem("guardToken");
      if (!token) {
        setError("Not authenticated. Please log in.");
        setLoading(false);
        return;
      }

      const response = await getAnnouncements();
      const data = response.data?.data || response.data || [];
      setAnnouncements(data);
      setUnreadCount(response.data?.unreadCount || 0);
    } catch (e) {
      const errorMsg = e?.response?.data?.message || e?.message || "Failed to load announcements";
      setError(errorMsg);
      
      // If it's an auth error, suggest logging in
      if (errorMsg.includes("Authorization") || errorMsg.includes("Unauthorized")) {
        console.error("Auth error - token may be missing or invalid");
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAnnouncements();
  }, []);

  const handleMarkAsRead = async (announcementId, isRead) => {
    if (isRead) return; // Already read

    try {
      await markAnnouncementAsRead(announcementId);
      // Update local state
      setAnnouncements((prev) =>
        prev.map((a) =>
          a.id === announcementId
            ? { ...a, isRead: true, readAt: new Date().toISOString() }
            : a
        )
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch (e) {
      console.error("Failed to mark as read:", e);
    }
  };

  // Group announcements by read status
  const unreadAnnouncements = announcements.filter((a) => !a.isRead);
  const readAnnouncements = announcements.filter((a) => a.isRead);

  return (
    <>
      <NavBar />
      <div className="page">
        <div className="announcementsHeader">
          <h1>Announcements & Notices</h1>
          {unreadCount > 0 && (
            <div className="unreadBadge">
              {unreadCount} {unreadCount === 1 ? "unread" : "unread"}
            </div>
          )}
        </div>

        {error && <div className="error">{error}</div>}

        {loading ? (
          <div className="loading">Loading announcements...</div>
        ) : announcements.length === 0 ? (
          <div className="emptyState">
            <div className="emptyIcon">📭</div>
            <h2>No Announcements</h2>
            <p>You're all caught up! No new announcements at this time.</p>
          </div>
        ) : (
          <>
            {/* Unread Announcements */}
            {unreadAnnouncements.length > 0 && (
              <div className="announcementsSection">
                <h2 className="sectionTitle">
                  New ({unreadAnnouncements.length})
                </h2>
                {unreadAnnouncements.map((announcement) => (
                  <AnnouncementCard
                    key={announcement.id}
                    announcement={announcement}
                    onMarkAsRead={handleMarkAsRead}
                  />
                ))}
              </div>
            )}

            {/* Read Announcements */}
            {readAnnouncements.length > 0 && (
              <div className="announcementsSection">
                <h2 className="sectionTitle">
                  Previously Read ({readAnnouncements.length})
                </h2>
                {readAnnouncements.map((announcement) => (
                  <AnnouncementCard
                    key={announcement.id}
                    announcement={announcement}
                    onMarkAsRead={handleMarkAsRead}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}

function AnnouncementCard({ announcement, onMarkAsRead }) {
  const [isExpanded, setIsExpanded] = useState(!announcement.isRead);

  useEffect(() => {
    // Auto-expand unread announcements
    if (!announcement.isRead) {
      setIsExpanded(true);
      // Auto-mark as read when expanded
      setTimeout(() => {
        onMarkAsRead(announcement.id, announcement.isRead);
      }, 2000); // Mark as read after 2 seconds of viewing
    }
  }, [announcement.id, announcement.isRead, onMarkAsRead]);

  const categoryLabel = CATEGORY_LABELS[announcement.category] || announcement.category;
  const priorityColor = PRIORITY_COLORS[announcement.priority] || "#3b82f6";
  const priorityIcon = PRIORITY_ICONS[announcement.priority] || "📢";

  return (
    <div
      className={`announcementCard ${announcement.isRead ? "read" : "unread"}`}
      style={{ borderLeftColor: priorityColor }}
    >
      <div
        className="announcementHeader"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="announcementHeaderLeft">
          <span className="priorityIcon">{priorityIcon}</span>
          <div>
            <h3 className="announcementTitle">{announcement.title}</h3>
            <div className="announcementMeta">
              <span className="categoryBadge">{categoryLabel}</span>
              <span className="priorityBadge" style={{ color: priorityColor }}>
                {announcement.priority}
              </span>
              <span className="date">
                {formatDate(announcement.createdAt)}
              </span>
            </div>
          </div>
        </div>
        <div className="announcementHeaderRight">
          {!announcement.isRead && (
            <span className="unreadDot" style={{ backgroundColor: priorityColor }} />
          )}
          <button className="expandButton">
            {isExpanded ? "▼" : "▶"}
          </button>
        </div>
      </div>

      {isExpanded && (
        <div className="announcementBody">
          <div className="announcementMessage">{announcement.message}</div>
          
          {announcement.meta && (
            <div className="announcementMetaInfo">
              {announcement.meta.link && (
                <a
                  href={announcement.meta.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="announcementLink"
                >
                  Learn More →
                </a>
              )}
            </div>
          )}

          {announcement.expiresAt && (
            <div className="announcementExpiry">
              Expires: {formatDate(announcement.expiresAt)}
            </div>
          )}

          {announcement.isRead && announcement.readAt && (
            <div className="announcementReadStatus">
              ✓ Read on {formatDate(announcement.readAt)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
