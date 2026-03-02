// src/pages/Home.jsx
import React, { useEffect, useMemo, useState } from "react";
import NavBar from "../components/NavBar";
import { Link } from "react-router-dom";
import "./home.css";

import {
  listShifts,
  getShiftState,
  triggerCallout,
  clockIn,
  clockOut,
  breakStart,
  breakEnd,
  runningLate,
  getUnreadAnnouncementsCount,
} from "../services/guardApi";
import ShiftNotifications from "../components/ShiftNotifications";
import ShiftAlerts from "../components/ShiftAlerts";
import BreakTimer from "../components/BreakTimer";
import OvertimeStatus from "../components/OvertimeStatus";
import OvertimeOfferAlert from "../components/OvertimeOfferAlert";
import OvertimeRequestButton from "../components/OvertimeRequestButton";

// ===== Helpers =====

// Minimal JWT decode (no deps) — kept for display/debug only (NOT required for callout)
function decodeJwt(token) {
  try {
    if (!token || typeof token !== "string") return null;
    const parts = token.split(".");
    if (parts.length < 2) return null;

    let payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    while (payload.length % 4) payload += "=";

    const json = atob(payload);
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function safeDate(v) {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

function fmtDT(v) {
  const d = safeDate(v);
  return d ? d.toLocaleString() : "—";
}

// Best-effort pick current shift from /shifts response
function pickCurrentShift(shifts, guardId = null) {
  if (!Array.isArray(shifts) || !shifts.length) return null;

  const now = Date.now();

  // ✅ FIX: If guardId is provided, prefer shifts assigned to this guard
  // This ensures we pick the shift the guard actually clocked into, not just any OPEN shift
  if (guardId) {
    const assignedShift = shifts.find((s) => {
      const sGuardId = s?.guard_id ? String(s.guard_id) : null;
      return sGuardId === String(guardId);
    });
    if (assignedShift) {
      console.log(`✅ Found shift assigned to guard: ${assignedShift.id}`);
      return assignedShift;
    }
  }

  // Prefer explicit flags/status if present (but not if we have an assigned shift)
  const flagged =
    shifts.find((s) => s?.is_current || s?.isCurrent || s?.status === "in_progress" || s?.status === "OPEN") ||
    null;
  if (flagged) return flagged;

  // ✅ FIX: Use correct field names from API (shift_date, shift_start, shift_end)
  // Combine shift_date + shift_start/shift_end to create proper datetime
  const spanning =
    shifts.find((s) => {
      // Try multiple field name variations for compatibility
      const shiftDate = s?.shift_date || s?.shiftDate || s?.date || s?.shiftDate;
      const shiftStart = s?.shift_start || s?.shiftStart || s?.start_time || s?.startTime || s?.start_at || s?.starts_at || s?.start;
      const shiftEnd = s?.shift_end || s?.shiftEnd || s?.end_time || s?.endTime || s?.end_at || s?.ends_at || s?.end;

      if (!shiftDate) return false;

      // Combine date + time to create full datetime
      let start = null;
      let end = null;

      if (shiftDate && shiftStart) {
        // shift_date is DATEONLY (YYYY-MM-DD), shift_start is TIME (HH:MM:SS)
        const dateStr = typeof shiftDate === 'string' ? shiftDate : shiftDate.toISOString().split('T')[0];
        const timeStr = typeof shiftStart === 'string' ? shiftStart : String(shiftStart);
        start = safeDate(`${dateStr}T${timeStr}`);
      }

      if (shiftDate && shiftEnd) {
        const dateStr = typeof shiftDate === 'string' ? shiftDate : shiftDate.toISOString().split('T')[0];
        const timeStr = typeof shiftEnd === 'string' ? shiftEnd : String(shiftEnd);
        end = safeDate(`${dateStr}T${timeStr}`);
      }

      // Fallback to other field name variations if shift_date/shift_start not found
      if (!start) {
        start = safeDate(
          s?.start_time || s?.startTime || s?.start_at || s?.starts_at || s?.start
        );
      }
      if (!end) {
        end = safeDate(
          s?.end_time || s?.endTime || s?.end_at || s?.ends_at || s?.end
        );
      }

      const st = start ? start.getTime() : null;
      const en = end ? end.getTime() : null;

      if (st && en) return st <= now && now <= en;
      if (st && !en) return st <= now;
      return false;
    }) || null;

  // ✅ Prefer OPEN status shifts, then most recent
  const openShift = shifts.find(s => s?.status === "OPEN") || null;
  return spanning || openShift || shifts[0] || null;
}

function normalizeStatusLabel(s) {
  const v = String(s || "").trim().toLowerCase();

  // ✅ IMPORTANT: check "not clocked" BEFORE "clocked in"
  if (v === "not clocked in" || v.includes("not clocked") || v.includes("not started")) {
    return "not_started";
  }

  if (v === "on break" || v.includes("on break")) return "on_break";

  // ✅ "clocked in" should only match true clocked-in states
  if (v === "clocked in" || v.includes("clocked in")) return "clocked_in";

  return "not_started";
}

export default function Home() {
  const token = localStorage.getItem("guardToken") || "";
  const jwt = useMemo(() => decodeJwt(token), [token]); // optional debug info only

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  const [currentShift, setCurrentShift] = useState(null);
  const [upcomingShifts, setUpcomingShifts] = useState([]);
  const [statusText, setStatusText] = useState("Not clocked in");
  const [shiftState, setShiftState] = useState(null); // Store full shift state for break timer

  const [calloutReason, setCalloutReason] = useState("sick");

  // Status-based action states
  const [actionLoading, setActionLoading] = useState(false);
  const [actionMsg, setActionMsg] = useState("");
  const [lateReason, setLateReason] = useState("traffic");
  const [unreadAnnouncementsCount, setUnreadAnnouncementsCount] = useState(0);

  const load = async () => {
    setErr("");
    setMsg("");
    setLoading(true);
    try {
      const res = await listShifts();
      const rows = Array.isArray(res?.data)
        ? res.data
        : res?.data?.shifts || res?.data || [];

      // ✅ FIX: Prefer shift that guard has actually clocked into
      // BUT only consider CURRENT shifts (today or future, or within shift time window)
      // This prevents showing "clocked in" for old shifts that were never clocked out of
      let cur = null;
      
      console.log(`🔍 Checking ${rows.length} shifts for active clock-in...`);
      
      const now = Date.now();
      
      // Helper to check if shift is current (today or within time window)
      const isCurrentShift = (shift) => {
        if (!shift) return false;
        const shiftDate = shift?.shift_date || shift?.shiftDate || shift?.date;
        const shiftStart = shift?.shift_start || shift?.shiftStart || shift?.start_time;
        const shiftEnd = shift?.shift_end || shift?.shiftEnd || shift?.end_time;
        
        if (!shiftDate) return false;
        
        // Parse shift date
        const dateStr = typeof shiftDate === 'object' && shiftDate instanceof Date 
          ? shiftDate.toISOString().split('T')[0] 
          : String(shiftDate).split('T')[0].split(' ')[0];
        
        // Combine date + start time to get shift start datetime
        let shiftStartTime = null;
        if (shiftStart) {
          const timeStr = String(shiftStart).trim();
          shiftStartTime = safeDate(`${dateStr}T${timeStr}`)?.getTime();
        }
        
        // Combine date + end time to get shift end datetime
        let shiftEndTime = null;
        if (shiftEnd) {
          const timeStr = String(shiftEnd).trim();
          shiftEndTime = safeDate(`${dateStr}T${timeStr}`)?.getTime();
        }
        
        // Shift is current if:
        // 1. It's today (date matches today)
        // 2. OR it's in the future
        // 3. OR it spans now (start <= now <= end)
        const today = new Date().toISOString().split('T')[0];
        const isToday = dateStr === today;
        const isFuture = shiftStartTime && shiftStartTime > now;
        const spansNow = shiftStartTime && shiftEndTime && shiftStartTime <= now && now <= shiftEndTime;
        const isCurrent = isToday || isFuture || spansNow;
        
        return isCurrent;
      };
      
      // Check shifts in parallel (faster than sequential)
      // BUT only check shifts that are current (today/future/spanning now)
      const currentShifts = rows.filter(isCurrentShift).slice(0, 20);
      console.log(`🔍 Filtered to ${currentShifts.length} current shifts (today/future/spanning now)`);
      
      const shiftChecks = currentShifts.map(async (shift) => {
        if (!shift?.id) return null;
        try {
          const st = await getShiftState(shift.id);
          const state = st?.data || st || null;
          const hasActiveClockIn = Boolean(
            state?.clockedIn || 
            state?.clocked_in || 
            state?.status === "CLOCKED_IN" || 
            state?.status === "clocked_in" ||
            state?.status === "IN"
          );
          return hasActiveClockIn ? shift : null;
        } catch (e) {
          return null;
        }
      });
      
      const results = await Promise.all(shiftChecks);
      cur = results.find(shift => shift !== null) || null;
      
      if (cur) {
        console.log(`✅ Found shift with active clock-in: ${cur.id}`);
      } else {
        console.log("⚠️ No shift with active clock-in found, using pickCurrentShift fallback");
        // Pass guardId so it prefers shifts assigned to this guard
        // Also filter to current shifts only (not old ones)
        const guardIdFromToken = jwt?.guardId || jwt?.guard_id || null;
        const currentRows = rows.filter(isCurrentShift);
        cur = pickCurrentShift(currentRows.length > 0 ? currentRows : rows, guardIdFromToken);
        if (cur) {
          console.log(`✅ pickCurrentShift selected: ${cur.id} (guard_id: ${cur.guard_id || 'NULL'})`);
        }
      }
      
      setCurrentShift(cur);
      
      // Get upcoming shifts (for alerts display)
      const guardIdFromToken = jwt?.guardId || jwt?.guard_id || null;
      const upcoming = rows
        .filter((s) => {
          // Only show shifts assigned to this guard
          if (guardIdFromToken && s?.guard_id) {
            return String(s.guard_id) === String(guardIdFromToken);
          }
          return true;
        })
        .filter((s) => {
          // Only future shifts (not past)
          const shiftDate = s?.shift_date || s?.shiftDate || s?.date;
          if (!shiftDate) return false;
          const dateStr = typeof shiftDate === 'object' && shiftDate instanceof Date 
            ? shiftDate.toISOString().split('T')[0] 
            : String(shiftDate).split('T')[0].split(' ')[0];
          const today = new Date().toISOString().split('T')[0];
          return dateStr >= today;
        })
        .sort((a, b) => {
          // Sort by date, then by start time
          const dateA = a?.shift_date || a?.shiftDate || a?.date || '';
          const dateB = b?.shift_date || b?.shiftDate || b?.date || '';
          if (dateA !== dateB) return dateA.localeCompare(dateB);
          const startA = a?.shift_start || a?.shiftStart || a?.start_time || '';
          const startB = b?.shift_start || b?.shiftStart || b?.start_time || '';
          return startA.localeCompare(startB);
        })
        .slice(0, 3); // Show alerts for next 3 upcoming shifts
      
      setUpcomingShifts(upcoming);
      
      // Debug: log shift data to see what fields are available
      if (cur) {
        console.log("🔍 Current shift data:", cur);
        console.log("🔍 Available fields:", Object.keys(cur));
      }

      // Best-effort shift state
      if (cur?.id) {
        try {
          console.log(`🔍 Loading shift state for shift ${cur.id}...`);
          const st = await getShiftState(cur.id);
          // Handle both response formats: { data: {...} } or direct object
          const state = st?.data || st || null;
          
          console.log("🔍 Shift state response:", state);

          const isClockedOut =
            Boolean(state?.clockedOut) ||
            Boolean(state?.clocked_out) ||
            state?.status === "CLOCKED_OUT" ||
            state?.status === "clocked_out" ||
            state?.status === "OUT";

          const isOnBreak =
            Boolean(state?.onBreak) ||
            Boolean(state?.on_break) ||
            state?.status === "ON_BREAK" ||
            state?.status === "on_break" ||
            state?.status === "break" ||
            state?.status === "BREAK";

          const isClockedIn =
            Boolean(state?.clockedIn) ||
            Boolean(state?.clocked_in) ||
            state?.status === "CLOCKED_IN" ||
            state?.status === "clocked_in" ||
            state?.status === "IN";

          // Store shift state for break timer
          setShiftState(state);

          // Check clocked out first, then break, then clocked in
          if (isClockedOut) setStatusText("Clocked out");
          else if (isOnBreak) setStatusText("On break");
          else if (isClockedIn) setStatusText("Clocked in");
          else setStatusText("Not clocked in");
          
          console.log("✅ Status updated:", {
            isClockedOut,
            isOnBreak,
            isClockedIn,
            statusText: isClockedOut ? "Clocked out" : isOnBreak ? "On break" : isClockedIn ? "Clocked in" : "Not clocked in"
          });
        } catch (e) {
          console.error("❌ Error loading shift state:", e);
          console.error("   Error message:", e?.response?.data?.message || e?.message);
          // Don't set error message here - it might be from a different action
          setStatusText("Not clocked in");
          setShiftState(null);
        }
      } else {
        setStatusText("Not clocked in");
        setShiftState(null);
      }
    } catch (e) {
      const isNetwork =
        e?.code === "ECONNREFUSED" ||
        e?.code === "ERR_NETWORK" ||
        e?.code === "ECONNABORTED" ||
        (e?.message && (e.message.includes("Network Error") || e.message.includes("timeout")));
      if (isNetwork) {
        setErr(
          "Cannot reach Guard server. Start Guard API on this computer: cd abe-guard-ai/backend && node src/server.js. On emulator tap 'Use emulator URL' on the Login page; on phone set Server URL to this computer's IP, then log in again."
        );
      } else {
        setErr(e?.response?.data?.message || e?.message || "Failed to load shifts");
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load unread announcements count
  useEffect(() => {
    const loadUnreadCount = async () => {
      try {
        const response = await getUnreadAnnouncementsCount();
        setUnreadAnnouncementsCount(response.data?.unreadCount || 0);
      } catch (e) {
        // Silently fail - announcements are not critical
        console.error("Failed to load unread count:", e);
      }
    };
    loadUnreadCount();
    // Refresh every 30 seconds
    const interval = setInterval(loadUnreadCount, 30000);
    return () => clearInterval(interval);
  }, []);

  const onCallout = async () => {
    setErr("");
    setMsg("");

    // ✅ Do NOT require guardId/tenantId in token on Home.
    // The backend should derive guard + tenant from the Authorization token.
    if (!token) {
      setErr("Missing guardToken. Please login as a guard again.");
      return;
    }

    // ✅ Require a shiftId here because Home is “current shift” based.
    // (Callouts page can support manual shiftId input; Home should not.)
    if (!currentShift?.id) {
      setErr("No current shift found to call out from. Try Refresh or open the Callouts page.");
      return;
    }

    setLoading(true);
    try {
      await triggerCallout({
        shiftId: currentShift.id,
        reason: calloutReason, // sick | emergency | personal
      });

      setMsg("Callout submitted.");
      await load();
    } catch (e) {
      setErr(e?.response?.data?.message || e?.message || "Callout failed");
    } finally {
      setLoading(false);
    }
  };

  async function doAction(fn, payload) {
    if (!currentShift?.id) {
      setActionMsg("❌ No shift selected");
      setTimeout(() => setActionMsg(""), 2500);
      return;
    }

    setActionLoading(true);
    setActionMsg("");
    setErr("");
    setMsg("");

    try {
      console.log(`🔄 Executing action for shift ${currentShift.id}...`);
      console.log(`🔍 Current shift details:`, {
        id: currentShift.id,
        guard_id: currentShift.guard_id || 'NULL',
        status: currentShift.status,
        shift_date: currentShift.shift_date,
        shift_start: currentShift.shift_start
      });
      const result = await fn(currentShift.id, payload);
      console.log("✅ Action completed:", result?.data || result);
      setActionMsg("✅ Updated");
      setErr(""); // Clear any previous errors
      
      // ✅ Force refresh shift state after clock-in/out actions
      // Add small delay to ensure backend has committed the transaction
      setTimeout(async () => {
        console.log("🔄 Refreshing shift state after action...");
        await load();
        // Also force a direct shift state check to ensure UI updates
        if (currentShift?.id) {
          try {
            console.log(`🔍 Checking shift state for ${currentShift.id}...`);
            const st = await getShiftState(currentShift.id);
            const state = st?.data || st || null;
            console.log("🔍 Shift state after action:", state);
            
            const isClockedOut =
              Boolean(state?.clockedOut) ||
              Boolean(state?.clocked_out) ||
              state?.status === "CLOCKED_OUT" ||
              state?.status === "clocked_out" ||
              state?.status === "OUT";

            const isOnBreak =
              Boolean(state?.onBreak) ||
              Boolean(state?.on_break) ||
              state?.status === "ON_BREAK" ||
              state?.status === "on_break" ||
              state?.status === "break" ||
              state?.status === "BREAK";

            const isClockedIn =
              Boolean(state?.clockedIn) ||
              Boolean(state?.clocked_in) ||
              state?.status === "CLOCKED_IN" ||
              state?.status === "clocked_in" ||
              state?.status === "IN";

            // Update status text immediately
            if (isClockedOut) setStatusText("Clocked out");
            else if (isOnBreak) setStatusText("On break");
            else if (isClockedIn) setStatusText("Clocked in");
            else setStatusText("Not clocked in");
            
            console.log("🔄 Shift state refreshed after action:", {
              status: state?.status,
              isClockedIn,
              isOnBreak,
              isClockedOut,
              statusText: isClockedOut ? "Clocked out" : isOnBreak ? "On break" : isClockedIn ? "Clocked in" : "Not clocked in"
            });
          } catch (stateError) {
            console.error("Error refreshing shift state:", stateError);
          }
        }
      }, 500); // 500ms delay to ensure backend has processed
    } catch (e) {
      const m =
        e?.response?.data?.message ||
        e?.response?.data?.error ||
        e?.message ||
        "Action failed";
      setActionMsg(`❌ ${m}`);
    } finally {
      setActionLoading(false);
      setTimeout(() => setActionMsg(""), 2500);
    }
  }

  // ✅ FIX: enforce correct button visibility per status
  const statusKey = normalizeStatusLabel(statusText);
  const isNotStarted = statusKey === "not_started";
  const isClockedIn = statusKey === "clocked_in";
  const isOnBreak = statusKey === "on_break";
  
  // Debug logging for button visibility
  console.log("🔍 Button visibility check:", {
    statusText,
    statusKey,
    isNotStarted,
    isClockedIn,
    isOnBreak,
    canClockIn: Boolean(currentShift?.id) && isNotStarted && !isClockedIn && !isOnBreak,
    canClockOut: Boolean(currentShift?.id) && isClockedIn,
  });

  // Not started: Clock In (+ optional Running Late)
  // ✅ Ensure only ONE clock in button is rendered
  const canClockIn = Boolean(currentShift?.id) && isNotStarted && !isClockedIn && !isOnBreak;
  const canRunningLate = Boolean(currentShift?.id) && isNotStarted;

  // Clocked in: Start Break + Clock Out
  const canStartBreak = Boolean(currentShift?.id) && isClockedIn;
  const canClockOut = Boolean(currentShift?.id) && isClockedIn;

  // On break: End Break only
  const canEndBreak = Boolean(currentShift?.id) && isOnBreak;

  // ✅ Extract start/end times - support both old and new field names
  // New format: shift_date (Date object or YYYY-MM-DD string) + shift_start/shift_end (HH:MM:SS)
  // Old format: start_time, startTime, start_at, etc.
  let start = null;
  let end = null;
  
  if (currentShift?.shift_date && currentShift?.shift_start) {
    // New format: combine date + time
    // shift_date can be a Date object or string - extract YYYY-MM-DD
    let dateStr;
    if (currentShift.shift_date instanceof Date) {
      dateStr = currentShift.shift_date.toISOString().split('T')[0];
    } else if (typeof currentShift.shift_date === 'string') {
      // If it's already a string, extract just the date part (YYYY-MM-DD)
      dateStr = currentShift.shift_date.split('T')[0].split(' ')[0];
    } else {
      dateStr = null;
    }
    
    if (dateStr) {
      const timeStr = String(currentShift.shift_start).trim();
      start = `${dateStr}T${timeStr}`;
    }
  } else {
    // Old format: try various field names
    start =
      currentShift?.start_time ||
      currentShift?.startTime ||
      currentShift?.start_at ||
      currentShift?.starts_at ||
      currentShift?.start ||
      null;
  }
  
  if (currentShift?.shift_date && currentShift?.shift_end) {
    // New format: combine date + time
    // shift_date can be a Date object or string - extract YYYY-MM-DD
    let dateStr;
    if (currentShift.shift_date instanceof Date) {
      dateStr = currentShift.shift_date.toISOString().split('T')[0];
    } else if (typeof currentShift.shift_date === 'string') {
      // If it's already a string, extract just the date part (YYYY-MM-DD)
      dateStr = currentShift.shift_date.split('T')[0].split(' ')[0];
    } else {
      dateStr = null;
    }
    
    if (dateStr) {
      const timeStr = String(currentShift.shift_end).trim();
      end = `${dateStr}T${timeStr}`;
    }
  } else {
    // Old format: try various field names
    end =
      currentShift?.end_time ||
      currentShift?.endTime ||
      currentShift?.end_at ||
      currentShift?.ends_at ||
      currentShift?.end ||
      null;
  }
  
  // Extract location/site from shift data (check multiple possible field names)
  // Also check ai_decision JSONB field for location
  const aiDecision = currentShift?.ai_decision || {};
  const location =
    currentShift?.location ||
    currentShift?.site_name ||
    currentShift?.site ||
    currentShift?.siteName ||
    currentShift?.address ||
    currentShift?.site_address ||
    aiDecision?.location ||
    aiDecision?.site_name ||
    aiDecision?.site ||
    (currentShift?.tenant_id ? `Tenant ${String(currentShift.tenant_id).slice(0, 8)}` : null) ||
    null;

  // ✅ Welcome text for guard
  const welcomeText = "WELCOME STAFF";

  return (
    <>
      <NavBar />
      <div className="page">
        {/* ✅ Emergency SOS Button - Prominent at top */}
        <div style={{ marginBottom: 20, textAlign: "center" }}>
          <Link
            to="/emergency"
            style={{
              display: "inline-block",
              padding: "20px 40px",
              fontSize: 24,
              fontWeight: 700,
              borderRadius: 16,
              background: "linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)",
              border: "none",
              color: "#fff",
              textDecoration: "none",
              boxShadow: "0 4px 20px rgba(220, 38, 38, 0.4)",
              transition: "all 0.3s",
            }}
            onMouseEnter={(e) => {
              e.target.style.transform = "scale(1.05)";
              e.target.style.boxShadow = "0 6px 25px rgba(220, 38, 38, 0.5)";
            }}
            onMouseLeave={(e) => {
              e.target.style.transform = "scale(1)";
              e.target.style.boxShadow = "0 4px 20px rgba(220, 38, 38, 0.4)";
            }}
          >
            🚨 EMERGENCY SOS
          </Link>
        </div>

        {/* Overtime Offer Alert (modal) */}
        <OvertimeOfferAlert />

        {/* ✅ Welcome banner with animation */}
        <div className="welcomeWrap" style={{ marginBottom: 12 }}>
          <div className="welcomeGlow" />
          <div className="welcomeText">{welcomeText}</div>
        </div>

        <div className="grid">
          {/* Current Shift + Status + Status-based Actions + Callout Reason */}
          <div className="card">
            <h3>Current Shift</h3>

            {err ? (
              <div className="error">
                {err}
                {err.includes("Cannot reach Guard server") ? (
                  <div style={{ marginTop: 10 }}>
                    <Link to="/login" style={{ color: "#a78bfa", fontWeight: 600 }}>
                      → Go to Login to set Server URL
                    </Link>
                  </div>
                ) : null}
              </div>
            ) : null}
            {msg ? <div className="success">{msg}</div> : null}

            <div className="muted">
              Status: <b>{statusText}</b>
            </div>

            {/* Optional debug (safe): shows whether token decodes and what it contains */}
            {jwt ? (
              <div className="muted" style={{ marginTop: 8, fontSize: 12, opacity: 0.75 }}>
                Token: {jwt.guardId || jwt.guard_id ? "✅ guardId" : "⚠️ no guardId"} •{" "}
                {jwt.tenant_id || jwt.tenantId ? "✅ tenant" : "⚠️ no tenant"}
              </div>
            ) : null}

            {currentShift ? (
              <div className="muted" style={{ marginTop: 8, lineHeight: 1.4 }}>
                <div>
                  <b>Shift:</b> {currentShift.id}
                </div>
                {location ? (
                  <div>
                    <b>Location:</b> {location}
                  </div>
                ) : null}
                <div>
                  <b>Start:</b> {fmtDT(start)}
                </div>
                <div>
                  <b>End:</b> {fmtDT(end)}
                </div>
              </div>
            ) : (
              <div className="muted" style={{ marginTop: 8 }}>
                No shift found yet.
              </div>
            )}

            {/* Weather, Traffic & Transit Alerts */}
            {currentShift && (
              <div style={{ marginTop: 16 }}>
                <ShiftAlerts shiftId={currentShift.id} shift={currentShift} />
              </div>
            )}
            
            {/* Upcoming Shifts Alerts (if no current shift) */}
            {!currentShift && upcomingShifts.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <div style={{ marginBottom: 12, fontSize: 14, fontWeight: 600, opacity: 0.9 }}>
                  📍 Upcoming Shift Alerts
                </div>
                {upcomingShifts.map((shift) => (
                  <div key={shift.id} style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 8 }}>
                      {shift.shift_date ? new Date(shift.shift_date).toLocaleDateString() : 'TBD'} • {shift.shift_start} - {shift.shift_end}
                      {shift.location && ` • ${shift.location}`}
                    </div>
                    <ShiftAlerts shiftId={shift.id} shift={shift} />
                  </div>
                ))}
              </div>
            )}

            {/* ✅ UPDATED: Status-based actions (mutually exclusive by status) */}
            <div style={{ marginTop: 12 }}>
              <div className="muted" style={{ marginBottom: 6 }}>
                Actions
              </div>

              {actionMsg ? <div className="muted">{actionMsg}</div> : null}

              {/* Not clocked in → ONLY Clock In (+ Running Late) */}
              {isNotStarted ? (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                  {canClockIn ? (
                    <button
                      className="btnPrimary"
                      disabled={actionLoading || loading}
                      onClick={() => doAction(clockIn)}
                    >
                      {actionLoading ? "Working..." : "Clock In"}
                    </button>
                  ) : null}

                  {canRunningLate ? (
                    <>
                      <select
                        value={lateReason}
                        onChange={(e) => setLateReason(e.target.value)}
                        disabled={actionLoading || loading}
                        style={{
                          minWidth: 180,
                          padding: 10,
                          borderRadius: 8,
                          border: "1px solid #ccc",
                        }}
                      >
                        <option value="traffic">Traffic</option>
                        <option value="train_delay">Train delay</option>
                        <option value="family_emergency">Family emergency</option>
                        <option value="car_issue">Car issue</option>
                        <option value="other">Other</option>
                      </select>

                      <button
                        className="btn"
                        disabled={actionLoading || loading}
                        onClick={() => doAction(runningLate, { reason: lateReason })}
                      >
                        {actionLoading ? "Working..." : "Running Late"}
                      </button>
                    </>
                  ) : null}
                </div>
              ) : null}

              {/* Clocked in → Start Break + Clock Out */}
              {isClockedIn ? (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                  {canStartBreak ? (
                    <button
                      className="btn"
                      disabled={actionLoading || loading}
                      onClick={() => doAction(breakStart)}
                    >
                      {actionLoading ? "Working..." : "Start Break"}
                    </button>
                  ) : null}

                  {canClockOut ? (
                    <button
                      className="btnPrimary"
                      disabled={actionLoading || loading}
                      onClick={() => doAction(clockOut)}
                    >
                      {actionLoading ? "Working..." : "Clock Out"}
                    </button>
                  ) : null}
                </div>
              ) : null}

              {/* On break → Break Timer + End Break */}
              {isOnBreak ? (
                <>
                  {/* Break Timer */}
                  {shiftState?.lunchStartAt || shiftState?.lunch_start_at ? (
                    <BreakTimer
                      lunchStartAt={shiftState?.lunchStartAt || shiftState?.lunch_start_at}
                      breakLimitMinutes={30}
                      shiftId={currentShift?.id}
                    />
                  ) : null}
                  
                  {/* End Break Button */}
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                    {canEndBreak ? (
                      <button
                        className="btnPrimary"
                        disabled={actionLoading || loading}
                        onClick={() => doAction(breakEnd)}
                      >
                        {actionLoading ? "Working..." : "End Break"}
                      </button>
                    ) : null}
                  </div>
                </>
              ) : null}

              {/* Overtime Status (when clocked in) */}
              {isClockedIn && currentShift?.id ? (
                <>
                  <OvertimeStatus
                    shiftId={currentShift.id}
                    isClockedIn={isClockedIn}
                  />
                  {/* Overtime Request Button */}
                  {(() => {
                    // Build current end time from shift_date + shift_end
                    let endTimeStr = null;
                    if (currentShift.shift_date && currentShift.shift_end) {
                      const dateStr = typeof currentShift.shift_date === 'string' 
                        ? currentShift.shift_date.split('T')[0].split(' ')[0]
                        : currentShift.shift_date instanceof Date
                        ? currentShift.shift_date.toISOString().split('T')[0]
                        : null;
                      const timeStr = String(currentShift.shift_end).trim();
                      if (dateStr && timeStr) {
                        endTimeStr = `${dateStr}T${timeStr}`;
                      }
                    }
                    return endTimeStr ? (
                      <OvertimeRequestButton
                        shiftId={currentShift.id}
                        currentEndTime={endTimeStr}
                      />
                    ) : null;
                  })()}
                </>
              ) : null}

              {!currentShift?.id ? (
                <div className="muted" style={{ marginTop: 8 }}>
                  No shift actions available.
                </div>
              ) : null}
            </div>

            {/* ✅ Callout Reason + Callout - Only show when current shift exists */}
            {currentShift?.id ? (
              <div style={{ marginTop: 12 }}>
                <div className="muted" style={{ marginBottom: 6 }}>
                  Callout reason
                </div>
                <select
                  style={{
                    width: "100%",
                    padding: 10,
                    borderRadius: 8,
                    border: "1px solid #ccc",
                  }}
                  value={calloutReason}
                  onChange={(e) => setCalloutReason(e.target.value)}
                  disabled={loading || actionLoading}
                >
                  <option value="sick">Sick</option>
                  <option value="emergency">Emergency</option>
                  <option value="personal">Personal</option>
                </select>

                <div className="row" style={{ marginTop: 10 }}>
                  <button
                    className="btnPrimary"
                    onClick={onCallout}
                    disabled={loading || actionLoading}
                    style={{
                      // Enhanced visual prominence when shift is available
                      background: "linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)",
                      border: "none",
                      boxShadow: "0 2px 8px rgba(220, 38, 38, 0.3)",
                    }}
                  >
                    Call Out
                  </button>
                  <button className="btn" onClick={load} disabled={loading || actionLoading}>
                    Refresh
                  </button>
                </div>
                <div className="muted" style={{ marginTop: 8, fontSize: 12, opacity: 0.7 }}>
                  💡 Quick callout for current shift. Use "Callouts" card for other shifts.
                </div>
              </div>
            ) : (
              <div style={{ marginTop: 12 }}>
                <div className="muted" style={{ fontSize: 12, opacity: 0.7 }}>
                  No shift selected. Use the "Callouts" card below to call out from any shift.
                </div>
              </div>
            )}
          </div>

          {/* Shift Change Alerts */}
          <ShiftNotifications />

          {/* KEEP YOUR EXISTING CARDS */}
          <div className="card">
            <h3>Ask Policy</h3>
            <div className="muted">Get policy answers with citations.</div>
            <Link className="btnPrimaryLink" to="/ask-policy">
              Open
            </Link>
          </div>

          <div className="card">
            <h3>Shifts</h3>
            <div className="muted">View and accept available shifts.</div>
            <Link className="btnPrimaryLink" to="/shifts">
              Open
            </Link>
          </div>

          <div className="card">
            <h3>
              Callouts
              {currentShift?.id && (
                <span
                  style={{
                    marginLeft: 8,
                    fontSize: 12,
                    padding: "2px 8px",
                    borderRadius: 12,
                    background: "rgba(34, 197, 94, 0.15)",
                    color: "#22c55e",
                    fontWeight: 600,
                  }}
                >
                  Shift Available
                </span>
              )}
            </h3>
            <div className="muted">
              {currentShift?.id
                ? "Call out from current shift or select a different shift."
                : "Call out or notify you're running late."}
            </div>
            <Link className="btnPrimaryLink" to="/callouts">
              Open
            </Link>
          </div>

          <div className="card">
            <h3>Request For Time Off</h3>
            <div className="muted">Submit a request for personal time, vacation, or leave.</div>
            <Link className="btnPrimaryLink" to="/request-time-off">
              Open
            </Link>
          </div>

          <div className="card">
            <h3>Payroll Assistant</h3>
            <div className="muted">Ask questions about your pay stubs, hours, and payroll.</div>
            <Link className="btnPrimaryLink" to="/payroll">
              Open
            </Link>
          </div>

          <div className="card">
            <h3>
              Announcements
              {unreadAnnouncementsCount > 0 && (
                <span
                  style={{
                    marginLeft: 8,
                    fontSize: 12,
                    padding: "2px 8px",
                    borderRadius: 12,
                    background: "rgba(220, 38, 38, 0.2)",
                    color: "#ff6b6b",
                    fontWeight: 700,
                  }}
                >
                  {unreadAnnouncementsCount} New
                </span>
              )}
            </h3>
            <div className="muted">View company announcements, policy updates, and notices.</div>
            <Link className="btnPrimaryLink" to="/announcements">
              Open
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
