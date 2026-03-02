import React, { useState, useEffect } from "react";
import {
  fetchNotificationPreferences,
  updateNotificationPreferences,
  resetNotificationPreferences,
} from "../services/notifications";

export default function NotificationPreferences({ onClose }) {
  const [preferences, setPreferences] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    loadPreferences();
  }, []);

  const loadPreferences = async () => {
    try {
      setLoading(true);
      const response = await fetchNotificationPreferences();
      setPreferences(response.data.data);
      setError(null);
    } catch (err) {
      console.error("Failed to load preferences:", err);
      setError("Failed to load preferences");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
      setSuccess(false);
      await updateNotificationPreferences(preferences);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      console.error("Failed to save preferences:", err);
      setError("Failed to save preferences");
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!window.confirm("Reset all preferences to defaults?")) return;

    try {
      setSaving(true);
      setError(null);
      await resetNotificationPreferences();
      await loadPreferences();
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      console.error("Failed to reset preferences:", err);
      setError("Failed to reset preferences");
    } finally {
      setSaving(false);
    }
  };

  const updatePreference = (field, value) => {
    setPreferences((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  if (loading) {
    return (
      <div style={styles.container}>
        <div style={styles.loading}>Loading preferences...</div>
      </div>
    );
  }

  if (!preferences) {
    return (
      <div style={styles.container}>
        <div style={styles.error}>Failed to load preferences</div>
      </div>
    );
  }

  const categories = ["COVERAGE", "INCIDENT", "PERSONNEL", "COMPLIANCE", "AI_INSIGHTS", "REPORTS", "GENERAL"];
  const priorities = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];
  const notificationTypes = [
    "SHIFT_CLOSED",
    "SHIFT_CREATED",
    "CALLOUT_CREATED",
    "INCIDENT_CREATED",
    "GUARD_CREATED",
    "GUARD_DELETED",
    "GUARD_AVAILABILITY_CHANGED",
    "AI_RANKING_COMPLETE",
  ];

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h2 style={styles.title}>🔔 Notification Preferences</h2>
        {onClose && (
          <button className="btn" style={styles.closeBtn} onClick={onClose}>
            ✕
          </button>
        )}
      </div>

      {error && <div style={styles.errorMsg}>{error}</div>}
      {success && <div style={styles.successMsg}>Preferences saved successfully!</div>}

      <div style={styles.content}>
        {/* Priority Filter */}
        <div style={styles.section}>
          <h3 style={styles.sectionTitle}>Priority Filter</h3>
          <div style={styles.field}>
            <label style={styles.label}>Minimum Priority</label>
            <select
              value={preferences.minPriority || ""}
              onChange={(e) => updatePreference("minPriority", e.target.value || null)}
              style={styles.select}
            >
              <option value="">Show All Priorities</option>
              {priorities.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
            <div style={styles.helpText}>
              Only show notifications at or above this priority level
            </div>
          </div>
        </div>

        {/* Category Filter */}
        <div style={styles.section}>
          <h3 style={styles.sectionTitle}>Category Filter</h3>
          <div style={styles.field}>
            <label style={styles.label}>Allowed Categories</label>
            <div style={styles.checkboxGroup}>
              {categories.map((cat) => {
                const isChecked =
                  !preferences.allowedCategories || preferences.allowedCategories.includes(cat);
                return (
                  <label key={cat} style={styles.checkbox}>
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={(e) => {
                        const current = preferences.allowedCategories || categories;
                        if (e.target.checked) {
                          // Add to array
                          if (!current.includes(cat)) {
                            updatePreference("allowedCategories", [...current, cat]);
                          }
                        } else {
                          // Remove from array
                          updatePreference(
                            "allowedCategories",
                            current.filter((c) => c !== cat)
                          );
                        }
                      }}
                    />
                    <span>{cat}</span>
                  </label>
                );
              })}
            </div>
            <div style={styles.helpText}>
              Select which categories of notifications to receive
            </div>
          </div>
        </div>

        {/* Type Filter */}
        <div style={styles.section}>
          <h3 style={styles.sectionTitle}>Notification Type Filter</h3>
          <div style={styles.field}>
            <label style={styles.label}>Blocked Types</label>
            <div style={styles.checkboxGroup}>
              {notificationTypes.map((type) => {
                const isBlocked = (preferences.blockedTypes || []).includes(type);
                return (
                  <label key={type} style={styles.checkbox}>
                    <input
                      type="checkbox"
                      checked={isBlocked}
                      onChange={(e) => {
                        const current = preferences.blockedTypes || [];
                        if (e.target.checked) {
                          updatePreference("blockedTypes", [...current, type]);
                        } else {
                          updatePreference("blockedTypes", current.filter((t) => t !== type));
                        }
                      }}
                    />
                    <span>{type.replace(/_/g, " ")}</span>
                  </label>
                );
              })}
            </div>
            <div style={styles.helpText}>
              Check to block specific notification types
            </div>
          </div>
        </div>

        {/* Delivery Preferences */}
        <div style={styles.section}>
          <h3 style={styles.sectionTitle}>Delivery Preferences</h3>
          <div style={styles.field}>
            <label style={styles.checkbox}>
              <input
                type="checkbox"
                checked={preferences.enableRealtime}
                onChange={(e) => updatePreference("enableRealtime", e.target.checked)}
              />
              <span>Enable Real-time Notifications</span>
            </label>
          </div>
          <div style={styles.field}>
            <label style={styles.checkbox}>
              <input
                type="checkbox"
                checked={preferences.enableDigest}
                onChange={(e) => updatePreference("enableDigest", e.target.checked)}
              />
              <span>Enable Digest Summaries</span>
            </label>
          </div>
          {preferences.enableDigest && (
            <div style={styles.field}>
              <label style={styles.label}>Digest Frequency</label>
              <select
                value={preferences.digestFrequency || "DAILY"}
                onChange={(e) => updatePreference("digestFrequency", e.target.value)}
                style={styles.select}
              >
                <option value="HOURLY">Hourly</option>
                <option value="DAILY">Daily</option>
                <option value="WEEKLY">Weekly</option>
              </select>
            </div>
          )}
        </div>

        {/* Display Preferences */}
        <div style={styles.section}>
          <h3 style={styles.sectionTitle}>Display Preferences</h3>
          <div style={styles.field}>
            <label style={styles.label}>Group By</label>
            <select
              value={preferences.groupBy || "PRIORITY"}
              onChange={(e) => updatePreference("groupBy", e.target.value)}
              style={styles.select}
            >
              <option value="PRIORITY">Priority</option>
              <option value="CATEGORY">Category</option>
              <option value="NONE">None (List View)</option>
            </select>
          </div>
          <div style={styles.field}>
            <label style={styles.checkbox}>
              <input
                type="checkbox"
                checked={preferences.showAIInsights}
                onChange={(e) => updatePreference("showAIInsights", e.target.checked)}
              />
              <span>Show AI Insights</span>
            </label>
          </div>
          <div style={styles.field}>
            <label style={styles.checkbox}>
              <input
                type="checkbox"
                checked={preferences.showQuickActions}
                onChange={(e) => updatePreference("showQuickActions", e.target.checked)}
              />
              <span>Show Quick Actions</span>
            </label>
          </div>
        </div>

        {/* Sound Preferences */}
        <div style={styles.section}>
          <h3 style={styles.sectionTitle}>Sound & Alerts</h3>
          <div style={styles.field}>
            <label style={styles.checkbox}>
              <input
                type="checkbox"
                checked={preferences.enableSound}
                onChange={(e) => updatePreference("enableSound", e.target.checked)}
              />
              <span>Enable Sound Alerts</span>
            </label>
          </div>
          {preferences.enableSound && (
            <div style={styles.field}>
              <label style={styles.label}>Sound For Priority</label>
              <select
                value={preferences.soundForPriority || "HIGH"}
                onChange={(e) => updatePreference("soundForPriority", e.target.value)}
                style={styles.select}
              >
                <option value="CRITICAL">Critical Only</option>
                <option value="HIGH">High and Above</option>
                <option value="MEDIUM">Medium and Above</option>
                <option value="LOW">All Notifications</option>
                <option value="ALL">All (including low priority)</option>
              </select>
            </div>
          )}
        </div>

        {/* Actions */}
        <div style={styles.actions}>
          <button
            className="btn"
            style={{ ...styles.btn, ...styles.btnPrimary }}
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? "Saving..." : "Save Preferences"}
          </button>
          <button
            className="btn"
            style={{ ...styles.btn, ...styles.btnSecondary }}
            onClick={handleReset}
            disabled={saving}
          >
            Reset to Defaults
          </button>
        </div>
      </div>
    </div>
  );
}

const styles = {
  container: {
    background: "rgba(15,23,42,0.98)",
    borderRadius: 14,
    border: "1px solid rgba(148,163,184,0.22)",
    maxWidth: 600,
    margin: "0 auto",
    color: "rgba(255,255,255,0.9)",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
    borderBottom: "1px solid rgba(148,163,184,0.16)",
  },
  title: {
    fontSize: 20,
    fontWeight: 700,
    margin: 0,
    color: "#ffffff",
  },
  closeBtn: {
    padding: "6px 12px",
    borderRadius: 8,
    fontSize: 14,
  },
  content: {
    padding: 20,
    maxHeight: "70vh",
    overflow: "auto",
  },
  section: {
    marginBottom: 32,
    paddingBottom: 24,
    borderBottom: "1px solid rgba(148,163,184,0.12)",
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 700,
    marginBottom: 16,
    color: "#ffffff",
  },
  field: {
    marginBottom: 16,
  },
  label: {
    display: "block",
    fontSize: 13,
    fontWeight: 600,
    marginBottom: 8,
    color: "rgba(255,255,255,0.8)",
  },
  select: {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 8,
    border: "1px solid rgba(148,163,184,0.3)",
    background: "rgba(255,255,255,0.1)",
    color: "#ffffff",
    fontSize: 14,
  },
  checkboxGroup: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  checkbox: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 13,
    cursor: "pointer",
    color: "rgba(255,255,255,0.8)",
  },
  helpText: {
    fontSize: 11,
    color: "rgba(255,255,255,0.5)",
    marginTop: 4,
  },
  actions: {
    display: "flex",
    gap: 12,
    marginTop: 24,
    paddingTop: 24,
    borderTop: "1px solid rgba(148,163,184,0.16)",
  },
  btn: {
    padding: "12px 24px",
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
    border: "none",
  },
  btnPrimary: {
    background: "rgba(59,130,246,0.2)",
    border: "1px solid rgba(59,130,246,0.5)",
    color: "#60a5fa",
  },
  btnSecondary: {
    background: "rgba(148,163,184,0.1)",
    border: "1px solid rgba(148,163,184,0.3)",
    color: "rgba(255,255,255,0.8)",
  },
  errorMsg: {
    padding: 12,
    background: "rgba(239,68,68,0.1)",
    border: "1px solid rgba(239,68,68,0.3)",
    borderRadius: 8,
    color: "#ef4444",
    marginBottom: 16,
    fontSize: 13,
  },
  successMsg: {
    padding: 12,
    background: "rgba(16,185,129,0.1)",
    border: "1px solid rgba(16,185,129,0.3)",
    borderRadius: 8,
    color: "#10b981",
    marginBottom: 16,
    fontSize: 13,
  },
  loading: {
    padding: 40,
    textAlign: "center",
    color: "rgba(255,255,255,0.5)",
  },
  error: {
    padding: 40,
    textAlign: "center",
    color: "#ef4444",
  },
};
