/**
 * Availability Preferences Component
 * 
 * For use in guard-ui (port 3000)
 * Allows guards to set their availability preferences
 */

import React, { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getAvailabilityPreferences,
  updateAvailabilityPreferences,
} from "../../services/api";

export default function AvailabilityPreferences({ guardId }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    preferred_days: [],
    preferred_times: [],
    blocked_dates: [],
    min_hours_per_week: null,
    max_hours_per_week: null,
    preferred_locations: [],
  });

  // Fetch current preferences
  const { data, isLoading } = useQuery({
    queryKey: ["availabilityPreferences", guardId],
    queryFn: () => getAvailabilityPreferences(guardId),
    enabled: !!guardId,
    onSuccess: (data) => {
      if (data?.data) {
        setForm(data.data);
      }
    },
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: (data) => updateAvailabilityPreferences({ ...data, guard_id: guardId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["availabilityPreferences"] });
      alert("Preferences updated successfully!");
    },
    onError: (error) => {
      alert(`Failed: ${error.response?.data?.message || error.message}`);
    },
  });

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

  const handleSubmit = (e) => {
    e.preventDefault();
    updateMutation.mutate(form);
  };

  if (isLoading) {
    return <div>Loading preferences...</div>;
  }

  return (
    <div style={{ padding: 20 }}>
      <h3>Availability Preferences</h3>
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
                style={{ textTransform: "capitalize" }}
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
                style={{ textTransform: "capitalize" }}
              >
                {time}
              </button>
            ))}
          </div>
        </div>

        {/* Hours Per Week */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>
          <div>
            <label style={{ display: "block", marginBottom: 8 }}>Min Hours/Week</label>
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
              style={{ width: "100%", padding: 8, borderRadius: 8 }}
            />
          </div>
          <div>
            <label style={{ display: "block", marginBottom: 8 }}>Max Hours/Week</label>
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
              style={{ width: "100%", padding: 8, borderRadius: 8 }}
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
              style={{ padding: 8, borderRadius: 8 }}
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
                    background: "rgba(239, 68, 68, 0.2)",
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
          disabled={updateMutation.isPending}
        >
          {updateMutation.isPending ? "Saving..." : "Save Preferences"}
        </button>
      </form>
    </div>
  );
}
