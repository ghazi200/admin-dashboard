import React, { useEffect, useState, useMemo } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { connectSocket } from "../realtime/socket";
import { getSchedule, updateSchedule, listGuards } from "../services/api";

export default function Schedule() {
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [editedBuilding, setEditedBuilding] = useState({ name: "", location: "" });
  const [editedSchedule, setEditedSchedule] = useState([]);
  const [guards, setGuards] = useState([]);

  // Fetch guards for dropdown
  const { data: guardsData } = useQuery({
    queryKey: ["guards"],
    queryFn: async () => {
      const response = await listGuards();
      return response.data?.data || response.data || [];
    },
  });

  useEffect(() => {
    if (guardsData) {
      setGuards(Array.isArray(guardsData) ? guardsData : []);
    }
  }, [guardsData]);

  // Use React Query for data fetching with automatic refetching
  const {
    data: schedule,
    isLoading: loading,
    error: err,
    refetch,
  } = useQuery({
    queryKey: ["schedule"],
    queryFn: async () => {
      const response = await getSchedule();
      return response.data;
    },
    refetchInterval: isEditing ? false : 30000, // Don't refetch while editing
    refetchOnWindowFocus: !isEditing,
    staleTime: 15000, // Consider data stale after 15 seconds
  });

  // Initialize edited state when schedule loads
  useEffect(() => {
    if (schedule && !isEditing) {
      setEditedBuilding({
        name: schedule.building?.name || "",
        location: schedule.building?.location || "",
      });
      // Create editable schedule template from current schedule
      const template = schedule.schedule?.map((day) => ({
        day: day.day,
        shifts: day.shifts.map((shift) => ({
          id: shift.id,
          time: shift.time,
          start: shift.start,
          end: shift.end,
          scheduledGuard: shift.scheduledGuard || shift.guard,
          hours: shift.hours,
        })),
      })) || [];
      setEditedSchedule(template);
    }
  }, [schedule, isEditing]);

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async (data) => {
      const response = await updateSchedule(data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["schedule"] });
      setIsEditing(false);
    },
  });

  // =============================
  // ✅ LIVE UPDATES via Socket.IO
  // =============================
  useEffect(() => {
    const s = connectSocket();
    if (!s) return;

    const refreshSchedule = async () => {
      console.log("🔄 Refreshing schedule due to socket event...");
      try {
        await queryClient.invalidateQueries({ queryKey: ["schedule"] });
        await refetch();
        console.log("✅ Schedule refreshed!");
      } catch (err) {
        console.error("❌ Error refreshing schedule:", err);
      }
    };

    // Listen for shift-related events
    const onShiftFilled = (payload) => {
      console.log("📡 shift_filled event received", payload);
      refreshSchedule();
    };

    const onCalloutResponse = (payload) => {
      console.log("📡 callout_response event received", payload);
      refreshSchedule();
    };

    const onCalloutStarted = (payload) => {
      console.log("📡 callout_started event received", payload);
      refreshSchedule();
    };

    const onCalloutUpdate = (payload) => {
      console.log("📡 callout_update event received", payload);
      refreshSchedule();
    };

    // Listen for any shift creation/update events
    const onShiftCreated = (payload) => {
      console.log("📡 shift_created event received", payload);
      refreshSchedule();
    };

    const onShiftUpdated = (payload) => {
      console.log("📡 shift_updated event received", payload);
      refreshSchedule();
    };

    const onScheduleUpdated = (payload) => {
      console.log("📡 schedule_updated event received", payload);
      refreshSchedule();
    };

    // Generic handler for any schedule-related events
    const onAnyEvent = (eventName, ...args) => {
      // Refresh on any shift or callout related events
      if (
        eventName.includes("shift") ||
        eventName.includes("callout") ||
        eventName.includes("schedule")
      ) {
        console.log(`📡 Schedule-related event detected: ${eventName}`);
        refreshSchedule();
      }
    };

    // Attach listeners
    const attachListeners = () => {
      s.off("shift_filled", onShiftFilled);
      s.off("callout_response", onCalloutResponse);
      s.off("callout_started", onCalloutStarted);
      s.off("callout_update", onCalloutUpdate);
      s.off("shift_created", onShiftCreated);
      s.off("shift_updated", onShiftUpdated);
      s.off("schedule_updated", onScheduleUpdated);

      s.on("shift_filled", onShiftFilled);
      s.on("callout_response", onCalloutResponse);
      s.on("callout_started", onCalloutStarted);
      s.on("callout_update", onCalloutUpdate);
      s.on("shift_created", onShiftCreated);
      s.on("shift_updated", onShiftUpdated);
      s.on("schedule_updated", onScheduleUpdated);

      // Use onAny if available for debugging
      if (typeof s.onAny === "function") {
        s.offAny();
        s.onAny(onAnyEvent);
      }

      console.log("✅ Schedule socket listeners attached");
    };

    attachListeners();

    // Re-attach on reconnect
    const onConnect = () => {
      console.log("✅ Socket connected, re-attaching schedule listeners...");
      attachListeners();
    };

    s.on("connect", onConnect);

    return () => {
      // Cleanup
      s.off("shift_filled", onShiftFilled);
      s.off("callout_response", onCalloutResponse);
      s.off("callout_started", onCalloutStarted);
      s.off("callout_update", onCalloutUpdate);
      s.off("shift_created", onShiftCreated);
      s.off("shift_updated", onShiftUpdated);
      s.off("schedule_updated", onScheduleUpdated);
      s.off("connect", onConnect);
      if (typeof s.offAny === "function") {
        s.offAny();
      }
    };
  }, [queryClient, refetch]);

  // Extract schedule data safely (hooks must be called before early returns)
  const building = schedule?.building;
  const scheduleData = schedule?.schedule;
  const originalGuardHours = schedule?.guardHours || {};
  const summary = schedule?.summary;

  // Calculate guard hours from edited schedule when in edit mode
  // This hook must be called before any early returns
  const calculatedGuardHours = useMemo(() => {
    if (!isEditing || !editedSchedule || editedSchedule.length === 0) {
      return originalGuardHours;
    }

    const hoursMap = {};
    
    editedSchedule.forEach((day) => {
      day.shifts?.forEach((shift) => {
        const guardName = shift.scheduledGuard || "";
        if (guardName) {
          if (!hoursMap[guardName]) {
            hoursMap[guardName] = 0;
          }
          hoursMap[guardName] += shift.hours || 0;
        }
      });
    });

    return hoursMap;
  }, [isEditing, editedSchedule, originalGuardHours]);

  // Use calculated hours when editing, otherwise use original
  const displayGuardHours = isEditing ? calculatedGuardHours : originalGuardHours;

  // Early returns after all hooks
  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: "center" }}>
        <div style={{ opacity: 0.7 }}>Loading schedule...</div>
      </div>
    );
  }

  if (err) {
    return (
      <div style={{ padding: 40 }}>
        <div style={{ color: "#ef4444", marginBottom: 20 }}>
          Error: {err?.response?.data?.message || err?.message || "Failed to load schedule"}
        </div>
        <button
          onClick={() => refetch()}
          style={{
            padding: "8px 16px",
            cursor: "pointer",
            background: "#3b82f6",
            color: "white",
            border: "none",
            borderRadius: 8,
            fontWeight: 600,
          }}
        >
          Retry
        </button>
      </div>
    );
  }

  if (!schedule || !scheduleData) {
    return (
      <div style={{ padding: 40, textAlign: "center" }}>
        <div style={{ opacity: 0.7 }}>No schedule data available</div>
      </div>
    );
  }

  const handleSave = async () => {
    try {
      await updateMutation.mutateAsync({
        buildingName: editedBuilding.name,
        buildingLocation: editedBuilding.location,
        scheduleTemplate: editedSchedule,
      });
    } catch (error) {
      console.error("Failed to save schedule:", error);
    }
  };

  const handleCancel = () => {
    setIsEditing(false);
    // Reset to original values
    if (schedule) {
      setEditedBuilding({
        name: schedule.building?.name || "",
        location: schedule.building?.location || "",
      });
      const template = schedule.schedule?.map((day) => ({
        day: day.day,
        shifts: day.shifts.map((shift) => ({
          id: shift.id,
          time: shift.time,
          start: shift.start,
          end: shift.end,
          scheduledGuard: shift.scheduledGuard || shift.guard,
          hours: shift.hours,
        })),
      })) || [];
      setEditedSchedule(template);
    }
  };

  const updateGuardAssignment = (dayIndex, shiftIndex, guardName) => {
    const updated = [...editedSchedule];
    updated[dayIndex].shifts[shiftIndex].scheduledGuard = guardName;
    setEditedSchedule(updated);
  };

  const updateShiftTime = (dayIndex, shiftIndex, field, value) => {
    const updated = [...editedSchedule];
    const shift = updated[dayIndex].shifts[shiftIndex];
    
    if (field === "start") {
      shift.start = value;
      // Update time display
      const startTime = value || "00:00";
      const endTime = shift.end || "00:00";
      shift.time = `${formatTimeForDisplay(startTime)} - ${formatTimeForDisplay(endTime)}`;
      // Recalculate hours
      shift.hours = calculateHours(startTime, endTime);
    } else if (field === "end") {
      shift.end = value;
      // Update time display
      const startTime = shift.start || "00:00";
      const endTime = value || "00:00";
      shift.time = `${formatTimeForDisplay(startTime)} - ${formatTimeForDisplay(endTime)}`;
      // Recalculate hours
      shift.hours = calculateHours(startTime, endTime);
    }
    
    setEditedSchedule(updated);
  };

  const updateShiftHours = (dayIndex, shiftIndex, hours) => {
    const updated = [...editedSchedule];
    updated[dayIndex].shifts[shiftIndex].hours = parseFloat(hours) || 0;
    setEditedSchedule(updated);
  };

  const addShift = (dayIndex) => {
    const updated = [...editedSchedule];
    const newShift = {
      id: `NEW-${Date.now()}`,
      time: "9:00 AM - 5:00 PM",
      start: "09:00",
      end: "17:00",
      scheduledGuard: "",
      hours: 8,
    };
    updated[dayIndex].shifts.push(newShift);
    setEditedSchedule(updated);
  };

  const removeShift = (dayIndex, shiftIndex) => {
    const updated = [...editedSchedule];
    updated[dayIndex].shifts.splice(shiftIndex, 1);
    setEditedSchedule(updated);
  };

  const formatTimeForDisplay = (time) => {
    if (!time) return "12:00 AM";
    const [hours, minutes] = time.split(":");
    const h = parseInt(hours);
    const ampm = h >= 12 ? "PM" : "AM";
    const displayHour = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${displayHour}:${minutes || "00"} ${ampm}`;
  };

  const calculateHours = (start, end) => {
    if (!start || !end) return 0;
    const [startHour, startMin] = start.split(":").map(Number);
    const [endHour, endMin] = end.split(":").map(Number);
    
    let startTotal = startHour * 60 + (startMin || 0);
    let endTotal = endHour * 60 + (endMin || 0);
    
    // Handle overnight shifts (end time is next day)
    if (endTotal < startTotal) {
      endTotal += 24 * 60; // Add 24 hours
    }
    
    const diffMinutes = endTotal - startTotal;
    return Math.round((diffMinutes / 60) * 10) / 10; // Round to 1 decimal
  };

  return (
    <div style={{ padding: 20 }}>
      <div style={{ marginBottom: 30, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h1 style={{ margin: 0, marginBottom: 8, fontSize: 28, fontWeight: 800 }}>
            Schedule
          </h1>
          <div style={{ opacity: 0.7, fontSize: 14 }}>
            Weekly guard schedule and building information
          </div>
        </div>
        {!isEditing ? (
          <button
            onClick={() => setIsEditing(true)}
            style={{
              padding: "10px 20px",
              background: "#3b82f6",
              color: "white",
              border: "none",
              borderRadius: 8,
              fontWeight: 600,
              cursor: "pointer",
              fontSize: 14,
            }}
          >
            Edit Schedule
          </button>
        ) : (
          <div style={{ display: "flex", gap: 10 }}>
            <button
              onClick={handleCancel}
              disabled={updateMutation.isPending}
              style={{
                padding: "10px 20px",
                background: "#64748b",
                color: "white",
                border: "none",
                borderRadius: 8,
                fontWeight: 600,
                cursor: "pointer",
                fontSize: 14,
                opacity: updateMutation.isPending ? 0.5 : 1,
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={updateMutation.isPending}
              style={{
                padding: "10px 20px",
                background: "#22c55e",
                color: "white",
                border: "none",
                borderRadius: 8,
                fontWeight: 600,
                cursor: "pointer",
                fontSize: 14,
                opacity: updateMutation.isPending ? 0.5 : 1,
              }}
            >
              {updateMutation.isPending ? "Saving..." : "Save Changes"}
            </button>
          </div>
        )}
      </div>

      {/* Building Information */}
      <div
        style={{
          background: "rgba(255,255,255,0.95)",
          borderRadius: 14,
          padding: 24,
          marginBottom: 24,
          border: "1px solid rgba(0,0,0,0.08)",
          boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
        }}
      >
        <div style={{ fontWeight: 800, marginBottom: 16, fontSize: 18, color: "#1e293b" }}>
          Building Information
        </div>
        <div style={{ display: "grid", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ opacity: 0.6, fontSize: 14, minWidth: 100 }}>Building ID:</span>
            <span style={{ fontWeight: 700, color: "#3b82f6", fontSize: 15 }}>{building.id}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ opacity: 0.6, fontSize: 14, minWidth: 100 }}>Name:</span>
            {isEditing ? (
              <input
                type="text"
                value={editedBuilding.name}
                onChange={(e) => setEditedBuilding({ ...editedBuilding, name: e.target.value })}
                style={{
                  flex: 1,
                  padding: "8px 12px",
                  border: "1px solid #e2e8f0",
                  borderRadius: 6,
                  fontSize: 15,
                  fontWeight: 600,
                }}
              />
            ) : (
              <span style={{ fontWeight: 600, color: "#1e293b" }}>{building.name}</span>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ opacity: 0.6, fontSize: 14, minWidth: 100 }}>Location:</span>
            {isEditing ? (
              <input
                type="text"
                value={editedBuilding.location}
                onChange={(e) => setEditedBuilding({ ...editedBuilding, location: e.target.value })}
                style={{
                  flex: 1,
                  padding: "8px 12px",
                  border: "1px solid #e2e8f0",
                  borderRadius: 6,
                  fontSize: 15,
                  fontWeight: 600,
                }}
              />
            ) : (
              <span style={{ fontWeight: 600, color: "#1e293b" }}>{building.location}</span>
            )}
          </div>
        </div>
      </div>

      {/* Summary */}
      <div
        style={{
          background: "rgba(255,255,255,0.95)",
          borderRadius: 14,
          padding: 24,
          marginBottom: 24,
          border: "1px solid rgba(0,0,0,0.08)",
          boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
        }}
      >
        <div style={{ fontWeight: 800, marginBottom: 20, fontSize: 18, color: "#1e293b" }}>
          Schedule Summary
        </div>
        <div style={{ display: "flex", gap: 32, flexWrap: "wrap" }}>
          <div style={{ padding: "12px 0" }}>
            <div style={{ opacity: 0.65, fontSize: 13, marginBottom: 6, color: "#64748b" }}>
              Total Guards
            </div>
            <div style={{ fontSize: 32, fontWeight: 900, color: "#3b82f6" }}>{summary.totalGuards}</div>
          </div>
          <div style={{ padding: "12px 0" }}>
            <div style={{ opacity: 0.65, fontSize: 13, marginBottom: 6, color: "#64748b" }}>
              Shifts Per Day
            </div>
            <div style={{ fontSize: 32, fontWeight: 900, color: "#8b5cf6" }}>{summary.totalShiftsPerDay}</div>
          </div>
          <div style={{ padding: "12px 0" }}>
            <div style={{ opacity: 0.65, fontSize: 13, marginBottom: 6, color: "#64748b" }}>
              Hours Per Shift
            </div>
            <div style={{ fontSize: 32, fontWeight: 900, color: "#22c55e" }}>{summary.hoursPerShift}</div>
          </div>
          <div style={{ padding: "12px 0" }}>
            <div style={{ opacity: 0.65, fontSize: 13, marginBottom: 6, color: "#64748b" }}>
              Weekly Hours Per Guard
            </div>
            <div style={{ fontSize: 32, fontWeight: 900, color: "#f59e0b" }}>{summary.weeklyHoursPerGuard}</div>
          </div>
        </div>
      </div>

      {/* Weekly Schedule */}
      <div style={{ marginBottom: 30 }}>
        <div style={{ fontWeight: 800, marginBottom: 20, fontSize: 20, color: "#1e293b" }}>
          Weekly Schedule
        </div>
        <div style={{ display: "grid", gap: 16 }}>
          {scheduleData.map((day, dayIdx) => {
            const isWeekend = day.day === "Saturday" || day.day === "Sunday";
            return (
              <div
                key={dayIdx}
                style={{
                  background: "rgba(255,255,255,0.95)",
                  borderRadius: 14,
                  padding: 20,
                  border: isWeekend 
                    ? "1px solid rgba(139,92,246,0.25)" 
                    : "1px solid rgba(0,0,0,0.08)",
                  boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
                }}
              >
                <div
                  style={{
                    fontWeight: 800,
                    marginBottom: 18,
                    fontSize: 17,
                    paddingBottom: 14,
                    borderBottom: isWeekend
                      ? "2px solid rgba(139,92,246,0.2)"
                      : "2px solid rgba(59,130,246,0.2)",
                    color: isWeekend ? "#7c3aed" : "#3b82f6",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <span>{day.day}</span>
                  {day.date && (
                    <span style={{ fontSize: 13, fontWeight: 600, opacity: 0.7 }}>
                      {new Date(day.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                  )}
                </div>
                <div style={{ display: "grid", gap: 10 }}>
                  {(isEditing ? editedSchedule[dayIdx]?.shifts || [] : day.shifts).map((shift, shiftIdx) => {
                    // Color code by shift time
                    let shiftColor = "#3b82f6"; // Default blue
                    let bgColor = "rgba(59,130,246,0.08)";
                    if (shift.start === "07:00") {
                      shiftColor = "#22c55e"; // Green for morning
                      bgColor = "rgba(34,197,94,0.08)";
                    } else if (shift.start === "15:00") {
                      shiftColor = "#f59e0b"; // Orange for afternoon
                      bgColor = "rgba(245,158,11,0.08)";
                    } else if (shift.start === "23:00") {
                      shiftColor = "#6366f1"; // Indigo for night
                      bgColor = "rgba(99,102,241,0.08)";
                    }
                    
                    const displayGuard = isEditing ? shift.scheduledGuard : shift.guard;
                    
                    return (
                      <div
                        key={shiftIdx}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 12,
                          padding: 14,
                          background: isWeekend ? "rgba(255,255,255,0.95)" : bgColor,
                          borderRadius: 10,
                          border: `1px solid ${shiftColor}20`,
                          flexWrap: isEditing ? "wrap" : "nowrap",
                        }}
                      >
                        {isEditing ? (
                          <>
                            {/* Time inputs */}
                            <div style={{ display: "flex", gap: 8, alignItems: "center", minWidth: 200 }}>
                              <input
                                type="time"
                                value={shift.start || "09:00"}
                                onChange={(e) => updateShiftTime(dayIdx, shiftIdx, "start", e.target.value)}
                                style={{
                                  padding: "6px 10px",
                                  border: "1px solid #e2e8f0",
                                  borderRadius: 6,
                                  fontSize: 13,
                                  fontWeight: 600,
                                  background: "white",
                                  width: 90,
                                }}
                              />
                              <span style={{ color: shiftColor, fontWeight: 700 }}>to</span>
                              <input
                                type="time"
                                value={shift.end || "17:00"}
                                onChange={(e) => updateShiftTime(dayIdx, shiftIdx, "end", e.target.value)}
                                style={{
                                  padding: "6px 10px",
                                  border: "1px solid #e2e8f0",
                                  borderRadius: 6,
                                  fontSize: 13,
                                  fontWeight: 600,
                                  background: "white",
                                  width: 90,
                                }}
                              />
                            </div>
                            {/* Guard assignment */}
                            <select
                              value={shift.scheduledGuard || ""}
                              onChange={(e) => updateGuardAssignment(dayIdx, shiftIdx, e.target.value)}
                              style={{
                                flex: 1,
                                padding: "8px 12px",
                                border: "1px solid #e2e8f0",
                                borderRadius: 6,
                                fontSize: 14,
                                fontWeight: 600,
                                background: "white",
                                cursor: "pointer",
                                minWidth: 150,
                              }}
                            >
                              <option value="">Unassigned</option>
                              {guards.map((guard) => (
                                <option key={guard.id} value={guard.name}>
                                  {guard.name}
                                </option>
                              ))}
                            </select>
                            {/* Hours input */}
                            <input
                              type="number"
                              min="0"
                              step="0.5"
                              value={shift.hours || 0}
                              onChange={(e) => updateShiftHours(dayIdx, shiftIdx, e.target.value)}
                              style={{
                                width: 80,
                                padding: "6px 10px",
                                border: "1px solid #e2e8f0",
                                borderRadius: 6,
                                fontSize: 13,
                                fontWeight: 600,
                                background: "white",
                                textAlign: "center",
                              }}
                            />
                            <span style={{ fontSize: 13, color: "#64748b", minWidth: 50 }}>hours</span>
                            {/* Remove button */}
                            <button
                              onClick={() => removeShift(dayIdx, shiftIdx)}
                              style={{
                                padding: "6px 12px",
                                background: "#ef4444",
                                color: "white",
                                border: "none",
                                borderRadius: 6,
                                fontSize: 12,
                                fontWeight: 600,
                                cursor: "pointer",
                              }}
                            >
                              Remove
                            </button>
                          </>
                        ) : (
                          <>
                            <div 
                              style={{ 
                                minWidth: 200, 
                                fontWeight: 700, 
                                color: shiftColor,
                                fontSize: 15,
                              }}
                            >
                              {shift.time}
                            </div>
                            <div style={{ 
                              flex: 1, 
                              fontWeight: 600, 
                              color: isWeekend ? "#1e293b" : "#1e293b", 
                              fontSize: 15,
                            }}>
                              {displayGuard}
                            </div>
                            <div 
                              style={{ 
                                opacity: 0.75, 
                                fontSize: 13, 
                                fontWeight: 600,
                                color: "#64748b",
                                padding: "4px 10px",
                                background: "rgba(0,0,0,0.04)",
                                borderRadius: 6,
                              }}
                            >
                              {shift.hours} hours
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })}
                  {isEditing && (
                    <button
                      onClick={() => addShift(dayIdx)}
                      style={{
                        marginTop: 10,
                        padding: "10px 16px",
                        background: "#3b82f6",
                        color: "white",
                        border: "none",
                        borderRadius: 8,
                        fontSize: 13,
                        fontWeight: 600,
                        cursor: "pointer",
                        width: "100%",
                      }}
                    >
                      + Add Shift
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Guard Hours Summary */}
      <div
        style={{
          background: "rgba(255,255,255,0.95)",
          borderRadius: 14,
          padding: 24,
          border: "1px solid rgba(0,0,0,0.08)",
          boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
        }}
      >
        <div style={{ fontWeight: 800, marginBottom: 20, fontSize: 18, color: "#1e293b", display: "flex", alignItems: "center", gap: 10 }}>
          Weekly Hours by Guard
          {isEditing && (
            <span style={{ fontSize: 12, fontWeight: 600, color: "#3b82f6", opacity: 0.8 }}>
              (Live updates)
            </span>
          )}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 14 }}>
          {Object.entries(displayGuardHours).map(([guard, hours], idx) => {
            const colors = [
              { bg: "rgba(59,130,246,0.1)", border: "rgba(59,130,246,0.2)", text: "#3b82f6" },
              { bg: "rgba(139,92,246,0.1)", border: "rgba(139,92,246,0.2)", text: "#8b5cf6" },
              { bg: "rgba(34,197,94,0.1)", border: "rgba(34,197,94,0.2)", text: "#22c55e" },
              { bg: "rgba(245,158,11,0.1)", border: "rgba(245,158,11,0.2)", text: "#f59e0b" },
              { bg: "rgba(239,68,68,0.1)", border: "rgba(239,68,68,0.2)", text: "#ef4444" },
              { bg: "rgba(99,102,241,0.1)", border: "rgba(99,102,241,0.2)", text: "#6366f1" },
            ];
            const color = colors[idx % colors.length];
            
            return (
              <div
                key={guard}
                style={{
                  padding: 16,
                  background: color.bg,
                  borderRadius: 10,
                  border: `1px solid ${color.border}`,
                }}
              >
                <div style={{ opacity: 0.75, fontSize: 13, marginBottom: 8, color: "#64748b", fontWeight: 600 }}>
                  {guard}
                </div>
                <div style={{ fontSize: 24, fontWeight: 900, color: color.text }}>
                  {hours} hours
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
