import React, { useEffect, useState } from "react";
import NavBar from "../components/NavBar";
import { guardClient } from "../api/axiosClients";
import "./shifts.css";

export default function Schedule() {
  const [schedule, setSchedule] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    loadSchedule();
  }, []);

  async function loadSchedule() {
    setLoading(true);
    setErr("");
    try {
      // Call abe-guard-ai schedule endpoint
      console.log("📅 Loading schedule...");
      const res = await guardClient.get("/schedule");
      console.log("✅ Schedule loaded:", res.data);
      console.log("📅 Schedule data:", res.data?.schedule);
      if (res.data?.schedule && res.data.schedule.length > 0) {
        const monday = res.data.schedule.find(d => d.day === "Monday");
        if (monday) {
          console.log("📅 Monday shifts:", monday.shifts);
          monday.shifts.forEach(s => {
            console.log(`  ${s.time}: ${s.guard} (scheduled: ${s.scheduledGuard})`);
          });
        }
      }
      setSchedule(res.data);
    } catch (e) {
      console.error("❌ Schedule error:", e);
      console.error("Response:", e?.response?.data);
      setErr(e?.response?.data?.message || e?.message || "Failed to load schedule");
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div>
        <NavBar />
        <div style={{ padding: 40, textAlign: "center" }}>
          <div style={{ opacity: 0.7 }}>Loading schedule...</div>
        </div>
      </div>
    );
  }

  if (err) {
    return (
      <div>
        <NavBar />
        <div style={{ padding: 40 }}>
          <div style={{ color: "#ef4444", marginBottom: 20, fontSize: 16, fontWeight: 600 }}>
            Error: {err}
          </div>
          <div style={{ color: "#64748b", marginBottom: 20, fontSize: 14 }}>
            Please check the browser console for more details.
          </div>
          <button 
            onClick={loadSchedule} 
            style={{ 
              padding: "10px 20px", 
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
      </div>
    );
  }

  if (!schedule) {
    return (
      <div>
        <NavBar />
        <div style={{ padding: 40, textAlign: "center" }}>
          <div style={{ opacity: 0.7 }}>No schedule data available</div>
        </div>
      </div>
    );
  }

  // Safely destructure schedule data with defaults
  const building = schedule?.building || {};
  const scheduleData = schedule?.schedule || [];
  const guardHours = schedule?.guardHours || {};
  const summary = schedule?.summary || {};

  return (
    <div>
      <NavBar />
      <div style={{ padding: 20, maxWidth: 1200, margin: "0 auto" }}>
        <div style={{ marginBottom: 30 }}>
          <h1 style={{ margin: 0, marginBottom: 8, fontSize: 28, fontWeight: 800 }}>
            Schedule
          </h1>
          <div style={{ opacity: 0.7, fontSize: 14 }}>
            Weekly guard schedule and building information
          </div>
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
              <span style={{ fontWeight: 600, color: "#1e293b" }}>{building.name}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ opacity: 0.6, fontSize: 14, minWidth: 100 }}>Location:</span>
              <span style={{ fontWeight: 600, color: "#1e293b" }}>{building.location}</span>
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
                    }}
                  >
                    {day.day}
                  </div>
                  <div style={{ display: "grid", gap: 10 }}>
                    {day.shifts.map((shift, shiftIdx) => {
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
                      
                      return (
                        <div
                          key={shiftIdx}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 20,
                            padding: 14,
                            background: isWeekend ? "rgba(255,255,255,0.95)" : bgColor,
                            borderRadius: 10,
                            border: `1px solid ${shiftColor}20`,
                          }}
                        >
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
                            textShadow: isWeekend ? "none" : "none",
                          }}>
                            {shift.guard}
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
                        </div>
                      );
                    })}
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
          <div style={{ fontWeight: 800, marginBottom: 20, fontSize: 18, color: "#1e293b" }}>
            Weekly Hours by Guard
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 14 }}>
            {Object.entries(guardHours).map(([guard, hours], idx) => {
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
    </div>
  );
}
