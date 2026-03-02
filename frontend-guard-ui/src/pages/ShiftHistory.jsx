import React, { useState, useEffect } from "react";
import NavBar from "../components/NavBar";
import { useAuth } from "../auth/AuthContext";
import { getShiftHistory, getShiftAnalytics } from "../services/shiftManagement.api";
import OvertimeBreakdown from "../components/OvertimeBreakdown";
import "../styles/styles.css";

export default function ShiftHistory() {
  const { user } = useAuth();
  const guardId = user?.id || user?.guard_id;
  
  const [history, setHistory] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [period, setPeriod] = useState("month"); // "week" | "month" | "year"
  const [filter, setFilter] = useState("all"); // "all" | "overtime" | "no-overtime"
  const [sortBy, setSortBy] = useState("date"); // "date" | "hours" | "overtime"

  // Fetch shift history
  useEffect(() => {
    if (!guardId) return;
    
    setIsLoading(true);
    Promise.all([
      getShiftHistory(guardId, { limit: 50 }),
      getShiftAnalytics(guardId, period),
    ])
      .then(([historyRes, analyticsRes]) => {
        // getShiftHistory returns: { history: [...], analytics: {...} }
        // Axios wraps it in: { data: { history: [...], analytics: {...} } }
        const historyResponseData = historyRes?.data || {};
        const historyData = historyResponseData.history || [];
        
        // getShiftAnalytics returns: { period: "...", stats: {...} }
        // Use analytics from history response, or fallback to analytics response
        let analyticsData = historyResponseData.analytics || null;
        
        // If using separate analytics endpoint, extract stats
        if (!analyticsData && analyticsRes?.data?.stats) {
          analyticsData = analyticsRes.data.stats;
        }
        
        // Normalize field names (handle both formats)
        if (analyticsData) {
          // Ensure field names match what frontend expects
          if (analyticsData.stats) {
            analyticsData = analyticsData.stats;
          }
        }
        
        setHistory(Array.isArray(historyData) ? historyData : []);
        setAnalytics(analyticsData);
        
        setError(null);
      })
      .catch((err) => {
        console.error("Failed to load shift history:", err);
        setError(err.response?.data?.message || "Failed to load shift history");
        setHistory([]);
        setAnalytics(null);
      })
      .finally(() => setIsLoading(false));
  }, [guardId, period]);

  const formatDate = (dateStr) => {
    if (!dateStr) return "—";
    return new Date(dateStr).toLocaleDateString();
  };

  const formatTime = (timeStr) => {
    if (!timeStr) return "—";
    return timeStr;
  };

  const getStatusClass = (status) => {
    if (!status) return "";
    const statusStr = String(status).toLowerCase().trim();
    
    // Match the status mapping from ShiftSwapMarketplace
    if (["closed", "filled", "assigned", "completed", "accepted", "approved", "finished"].includes(statusStr)) {
      return "state--ok"; // Green
    }
    
    if (["open", "pending", "in_progress", "running_late", "late", "scheduled"].includes(statusStr)) {
      return "state--warn"; // Amber
    }
    
    if (["callout", "cancelled", "failed", "declined", "no_response", "error", "rejected"].includes(statusStr)) {
      return "state--bad"; // Red
    }
    
    return ""; // Default - no special class
  };

  if (!guardId) {
    return (
      <div>
        <NavBar />
        <div style={{ padding: 40, textAlign: "center" }}>
          Please log in to view shift history.
        </div>
      </div>
    );
  }

  return (
    <div>
      <NavBar />
      <div style={{ padding: 20, maxWidth: 1200, margin: "0 auto" }}>
        <h2 style={{ marginBottom: 20, color: "#111827" }}>Shift History & Analytics</h2>
        
        {/* Filters and Period Selector */}
        <div style={{ marginBottom: 20, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <label style={{ fontWeight: 600, color: "#374151" }}>Period:</label>
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #ccc" }}
          >
            <option value="week">Last Week</option>
            <option value="month">Last Month</option>
            <option value="year">Last Year</option>
          </select>
          
          <label style={{ fontWeight: 600, color: "#374151", marginLeft: 16 }}>Filter:</label>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #ccc" }}
          >
            <option value="all">All Shifts</option>
            <option value="overtime">With Overtime</option>
            <option value="no-overtime">No Overtime</option>
          </select>
          
          <label style={{ fontWeight: 600, color: "#374151", marginLeft: 16 }}>Sort:</label>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #ccc" }}
          >
            <option value="date">Date (Newest)</option>
            <option value="hours">Total Hours</option>
            <option value="overtime">Overtime Hours</option>
          </select>
        </div>

        {/* Overtime Insights */}
        {analytics && analytics.overtime_hours != null && (analytics.overtime_hours > 0 || analytics.double_time_hours > 0) && (
          <div style={{
            padding: 16,
            background: "linear-gradient(135deg, rgba(249, 115, 22, 0.9) 0%, rgba(239, 68, 68, 0.9) 100%)",
            borderRadius: 12,
            border: "1px solid rgba(249, 115, 22, 0.5)",
            marginBottom: 20,
            boxShadow: "0 4px 6px rgba(0, 0, 0, 0.1)",
          }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: "#ffffff", marginBottom: 8 }}>
              💡 Overtime Insights
            </div>
            <div style={{ fontSize: 13, color: "#ffffff", lineHeight: 1.6, fontWeight: 500 }}>
              You worked <strong style={{ color: "#ffffff", fontWeight: 700 }}>{(analytics.overtime_hours + analytics.double_time_hours).toFixed(1)} hours</strong> of overtime this {period === "week" ? "week" : period === "month" ? "month" : "year"}.
              {analytics.shifts_with_overtime > 0 && (
                <span> This includes <strong style={{ color: "#ffffff", fontWeight: 700 }}>{analytics.shifts_with_overtime} shift{analytics.shifts_with_overtime !== 1 ? 's' : ''}</strong> with overtime.</span>
              )}
              {analytics.overtime_percentage > 0 && (
                <span> Overtime represents <strong style={{ color: "#ffffff", fontWeight: 700 }}>{analytics.overtime_percentage.toFixed(1)}%</strong> of your total hours.</span>
              )}
            </div>
          </div>
        )}

        {/* Analytics Summary */}
        {analytics && (
          <div style={{ 
            display: "grid", 
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", 
            gap: 16, 
            marginBottom: 30 
          }}>
            <div style={{ 
              padding: 20, 
              background: "#fff", 
              borderRadius: 12, 
              boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
              border: "1px solid rgba(0,0,0,0.1)"
            }}>
              <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 8 }}>Total Shifts</div>
              <div style={{ fontSize: 24, fontWeight: 600, color: "#111827" }}>{analytics.total_shifts || 0}</div>
            </div>
            <div style={{ 
              padding: 20, 
              background: "#fff", 
              borderRadius: 12, 
              boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
              border: "1px solid rgba(0,0,0,0.1)"
            }}>
              <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 8 }}>Hours Worked</div>
              <div style={{ fontSize: 24, fontWeight: 600, color: "#111827" }}>
                {analytics.total_hours != null && analytics.total_hours > 0 
                  ? analytics.total_hours.toFixed(1) 
                  : analytics.total_hours === 0 
                    ? "0.0" 
                    : "—"}
              </div>
              {analytics.regular_hours != null && (
                <div style={{ fontSize: 11, color: "#6b7280", marginTop: 4 }}>
                  {analytics.regular_hours.toFixed(1)}h reg
                  {analytics.overtime_hours > 0 && ` + ${analytics.overtime_hours.toFixed(1)}h OT`}
                  {analytics.double_time_hours > 0 && ` + ${analytics.double_time_hours.toFixed(1)}h DT`}
                </div>
              )}
            </div>
            {analytics.overtime_hours != null && (analytics.overtime_hours > 0 || analytics.double_time_hours > 0) && (
              <div style={{ 
                padding: 20, 
                background: "#fff", 
                borderRadius: 12, 
                boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
                border: "1px solid rgba(0,0,0,0.1)"
              }}>
                <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 8 }}>Overtime</div>
                <div style={{ fontSize: 24, fontWeight: 600, color: "#f97316" }}>
                  {(analytics.overtime_hours + analytics.double_time_hours).toFixed(1)}h
                </div>
                <div style={{ fontSize: 11, color: "#6b7280", marginTop: 4 }}>
                  {analytics.shifts_with_overtime || 0} shift{analytics.shifts_with_overtime !== 1 ? 's' : ''} with OT
                </div>
                {analytics.overtime_percentage > 0 && (
                  <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>
                    {analytics.overtime_percentage.toFixed(1)}% of total hours
                  </div>
                )}
              </div>
            )}
            <div style={{ 
              padding: 20, 
              background: "#fff", 
              borderRadius: 12, 
              boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
              border: "1px solid rgba(0,0,0,0.1)"
            }}>
              <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 8 }}>Avg Hours/Shift</div>
              <div style={{ fontSize: 24, fontWeight: 600, color: "#111827" }}>
                {analytics.avg_hours_per_shift != null && analytics.avg_hours_per_shift > 0
                  ? analytics.avg_hours_per_shift.toFixed(1)
                  : analytics.avg_hours_per_shift === 0
                    ? "0.0"
                    : "—"}
              </div>
            </div>
            <div style={{ 
              padding: 20, 
              background: "#fff", 
              borderRadius: 12, 
              boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
              border: "1px solid rgba(0,0,0,0.1)"
            }}>
              <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 8 }}>Completion Rate</div>
              <div style={{ fontSize: 24, fontWeight: 600, color: "#111827" }}>
                {analytics.completion_rate ? `${(analytics.completion_rate * 100).toFixed(0)}%` : "0%"}
              </div>
            </div>
          </div>
        )}

        {/* Shift History List */}
        <h3 style={{ marginBottom: 16, color: "#111827" }}>Recent Shifts</h3>
        {isLoading ? (
          <div style={{ padding: 40, textAlign: "center", color: "#6b7280" }}>Loading...</div>
        ) : error ? (
          <div style={{ padding: 40, textAlign: "center", color: "#dc2626" }}>
            {error}
          </div>
        ) : history.length === 0 ? (
          <div style={{ color: "#6b7280", padding: 40, textAlign: "center" }}>
            No shift history found
          </div>
        ) : (
          <div style={{ display: "grid", gap: 16 }}>
            {(() => {
              // Apply filters and sorting
              let filteredHistory = [...history];
              
              // Filter by overtime
              if (filter === "overtime") {
                filteredHistory = filteredHistory.filter(s => 
                  (parseFloat(s.overtime_hours) || 0) > 0 || (parseFloat(s.double_time_hours) || 0) > 0
                );
              } else if (filter === "no-overtime") {
                filteredHistory = filteredHistory.filter(s => 
                  (parseFloat(s.overtime_hours) || 0) === 0 && (parseFloat(s.double_time_hours) || 0) === 0
                );
              }
              
              // Sort
              filteredHistory.sort((a, b) => {
                if (sortBy === "date") {
                  return new Date(b.shift_date) - new Date(a.shift_date);
                } else if (sortBy === "hours") {
                  return (parseFloat(b.hours_worked) || 0) - (parseFloat(a.hours_worked) || 0);
                } else if (sortBy === "overtime") {
                  const aOT = (parseFloat(a.overtime_hours) || 0) + (parseFloat(a.double_time_hours) || 0);
                  const bOT = (parseFloat(b.overtime_hours) || 0) + (parseFloat(b.double_time_hours) || 0);
                  return bOT - aOT;
                }
                return 0;
              });
              
              return filteredHistory;
            })().map((shift) => {
              const statusClass = getStatusClass(shift.status);
              
              return (
                <div
                  key={shift.shift_id || shift.id}
                  style={{
                    padding: 16,
                    border: "1px solid rgba(0,0,0,0.1)",
                    borderRadius: 12,
                    background: "#fff",
                    boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
                    color: "#1f2937", // Dark text color
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: 8 }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 16, color: "#111827" }}>
                        {formatDate(shift.shift_date)} {formatTime(shift.shift_start)} - {formatTime(shift.shift_end)}
                      </div>
                      <div style={{ fontSize: 13, color: "#4b5563", marginTop: 4 }}>
                        {shift.location || shift.guard_name || "Location TBD"}
                      </div>
                      {shift.hours_worked != null && shift.hours_worked > 0 ? (
                        <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>
                          {parseFloat(shift.hours_worked).toFixed(1)} hours
                        </div>
                      ) : shift.clock_in_at ? (
                        <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 4, fontStyle: "italic" }}>
                          Clocked in (no clock out)
                        </div>
                      ) : null}
                      {/* Overtime Breakdown */}
                      {shift.hours_worked != null && shift.hours_worked > 0 && (
                        <div style={{ marginTop: 8 }}>
                          <OvertimeBreakdown
                            regularHours={shift.regular_hours || 0}
                            overtimeHours={shift.overtime_hours || 0}
                            doubleTimeHours={shift.double_time_hours || 0}
                            totalHours={shift.hours_worked}
                            compact={true}
                          />
                        </div>
                      )}
                    </div>
                    <span
                      className={`badge ${statusClass || ""}`.trim()}
                      style={{
                        // Minimal inline styles - let CSS classes handle colors
                        padding: "4px 12px",
                        borderRadius: 12,
                        fontSize: 12,
                        fontWeight: 600,
                      }}
                      data-status={shift.status}
                      data-status-class={statusClass}
                      title={`Status: ${shift.status || "unknown"} | Class: ${statusClass || "none"}`}
                    >
                      {shift.status || "unknown"}
                    </span>
                  </div>
                
                  {shift.notes && (
                    <div style={{ marginTop: 8, padding: 8, background: "rgba(0,0,0,0.03)", borderRadius: 8 }}>
                      <div style={{ fontSize: 12, color: "#6b7280", fontWeight: 600 }}>Notes:</div>
                      <div style={{ color: "#374151", marginTop: 4 }}>{shift.notes}</div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
