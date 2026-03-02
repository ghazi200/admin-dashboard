import React, { useState, useEffect } from "react";
import NavBar from "../components/NavBar";
import { useAuth } from "../auth/AuthContext";
import {
  getAvailabilityPreferences,
  updateAvailabilityPreferences,
} from "../services/shiftManagement.api";

export default function AvailabilityPreferences() {
  const { user } = useAuth();
  const guardId = user?.id || user?.guard_id;
  
  const [form, setForm] = useState({
    preferred_days: [],
    preferred_times: [],
    blocked_dates: [],
    min_hours_per_week: null,
    max_hours_per_week: null,
    preferred_locations: [],
  });
  
  const [isLoading, setIsLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // Fetch current preferences
  useEffect(() => {
    if (!guardId) return;
    
    setIsLoading(true);
    getAvailabilityPreferences(guardId)
      .then((res) => {
        const data = res?.data?.data || res?.data || {};
        setForm({
          preferred_days: data.preferred_days || [],
          preferred_times: data.preferred_times || [],
          blocked_dates: data.blocked_dates || [],
          min_hours_per_week: data.min_hours_per_week || null,
          max_hours_per_week: data.max_hours_per_week || null,
          preferred_locations: data.preferred_locations || [],
        });
        setError(null);
      })
      .catch((err) => {
        console.error("Failed to load preferences:", err);
        const msg = err.response?.data?.message || err?.message || "";
        const isNetwork = err?.code === "ECONNREFUSED" || err?.code === "ERR_NETWORK" || /network|failed to fetch/i.test(msg);
        setError(
          isNetwork
            ? "Failed to load preferences. Start the Admin Dashboard backend (port 5000): cd admin-dashboard/backend && node server.js"
            : msg || "Failed to load preferences"
        );
      })
      .finally(() => setIsLoading(false));
  }, [guardId]);

  const days = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
  const times = ["morning", "afternoon", "evening", "night"];

  const toggleArrayItem = (array, item) => {
    if (array.includes(item)) {
      return array.filter((i) => i !== item);
    }
    return [...array, item];
  };

  const handleDayToggle = (day) => {
    setForm((prev) => ({
      ...prev,
      preferred_days: toggleArrayItem(prev.preferred_days || [], day),
    }));
  };

  const handleTimeToggle = (time) => {
    setForm((prev) => ({
      ...prev,
      preferred_times: toggleArrayItem(prev.preferred_times || [], time),
    }));
  };

  const handleBlockDate = (e) => {
    const date = e.target.value;
    if (date && !form.blocked_dates?.includes(date)) {
      setForm((prev) => ({
        ...prev,
        blocked_dates: [...(prev.blocked_dates || []), date],
      }));
      e.target.value = "";
    }
  };

  const removeBlockedDate = (date) => {
    setForm((prev) => ({
      ...prev,
      blocked_dates: (prev.blocked_dates || []).filter((d) => d !== date),
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!guardId) return;
    
    setSaving(true);
    try {
      await updateAvailabilityPreferences({ ...form, guard_id: guardId });
      alert("Preferences updated successfully!");
    } catch (err) {
      alert(`Failed: ${err.response?.data?.message || err.message}`);
    } finally {
      setSaving(false);
    }
  };

  if (!guardId) {
    return (
      <div>
        <NavBar />
        <div style={{ padding: 40, textAlign: "center" }}>
          Please log in to view availability preferences.
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div>
        <NavBar />
        <div style={{ padding: 40, textAlign: "center" }}>Loading preferences...</div>
      </div>
    );
  }

  return (
    <div>
      <NavBar />
      <div style={{ padding: 20, maxWidth: 800, margin: "0 auto" }}>
        <h2 style={{ marginBottom: 20 }}>Availability Preferences</h2>
        
        {error && (
          <div style={{ padding: 12, background: "#fee", color: "#c33", borderRadius: 8, marginBottom: 20 }}>
            {error}
          </div>
        )}
        
        <form onSubmit={handleSubmit}>
          {/* Preferred Days */}
          <div style={{ marginBottom: 24 }}>
            <label style={{ display: "block", marginBottom: 12, fontWeight: 600 }}>
              Preferred Days
            </label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {days.map((day) => (
                <button
                  key={day}
                  type="button"
                  onClick={() => handleDayToggle(day)}
                  className={`btn ${form.preferred_days?.includes(day) ? "btn-primary" : ""}`}
                  style={{ textTransform: "capitalize", padding: "8px 16px" }}
                >
                  {day}
                </button>
              ))}
            </div>
          </div>

          {/* Preferred Times */}
          <div style={{ marginBottom: 24 }}>
            <label style={{ display: "block", marginBottom: 12, fontWeight: 600 }}>
              Preferred Times
            </label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {times.map((time) => (
                <button
                  key={time}
                  type="button"
                  onClick={() => handleTimeToggle(time)}
                  className={`btn ${form.preferred_times?.includes(time) ? "btn-primary" : ""}`}
                  style={{ textTransform: "capitalize", padding: "8px 16px" }}
                >
                  {time}
                </button>
              ))}
            </div>
          </div>

          {/* Hours Per Week */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>
            <div>
              <label style={{ display: "block", marginBottom: 8, fontWeight: 600 }}>
                Min Hours/Week
              </label>
              <input
                type="number"
                min="0"
                value={form.min_hours_per_week || ""}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    min_hours_per_week: e.target.value ? parseInt(e.target.value) : null,
                  }))
                }
                style={{ width: "100%", padding: 8, borderRadius: 8, border: "1px solid #ccc" }}
              />
            </div>
            <div>
              <label style={{ display: "block", marginBottom: 8, fontWeight: 600 }}>
                Max Hours/Week
              </label>
              <input
                type="number"
                min="0"
                value={form.max_hours_per_week || ""}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    max_hours_per_week: e.target.value ? parseInt(e.target.value) : null,
                  }))
                }
                style={{ width: "100%", padding: 8, borderRadius: 8, border: "1px solid #ccc" }}
              />
            </div>
          </div>

          {/* Blocked Dates */}
          <div style={{ marginBottom: 24 }}>
            <label style={{ display: "block", marginBottom: 12, fontWeight: 600 }}>
              Blocked Dates (Unavailable)
            </label>
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              <input
                type="date"
                onChange={handleBlockDate}
                style={{ padding: 8, borderRadius: 8, border: "1px solid #ccc" }}
              />
            </div>
            {form.blocked_dates?.length > 0 && (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {form.blocked_dates.map((date) => (
                  <span
                    key={date}
                    className="badge"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      background: "#ef4444",
                      color: "#fff",
                      padding: "4px 12px",
                      borderRadius: 12,
                      fontSize: 12,
                    }}
                  >
                    {new Date(date).toLocaleDateString()}
                    <button
                      type="button"
                      onClick={() => removeBlockedDate(date)}
                      style={{
                        background: "none",
                        border: "none",
                        color: "inherit",
                        cursor: "pointer",
                        padding: 0,
                        marginLeft: 4,
                        fontSize: 16,
                      }}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            disabled={saving}
            style={{ padding: "10px 20px" }}
          >
            {saving ? "Saving..." : "Save Preferences"}
          </button>
        </form>
      </div>
    </div>
  );
}
