// src/components/BreakTimer.jsx
import React, { useState, useEffect } from "react";
import "./BreakTimer.css";

/**
 * BreakTimer Component
 * Displays a visual countdown timer for breaks with alerts
 * 
 * @param {Object} props
 * @param {string} props.lunchStartAt - ISO timestamp when break started
 * @param {number} props.breakLimitMinutes - Maximum break duration in minutes (default: 30)
 * @param {string} props.shiftId - Optional shift ID for tracking
 */
const BreakTimer = ({ lunchStartAt, breakLimitMinutes = 30, shiftId = null }) => {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [remainingSeconds, setRemainingSeconds] = useState(breakLimitMinutes * 60);
  const [alertLevel, setAlertLevel] = useState(null); // null, 'warning', 'critical'
  const [hasShownWarning, setHasShownWarning] = useState(false);
  const [hasShownCritical, setHasShownCritical] = useState(false);

  useEffect(() => {
    if (!lunchStartAt) return;

    const breakStartTime = new Date(lunchStartAt);
    const breakLimitMs = breakLimitMinutes * 60 * 1000;

    const updateTimer = () => {
      const now = new Date();
      const elapsedMs = now - breakStartTime;
      const elapsed = Math.floor(elapsedMs / 1000);
      const remaining = Math.max(0, Math.floor((breakLimitMs - elapsedMs) / 1000));

      setElapsedSeconds(elapsed);
      setRemainingSeconds(remaining);

      // Determine alert level
      const remainingMinutes = remaining / 60;
      if (remainingMinutes <= 1 && remaining > 0) {
        setAlertLevel("critical");
        if (!hasShownCritical) {
          setHasShownCritical(true);
          // Show browser notification if permission granted
          if ("Notification" in window && Notification.permission === "granted") {
            new Notification("⏰ Break Ending Soon", {
              body: "1 minute remaining on your break",
              icon: "/favicon.ico",
              tag: `break-critical-${shiftId || "default"}`,
            });
          }
        }
      } else if (remainingMinutes <= 5 && remaining > 0) {
        setAlertLevel("warning");
        if (!hasShownWarning) {
          setHasShownWarning(true);
          // Show browser notification if permission granted
          if ("Notification" in window && Notification.permission === "granted") {
            new Notification("⏱️ Break Time Reminder", {
              body: "5 minutes remaining on your break",
              icon: "/favicon.ico",
              tag: `break-warning-${shiftId || "default"}`,
            });
          }
        }
      } else {
        setAlertLevel(null);
      }
    };

    // Update immediately
    updateTimer();

    // Update every second
    const interval = setInterval(updateTimer, 1000);

    return () => clearInterval(interval);
  }, [lunchStartAt, breakLimitMinutes, shiftId, hasShownWarning, hasShownCritical]);

  // Request notification permission on mount (if not already granted)
  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission().catch((err) => {
        console.warn("Notification permission request failed:", err);
      });
    }
  }, []);

  if (!lunchStartAt) return null;

  // Format time as MM:SS
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  };

  // Calculate progress percentage
  const progressPercent = Math.min(100, (elapsedSeconds / (breakLimitMinutes * 60)) * 100);

  // Determine if over limit
  const isOverLimit = remainingSeconds === 0 && elapsedSeconds > breakLimitMinutes * 60;

  return (
    <div className={`break-timer ${alertLevel || ""} ${isOverLimit ? "over-limit" : ""}`}>
      <div className="break-timer-header">
        <span className="break-timer-icon">⏱️</span>
        <span className="break-timer-title">Break Timer</span>
      </div>

      <div className="break-timer-content">
        {/* Elapsed Time */}
        <div className="break-timer-stat">
          <span className="break-timer-label">Elapsed:</span>
          <span className="break-timer-value">{formatTime(elapsedSeconds)}</span>
        </div>

        {/* Remaining Time */}
        <div className="break-timer-stat">
          <span className="break-timer-label">Remaining:</span>
          <span className={`break-timer-value ${isOverLimit ? "over-limit" : ""}`}>
            {isOverLimit ? "0:00" : formatTime(remainingSeconds)}
          </span>
        </div>

        {/* Progress Bar */}
        <div className="break-timer-progress">
          <div
            className="break-timer-progress-bar"
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        {/* Alert Messages */}
        {alertLevel === "critical" && (
          <div className="break-timer-alert critical">
            ⚠️ <strong>1 minute remaining!</strong> Please prepare to end your break.
          </div>
        )}

        {alertLevel === "warning" && alertLevel !== "critical" && (
          <div className="break-timer-alert warning">
            ⏱️ <strong>5 minutes remaining</strong> on your break.
          </div>
        )}

        {isOverLimit && (
          <div className="break-timer-alert over-limit">
            ⛔ <strong>Break time exceeded!</strong> Please end your break now.
          </div>
        )}

        {/* Break Limit Info */}
        <div className="break-timer-info">
          Break limit: {breakLimitMinutes} minutes
        </div>
      </div>
    </div>
  );
};

export default BreakTimer;
