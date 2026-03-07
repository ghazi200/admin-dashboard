// src/pages/Dashboard.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { connectSocket, connectAdminSocket } from "../realtime/socket";
import Card from "../components/Card";
import OvertimeRequests from "../components/OvertimeRequests";
import OvertimeOfferModal from "../components/OvertimeOfferModal";
import {
  getOpenShifts,
  getLiveCallouts,
  getRunningLate,
  getGuardAvailability,
  getRecentAvailabilityLogs,
  getClockStatus,
  listIncidents,
  getActiveEmergencies,
  resolveEmergency,
  getGeographicSites,
} from "../services/api";
import { hasAccess } from "../utils/access";

// helper: pull admin info saved at login
function getAdminInfo() {
  try {
    const raw = localStorage.getItem("adminInfo");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function safeLen(v) {
  return Array.isArray(v) ? v.length : 0;
}

function formatRelativeTime(dateValue) {
  if (!dateValue) return "—";
  const d = new Date(dateValue);
  if (Number.isNaN(d.getTime())) return "—";

  const diffMs = Date.now() - d.getTime();
  const sec = Math.floor(diffMs / 1000);
  if (sec < 10) return "just now";
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  return `${day}d ago`;
}

function Donut({ a = 0, b = 0, labelA = "A", labelB = "B" }) {
  const total = a + b;
  const pct = total === 0 ? 0 : a / total;

  const r = 44;
  const c = 2 * Math.PI * r;
  const dash = `${pct * c} ${c}`;

  return (
    <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
      <svg width="112" height="112" viewBox="0 0 112 112">
        <circle
          cx="56"
          cy="56"
          r={r}
          fill="none"
          stroke="rgba(255,255,255,0.10)"
          strokeWidth="12"
        />
        <circle
          cx="56"
          cy="56"
          r={r}
          fill="none"
          stroke="rgba(34,197,94,0.85)"
          strokeWidth="12"
          strokeDasharray={dash}
          strokeLinecap="round"
          transform="rotate(-90 56 56)"
        />
        <text
          x="56"
          y="60"
          textAnchor="middle"
          fontSize="18"
          fontWeight="800"
          fill="rgba(255,255,255,0.88)"
        >
          {Math.round(pct * 100)}%
        </text>
      </svg>

      <div>
        <div className="legendRow" style={{ display: "flex", gap: 14 }}>
          <span>
            <span className="legendDot" /> {labelA}: <b>{a}</b>
          </span>
          <span>
            <span className="legendDot" /> {labelB}: <b>{b}</b>
          </span>
        </div>
        <div style={{ fontSize: 12, opacity: 0.7, marginTop: 6 }}>
          Filled = {labelA} share
        </div>
      </div>
    </div>
  );
}

function SparkBars({ values = [] }) {
  const max = Math.max(1, ...values.map((v) => Number(v) || 0));

  return (
    <div
      className="sparkBars"
      style={{ display: "flex", gap: 10, alignItems: "flex-end" }}
    >
      {values.map((v, i) => {
        const h = Math.round(((Number(v) || 0) / max) * 100);
        return (
          <div
            key={i}
            className="sparkBar sparkBar--green"
            style={{
              width: 36,
              height: `${Math.max(8, h)}%`,
              borderRadius: 10,
              background: "rgba(34,197,94,0.85)",
              boxShadow:
                "0 0 0 1px rgba(34,197,94,0.25), 0 10px 24px rgba(0,0,0,0.25)",
            }}
            title={`${v}`}
          />
        );
      })}
    </div>
  );
}

// Live Clock Component
function LiveClock() {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setTime(new Date());
    }, 1000); // Update every second

    return () => clearInterval(timer);
  }, []);

  const hours = time.getHours().toString().padStart(2, "0");
  const minutes = time.getMinutes().toString().padStart(2, "0");
  const seconds = time.getSeconds().toString().padStart(2, "0");
  const dateStr = time.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div
      style={{
        background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)",
        padding: "20px 30px",
        borderRadius: 12,
        border: "2px solid rgba(59, 130, 246, 0.3)",
        boxShadow: "0 4px 20px rgba(0,0,0,0.3)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minWidth: "280px",
      }}
    >
      <div
        style={{
          fontSize: 48,
          fontWeight: 900,
          color: "#3b82f6",
          fontFamily: "monospace",
          letterSpacing: 2,
          marginBottom: 8,
          textShadow: "0 0 20px rgba(59, 130, 246, 0.5)",
        }}
      >
        {hours}:{minutes}:{seconds}
      </div>
      <div
        style={{
          fontSize: 14,
          color: "rgba(255, 255, 255, 0.8)",
          textAlign: "center",
          fontWeight: 500,
        }}
      >
        {dateStr}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const canReadDashboard = hasAccess("dashboard:read");
  const qc = useQueryClient();

  // ✅ Welcome text (admin/supervisor)
  const adminInfo = useMemo(() => getAdminInfo(), []);
  const role = (adminInfo?.role || "").toLowerCase();
  const welcomeText =
    role === "supervisor"
      ? "WELCOME SUPERVISOR"
      : role === "admin" || role === "super_admin"
      ? role === "super_admin"
        ? "WELCOME SUPER-ADMIN"
        : "WELCOME ADMIN"
      : "WELCOME";

  // ✅ Recent Activity state
  const [activity, setActivity] = useState([]);
  const [activityLoading, setActivityLoading] = useState(true);
  const [activityErr, setActivityErr] = useState("");

  // Local state for callouts to force immediate updates
  const [localCallouts, setLocalCallouts] = useState(null);
  
  // Local state for clock status to force immediate updates
  const [localClockStatus, setLocalClockStatus] = useState(null);

  // Overtime offer modal state
  const [overtimeOfferGuard, setOvertimeOfferGuard] = useState(null);

  // keep a stable ref to the activity loader so socket can call it
  const loadActivityRef = useRef(null);

  // =============================
  // React Query data
  // =============================
  const qOpen = useQuery({
    queryKey: ["openShifts"],
    queryFn: async () => {
      console.log("🔄 Fetching open shifts...");
      const response = await getOpenShifts();
      // Axios returns { data: {...} }, extract the data property
      const data = response.data;
      console.log("✅ Fetched open shifts count:", data?.data?.length || 0);
      return data;
    },
    enabled: canReadDashboard,
    // safety net if socket drops:
    refetchInterval: canReadDashboard ? 15000 : false,
    refetchOnWindowFocus: true,
  });

  const qCallouts = useQuery({
    queryKey: ["liveCallouts"],
    queryFn: async () => {
      console.log("🔄 Fetching live callouts...");
      const response = await getLiveCallouts();
      // Axios returns { data: {...} }, extract the data property
      const data = response.data;
      console.log("✅ Fetched callouts count:", data?.data?.length || 0);
      console.log("✅ Latest callout ID:", data?.data?.[0]?.id || "none");
      // Update local state when query data loads
      if (data?.data) {
        setLocalCallouts(data.data);
        console.log("✅ Local callouts state updated from query");
      }
      return data;
    },
    enabled: canReadDashboard,
    refetchInterval: canReadDashboard ? 5000 : false, // Poll every 5 seconds as fallback (faster than before)
    refetchOnWindowFocus: true,
    staleTime: 0, // Always consider data stale to allow immediate refetch
    gcTime: 0, // React Query v4 - don't cache, always fetch fresh
  });

  const qRunningLate = useQuery({
    queryKey: ["runningLate"],
    queryFn: async () => {
      const response = await getRunningLate();
      return response.data;
    },
    enabled: canReadDashboard,
    refetchInterval: canReadDashboard ? 15000 : false,
    refetchOnWindowFocus: true,
    staleTime: 0,
    cacheTime: 30000,
  });

  const qAvail = useQuery({
    queryKey: ["availability"],
    queryFn: async () => {
      console.log("🔄 Fetching guard availability...");
      const response = await getGuardAvailability();
      console.log("✅ Guard availability response:", response.data);
      return response.data; // Axios wraps in .data, backend returns { total, active, available, unavailable }
    },
    enabled: canReadDashboard,
    refetchInterval: canReadDashboard ? 2000 : false, // Poll every 2 seconds for faster updates
    refetchOnWindowFocus: true,
    refetchOnMount: true,
    refetchOnReconnect: true,
    refetchIntervalInBackground: true, // Continue polling even when tab is in background
    staleTime: 0, // Always consider data stale to ensure fresh fetches
    cacheTime: 0, // Don't cache at all - always fetch fresh
  });

  const qClockStatus = useQuery({
    queryKey: ["clockStatus"],
    queryFn: async () => {
      console.log("🔄 Fetching clock status...");
      try {
        const response = await getClockStatus();
        const data = response.data;
        console.log("✅ Clock status fetched:", {
          clockedIn: data?.clockedIn?.length || 0,
          onBreak: data?.onBreak?.length || 0,
          clockedOut: data?.clockedOut?.length || 0,
          total: data?.data?.length || 0,
        });
        // Debug: Log Bob's status specifically
        if (data?.clockedOut) {
          const bob = data.clockedOut.find(g => g.guardEmail === "bob@abe.com");
          if (bob) {
            console.log("🔍 Bob found in clockedOut:", bob);
          }
        }
        if (data?.clockedIn) {
          const bob = data.clockedIn.find(g => g.guardEmail === "bob@abe.com");
          if (bob) {
            console.log("⚠️ Bob found in clockedIn (should be clockedOut):", bob);
          }
        }
        // Debug: log first clocked in guard's location
        if (data?.clockedIn?.length > 0) {
          console.log("🔍 First clocked in guard:", {
            name: data.clockedIn[0].guardName,
            location: data.clockedIn[0].location,
            allFields: Object.keys(data.clockedIn[0]),
          });
        }
        return data;
      } catch (err) {
        console.error("❌ Error fetching clock status:", err);
        // Return empty data structure to prevent crashes
        return {
          data: [],
          summary: { clockedIn: 0, onBreak: 0, clockedOut: 0, total: 0 },
          clockedIn: [],
          onBreak: [],
          clockedOut: [],
        };
      }
    },
    enabled: canReadDashboard,
    refetchInterval: canReadDashboard ? 10000 : false, // Poll every 10 seconds as fallback
    refetchOnWindowFocus: true,
    staleTime: 0,
    gcTime: 0, // React Query v4 - don't cache, always fetch fresh
  });

  const qIncidents = useQuery({
    queryKey: ["incidents"],
    queryFn: async () => {
      console.log("🔄 Fetching incidents...");
      try {
        const response = await listIncidents({ status: "OPEN", limit: 20 });
        const data = response.data || [];
        console.log("✅ Incidents fetched:", data.length);
        return data;
      } catch (err) {
        console.error("❌ Error fetching incidents:", err);
        return [];
      }
    },
    enabled: canReadDashboard,
    refetchInterval: canReadDashboard ? 15000 : false,
    refetchOnWindowFocus: true,
    staleTime: 0,
    cacheTime: 30000,
  });

  // ✅ Active emergencies query
  const qActiveEmergencies = useQuery({
    queryKey: ["activeEmergencies"],
    queryFn: async () => {
      console.log("🔄 Fetching active emergencies...");
      try {
        const response = await getActiveEmergencies();
        const data = response.data?.data || [];
        console.log("✅ Active emergencies fetched:", data.length);
        return data;
      } catch (err) {
        console.error("❌ Error fetching active emergencies:", err);
        return [];
      }
    },
    enabled: canReadDashboard,
    refetchInterval: canReadDashboard ? 10000 : false, // Check every 10 seconds
    refetchOnWindowFocus: true,
    staleTime: 0,
    cacheTime: 30000,
  });

  // ✅ Emergency SOS state - sync with query data (defined after query)
  const activeEmergencies = qActiveEmergencies.data || [];

  // ✅ Total sites for current tenant (live-updating, shared cache with Layout)
  const qSites = useQuery({
    queryKey: ["geographicSites"],
    queryFn: async () => {
      const res = await getGeographicSites();
      const list = res.data?.data ?? res.data ?? [];
      return Array.isArray(list) ? list : [];
    },
    enabled: canReadDashboard,
    refetchInterval: canReadDashboard ? 20000 : false,
    refetchIntervalInBackground: true,
  });
  const sitesCount = Array.isArray(qSites.data) ? qSites.data.length : 0;

  // =============================
  // Recent Activity loader
  // =============================
  useEffect(() => {
    if (!canReadDashboard) return;

    const loadActivity = async () => {
      setActivityLoading(true);
      setActivityErr("");

      try {
        const res = await getRecentAvailabilityLogs(12);
        setActivity(Array.isArray(res?.data) ? res.data : []);
      } catch (e) {
        setActivityErr(
          e?.response?.data?.message || e?.message || "Failed to load activity"
        );
        setActivity([]);
      } finally {
        setActivityLoading(false);
      }
    };

    loadActivityRef.current = loadActivity;
    loadActivity();

    return () => {
      loadActivityRef.current = null;
    };
  }, [canReadDashboard]);

  // =============================
  // ✅ LIVE UPDATES via Socket.IO (shared singleton)
  // - listens for callout + filled events and refreshes queries
  // - does NOT change your UI
  // =============================
  useEffect(() => {
    if (!canReadDashboard) return;

    // ✅ Use the shared socket singleton (prevents duplicate connections)
    const s = connectSocket();
    if (!s) return;

    // ✅ Also connect to admin-dashboard socket for admin-specific events
    const adminS = connectAdminSocket();
    if (!adminS) {
      console.warn("⚠️ Could not connect to admin-dashboard socket");
    } else {
      // Also listen for clock events on admin socket (in case they're emitted there)
      adminS.on("guard_clocked_out", (...args) => {
        console.log("🔍 ADMIN SOCKET: guard_clocked_out received", args);
        setTimeout(() => {
          onGuardClockedOut(...args);
        }, 50);
      });
      adminS.on("guard_clocked_in", (...args) => {
        console.log("🔍 ADMIN SOCKET: guard_clocked_in received", args);
      });
      console.log("✅ Admin socket listeners attached for clock events");
    }

    const refreshAll = async () => {
      console.log("🔄 Refreshing all dashboard queries...");
      
      try {
        // Fetch directly from API to get latest data
        console.log("🔍 Fetching directly from API...");
        const directResponse = await getLiveCallouts();
        const directData = directResponse.data;
        const directCount = directData?.data?.length || 0;
        console.log("🔍 Direct API call - Count:", directCount);
        console.log("🔍 Direct API call - Latest ID:", directData?.data?.[0]?.id);
        console.log("🔍 Direct API call - Full response:", directData);
        
        // Get current query data for comparison
        const currentData = qc.getQueryData(["liveCallouts"]);
        const currentCount = currentData?.data?.length || 0;
        console.log("🔍 Current query data - Count:", currentCount);
        console.log("🔍 Current query data - Latest ID:", currentData?.data?.[0]?.id);
        
        // Check if data actually changed
        const dataChanged = directCount !== currentCount || 
          (directData?.data?.[0]?.id !== currentData?.data?.[0]?.id);
        console.log("🔍 Data changed?", dataChanged);
        
        // Update both React Query cache AND local state
        // This ensures immediate UI update
        console.log("🔄 Updating query data and local state...");
        qc.setQueryData(["liveCallouts"], directData);
        console.log("✅ Query cache updated with:", {
          count: directData?.data?.length || 0,
          latestId: directData?.data?.[0]?.id || "none"
        });
        
        // Update local state directly - this will trigger immediate re-render
        const newCalloutsArray = directData.data || [];
        const currentCalloutsArray = localCallouts || [];
        
        console.log("🔄 [REFRESH] Comparing callouts:", {
          currentCount: currentCalloutsArray.length,
          newCount: newCalloutsArray.length,
          currentFirstId: currentCalloutsArray[0]?.id || "none",
          newFirstId: newCalloutsArray[0]?.id || "none",
          willUpdate: newCalloutsArray.length !== currentCalloutsArray.length || 
                     (newCalloutsArray.length > 0 && newCalloutsArray[0]?.id !== currentCalloutsArray[0]?.id),
        });
        
        // Always update to ensure UI reflects latest data
        setLocalCallouts(newCalloutsArray);
        console.log("✅ [REFRESH] Local state updated with count:", newCalloutsArray.length);
        console.log("✅ [REFRESH] Local state updated with latest ID:", newCalloutsArray[0]?.id || "none");
        
        // Force a refetch to ensure UI updates
        await qc.refetchQueries({ queryKey: ["liveCallouts"], type: "active" });
        console.log("✅ Query refetched to trigger UI update");
        
        // Also invalidate other queries
        qc.invalidateQueries({ queryKey: ["openShifts"] });
        qc.invalidateQueries({ queryKey: ["runningLate"] });
        qc.invalidateQueries({ queryKey: ["clockStatus"] });
        qc.invalidateQueries({ queryKey: ["availability"] });
        
        // Verify the update worked
        const verifyData = qc.getQueryData(["liveCallouts"]);
        console.log("🔍 Verification - Query data after update:", {
          count: verifyData?.data?.length || 0,
          latestId: verifyData?.data?.[0]?.id || "none",
          matches: verifyData?.data?.[0]?.id === directData?.data?.[0]?.id
        });
        
      } catch (err) {
        console.error("❌ Refetch error:", err);
        console.error("❌ Error stack:", err.stack);
        // Fallback: invalidate and refetch
        qc.invalidateQueries({ queryKey: ["liveCallouts"] });
        qc.refetchQueries({ queryKey: ["liveCallouts"] });
      }

      // refresh recent activity
      const fn = loadActivityRef.current;
      if (typeof fn === "function") fn();
    };

    const onCalloutStarted = async (payload) => {
      console.log("📡 callout_started EVENT RECEIVED", payload);
      console.log("🔄 Calling refreshAll() to update callouts...");
      await refreshAll();
      console.log("✅ refreshAll() completed after callout_started");
    };

    const onShiftFilled = async (payload) => {
      console.log("📡 shift_filled EVENT RECEIVED", payload);
      console.log("🔄 Calling refreshAll() to update callouts...");
      await refreshAll();
      console.log("✅ refreshAll() completed after shift_filled");
    };

    const onCalloutResponse = async (payload) => {
      console.log("📡 callout_response EVENT RECEIVED", payload);
      console.log("🔄 Calling refreshAll() to update callouts...");
      await refreshAll();
      console.log("✅ refreshAll() completed after callout_response");
    };

    // Also listen for generic callout updates
    const onCalloutUpdate = async (payload) => {
      console.log("📡 callout_update EVENT RECEIVED", payload);
      console.log("🔄 Calling refreshAll() to update callouts...");
      await refreshAll();
      console.log("✅ refreshAll() completed after callout_update");
    };

    // ✅ Listen for guard running late events
    const onGuardRunningLate = async (payload) => {
      console.log("📡 guard_running_late", payload);
      try {
        // Fetch running late data directly
        const response = await getRunningLate();
        const runningLateData = response.data;
        console.log("🔍 Running Late Count:", runningLateData?.data?.length || 0);
        
        // Update React Query cache
        qc.setQueryData(["runningLate"], runningLateData);
        console.log("✅ Running Late query cache updated!");
        
        // Also refresh other queries
        qc.invalidateQueries({ queryKey: ["openShifts"] });
        qc.invalidateQueries({ queryKey: ["liveCallouts"] });
      } catch (err) {
        console.error("❌ Error refreshing running late:", err);
        // Fallback to full refresh
        refreshAll();
      }
    };

    // ✅ Listen for clock in/out and break events
    const onGuardClockedIn = async (payload) => {
      console.log("📡 guard_clocked_in EVENT RECEIVED", payload);
      try {
        console.log("🔄 Fetching clock status after clock in...");
        // Invalidate first to clear cache, then fetch fresh
        qc.invalidateQueries({ queryKey: ["clockStatus"] });
        const response = await getClockStatus();
        const clockStatusData = response.data;
        console.log("🔍 Clock Status Response:", {
          clockedIn: clockStatusData?.clockedIn?.length || 0,
          onBreak: clockStatusData?.onBreak?.length || 0,
          clockedOut: clockStatusData?.clockedOut?.length || 0,
          total: clockStatusData?.data?.length || 0,
        });
        qc.setQueryData(["clockStatus"], clockStatusData);
        // Also update local state to force immediate UI re-render
        setLocalClockStatus(clockStatusData);
        await qc.refetchQueries({ queryKey: ["clockStatus"] });
        console.log("✅ Clock Status query cache updated and refetched!");
      } catch (err) {
        console.error("❌ Error refreshing clock status:", err);
        qc.invalidateQueries({ queryKey: ["clockStatus"] });
      }
    };

    const onGuardClockedOut = async (payload) => {
      console.log("📡 guard_clocked_out EVENT RECEIVED", payload);
      try {
        console.log("🔄 Fetching clock status after clock out...");
        
        // Force immediate invalidation to clear stale cache
        qc.invalidateQueries({ queryKey: ["clockStatus"] });
        
        // Fetch fresh data directly
        const response = await getClockStatus();
        const clockStatusData = response.data;
        console.log("🔍 Clock Status Response (full):", clockStatusData);
        console.log("🔍 Clock Status Response (summary):", {
          clockedIn: clockStatusData?.clockedIn?.length || 0,
          onBreak: clockStatusData?.onBreak?.length || 0,
          clockedOut: clockStatusData?.clockedOut?.length || 0,
          total: clockStatusData?.data?.length || 0,
        });
        
        // Check if Bob is in the response
        if (clockStatusData?.clockedOut) {
          const bob = clockStatusData.clockedOut.find(g => g.guardEmail === "bob@abe.com");
          if (bob) {
            console.log("✅ Bob found in API response clockedOut array:", bob);
          } else {
            console.log("⚠️ Bob NOT found in API response clockedOut array");
          }
        }
        if (clockStatusData?.clockedIn) {
          const bob = clockStatusData.clockedIn.find(g => g.guardEmail === "bob@abe.com");
          if (bob) {
            console.log("⚠️ Bob found in API response clockedIn array (should be clockedOut):", bob);
          }
        }
        
        // Update cache with fresh data
        qc.setQueryData(["clockStatus"], clockStatusData);
        console.log("✅ Clock Status cache updated");
        
        // ALSO update local state to force immediate UI re-render (like callouts)
        setLocalClockStatus(clockStatusData);
        console.log("✅ Clock Status local state updated - UI should re-render now!");
        
        // Force immediate refetch to trigger re-render
        const refetchResult = await qc.refetchQueries({ queryKey: ["clockStatus"], type: "active" });
        console.log("✅ Clock Status query refetched, result:", refetchResult);
        
        // Double-check: verify the data is actually in cache
        const cachedData = qc.getQueryData(["clockStatus"]);
        console.log("🔍 Verification - Cached data after update:", {
          clockedIn: cachedData?.clockedIn?.length || 0,
          clockedOut: cachedData?.clockedOut?.length || 0,
          hasData: !!cachedData,
          bobInClockedOut: cachedData?.clockedOut?.find(g => g.guardEmail === "bob@abe.com") ? "YES" : "NO",
          bobInClockedIn: cachedData?.clockedIn?.find(g => g.guardEmail === "bob@abe.com") ? "YES" : "NO",
        });
        
        // Force a window focus event to trigger refetch (last resort)
        window.dispatchEvent(new Event('focus'));
        console.log("✅ Dispatched window focus event to trigger refetch");
      } catch (err) {
        console.error("❌ Error refreshing clock status:", err);
        console.error("❌ Error stack:", err.stack);
        // Force invalidation and refetch on error
        qc.invalidateQueries({ queryKey: ["clockStatus"] });
        qc.refetchQueries({ queryKey: ["clockStatus"] });
      }
    };

    const onGuardLunchStarted = async (payload) => {
      console.log("📡 guard_lunch_started", payload);
      try {
        const response = await getClockStatus();
        const clockStatusData = response.data;
        qc.setQueryData(["clockStatus"], clockStatusData);
        // Also update local state to force immediate UI re-render
        setLocalClockStatus(clockStatusData);
        await qc.refetchQueries({ queryKey: ["clockStatus"] });
        console.log("✅ Clock Status query cache updated!");
      } catch (err) {
        console.error("❌ Error refreshing clock status:", err);
        qc.invalidateQueries({ queryKey: ["clockStatus"] });
      }
    };

    const onGuardLunchEnded = async (payload) => {
      console.log("📡 guard_lunch_ended", payload);
      try {
        const response = await getClockStatus();
        const clockStatusData = response.data;
        qc.setQueryData(["clockStatus"], clockStatusData);
        // Also update local state to force immediate UI re-render
        setLocalClockStatus(clockStatusData);
        await qc.refetchQueries({ queryKey: ["clockStatus"] });
        console.log("✅ Clock Status query cache updated!");
      } catch (err) {
        console.error("❌ Error refreshing clock status:", err);
        qc.invalidateQueries({ queryKey: ["clockStatus"] });
      }
    };

    // ✅ Listen for new incidents
    const onIncidentNew = async (payload) => {
      console.log("📡 incidents:new", payload);
      try {
        const response = await listIncidents({ status: "OPEN", limit: 20 });
        const incidentsData = response.data || [];
        qc.setQueryData(["incidents"], incidentsData);
        console.log("✅ Incidents query cache updated!");
      } catch (err) {
        console.error("❌ Error refreshing incidents:", err);
        qc.invalidateQueries({ queryKey: ["incidents"] });
      }
    };

    // ✅ Listen for emergency SOS events
    const onEmergencySOS = async (payload) => {
      console.log("🚨 emergency:sos", payload);
      
      // Refresh active emergencies query to get latest data
      await qc.refetchQueries({ queryKey: ["activeEmergencies"] });
      
      // Show critical alert to admin
      const guardName = payload?.guardName || "Unknown Guard";
      const location = payload?.location;
      const locationText = location 
        ? `Location: ${location.lat.toFixed(6)}, ${location.lng.toFixed(6)}`
        : "Location: Not available";
      
      // Show browser alert (critical - blocks UI)
      alert(
        `🚨 EMERGENCY SOS ALERT\n\n` +
        `Guard: ${guardName}\n` +
        `${locationText}\n\n` +
        `On-call supervisor is being notified and called.\n\n` +
        `Check dashboard for details.`
      );
      
      // Refresh all dashboard data
      refreshAll();
    };

    // ✅ Listen for emergency resolution events
    const onEmergencyResolved = async (payload) => {
      console.log("✅ emergency:resolved", payload);
      // Refresh active emergencies to remove resolved ones
      await qc.refetchQueries({ queryKey: ["activeEmergencies"] });
    };

    // ✅ Listen for guard availability updates (from admin-dashboard socket)
    const onGuardAvailabilityUpdated = async (payload) => {
      console.log("📡 guard:availability_updated", payload);
      try {
        // Immediately invalidate and refetch availability data
        console.log("🔄 Invalidating and refetching guard availability after update...");
        qc.invalidateQueries({ queryKey: ["availability"] });
        // Force immediate refetch
        const result = await qc.refetchQueries({ queryKey: ["availability"], exact: true });
        console.log("✅ Guard availability query refetched!", result);
        
        // Also manually trigger a refetch after a short delay to ensure it updates
        setTimeout(() => {
          console.log("🔄 Secondary refetch after socket event...");
          qc.refetchQueries({ queryKey: ["availability"] });
        }, 500);
      } catch (err) {
        console.error("❌ Error refreshing guard availability:", err);
        // Fallback to invalidate and try again
        qc.invalidateQueries({ queryKey: ["availability"] });
        setTimeout(() => {
          qc.refetchQueries({ queryKey: ["availability"] });
        }, 1000);
      }
    };

    // ✅ Listen for guard status updates (when active/inactive changes)
    const onGuardStatusUpdated = async (payload) => {
      console.log("📡 guard:status_updated", payload);
      try {
        // When a guard becomes active/inactive, availability counts change
        console.log("🔄 Guard active status changed, refreshing availability...");
        qc.invalidateQueries({ queryKey: ["availability"] });
        await qc.refetchQueries({ queryKey: ["availability"] });
        console.log("✅ Guard availability query refetched after status change!");
      } catch (err) {
        console.error("❌ Error refreshing guard availability after status change:", err);
        qc.invalidateQueries({ queryKey: ["availability"] });
      }
    };

    // Attach availability listener to admin socket (port 5000)
    if (adminS) {
      // Remove existing listeners first to avoid duplicates
      adminS.off("guard:availability_updated", onGuardAvailabilityUpdated);
      adminS.off("guard:status_updated", onGuardStatusUpdated);
      adminS.on("guard:availability_updated", onGuardAvailabilityUpdated);
      adminS.on("guard:status_updated", onGuardStatusUpdated);
      console.log("✅ Listening for guard:availability_updated on admin socket");
      console.log("✅ Listening for guard:status_updated on admin socket");
      console.log("✅ Admin socket connected:", adminS.connected);
      console.log("✅ Admin socket ID:", adminS.id);
    } else {
      console.warn("⚠️ Admin socket not available - real-time updates disabled");
    }

    // ✅ Listen for incident updates
    const onIncidentUpdated = async (payload) => {
      console.log("📡 incidents:updated", payload);
      qc.invalidateQueries({ queryKey: ["incidents"] });
    };

    // Listen for ANY socket event (for debugging)
    const onAnyEvent = (eventName, ...args) => {
      // Log clock-related events for debugging
      if (eventName.includes("clock") || eventName.includes("guard_clocked")) {
        console.log("🔍 onAnyEvent caught:", eventName, args);
      }
      console.log("📡 [Dashboard] Socket event received:", eventName, args);
      // If it's clock-related, also refresh clock status
      if (eventName.includes("clocked") || eventName.includes("lunch")) {
        console.log("🔄 Clock event detected, refreshing clock status...");
        qc.invalidateQueries({ queryKey: ["clockStatus"] });
      }
      // If it's callout-related, refresh
      if (eventName.includes("callout") || eventName.includes("shift") || eventName.includes("running_late") || eventName.includes("clocked") || eventName.includes("lunch") || eventName.includes("emergency")) {
        console.log("🔄 Triggering refresh due to", eventName);
        refreshAll();
      }
    };

    // Attach listeners immediately (Socket.IO queues events if not connected)
    // Also handle connection/reconnection to ensure listeners are always active
    const attachListeners = () => {
      console.log("🔌 Attaching socket listeners...");
      console.log("🔌 Socket ID:", s.id);
      console.log("🔌 Socket connected:", s.connected);
      
      // Remove existing listeners first to avoid duplicates
      s.off("callout_started", onCalloutStarted);
      s.off("shift_filled", onShiftFilled);
      s.off("callout_response", onCalloutResponse);
      s.off("callout_update", onCalloutUpdate);
      s.off("guard_running_late", onGuardRunningLate);
      s.off("guard_clocked_in", onGuardClockedIn);
      s.off("guard_clocked_out", onGuardClockedOut);
      s.off("guard_lunch_started", onGuardLunchStarted);
      s.off("guard_lunch_ended", onGuardLunchEnded);
      s.off("incidents:new", onIncidentNew);
      s.off("incidents:updated", onIncidentUpdated);
      s.off("emergency:sos", onEmergencySOS);
      s.off("emergency:resolved", onEmergencyResolved);
      
      // Attach listeners
      s.on("callout_started", onCalloutStarted);
      s.on("shift_filled", onShiftFilled);
      s.on("callout_response", onCalloutResponse);
      s.on("callout_update", onCalloutUpdate);
      s.on("guard_running_late", onGuardRunningLate);
      s.on("guard_clocked_in", onGuardClockedIn);
      s.on("guard_clocked_out", onGuardClockedOut);
      s.on("guard_lunch_started", onGuardLunchStarted);
      s.on("guard_lunch_ended", onGuardLunchEnded);
      s.on("incidents:new", onIncidentNew);
      s.on("incidents:updated", onIncidentUpdated);
      s.on("emergency:sos", onEmergencySOS);
      s.on("emergency:resolved", onEmergencyResolved);
      
      // Use onAny if available for debugging - catch ALL events to see what's being received
      if (typeof s.onAny === "function") {
        // Remove existing onAny first
        s.offAny();
        const debugOnAny = (eventName, ...args) => {
          // Log callout-related events prominently
          if (eventName.includes("callout") || eventName.includes("shift_filled")) {
            console.log("🔍 [onAny] CALLOUT EVENT DETECTED:", eventName, args);
            console.log("🔄 [onAny] This should trigger refreshAll()...");
          }
          // Also log clock-related events
          if (eventName.includes("clock") || eventName.includes("guard_")) {
            console.log("🔍 [onAny] CLOCK EVENT:", eventName, args);
          }
        };
        s.onAny(debugOnAny);
        console.log("✅ onAny listener attached for debugging (will log callout and clock events)");
      } else {
        console.warn("⚠️ s.onAny not available - using individual listeners only");
      }
      
      // Add explicit debug logging for clock events to verify they're being received
      // Note: These are in addition to the main handlers, not replacing them
      s.on("guard_clocked_in", (...args) => {
        console.log("🔍 DEBUG LISTENER: guard_clocked_in received", args);
      });
      s.on("guard_clocked_out", (...args) => {
        console.log("🔍 DEBUG LISTENER: guard_clocked_out received", args);
        // Also trigger the main handler to ensure it runs (with small delay to avoid conflicts)
        console.log("🔍 Triggering onGuardClockedOut handler from debug listener...");
        setTimeout(() => {
          onGuardClockedOut(...args);
        }, 50);
      });
      
      // Also listen for alternative event names that might be used
      s.on("time_entry:clocked_out", (...args) => {
        console.log("🔍 DEBUG LISTENER: time_entry:clocked_out received (alternative name)", args);
        setTimeout(() => {
          onGuardClockedOut(...args);
        }, 50);
      });
      s.on("time_entry:clocked_in", (...args) => {
        console.log("🔍 DEBUG LISTENER: time_entry:clocked_in received (alternative name)", args);
      });
      s.on("clock_out", (...args) => {
        console.log("🔍 DEBUG LISTENER: clock_out received (alternative name)", args);
        setTimeout(() => {
          onGuardClockedOut(...args);
        }, 50);
      });
      s.on("clock_in", (...args) => {
        console.log("🔍 DEBUG LISTENER: clock_in received (alternative name)", args);
      });
      console.log("✅ Debug listeners attached for clock events (including alternative names)");
      
      console.log("✅ All socket listeners attached");
    };

    // Attach listeners immediately (works even if socket not connected yet)
    attachListeners();

    // Check current connection status
    if (s.connected) {
      console.log("✅ Socket already connected when listeners attached");
      console.log("🔌 Socket ID:", s.id);
      console.log("🔌 Socket rooms:", s.rooms ? Array.from(s.rooms) : "unknown");
    } else {
      console.log("⏳ Socket not connected yet - will attach when it connects");
      console.log("💡 Socket will automatically connect and join 'admins' room");
    }

    // Also attach on connect/reconnect to ensure they're always active
    const onConnect = () => {
      console.log("✅ Socket connected, ensuring listeners are attached...");
      console.log("🔌 Connected socket ID:", s.id);
      console.log("🔌 Socket connected status:", s.connected);
      attachListeners();
      
      // Verify we're in the admin room
      console.log("🔍 Verifying socket is in 'admins' room...");
      // Note: socket.rooms is a Set, we can't directly check, but if join_admin was emitted, we should be in the room
      console.log("📤 Socket should have joined 'admins' room via join_admin event");
      
      // Test if we can receive events
      console.log("🧪 Testing socket event reception...");
      setTimeout(() => {
        console.log("🔍 Socket still connected?", s.connected);
        console.log("🔍 Socket ID:", s.id);
      }, 1000);
    };
    
    const onReconnect = (attemptNumber) => {
      console.log("🔄 Socket reconnected, re-attaching listeners...");
      console.log("🔌 Reconnected socket ID:", s.id);
      attachListeners();
    };
    
    // Attach connect/reconnect handlers BEFORE checking connection status
    s.on("connect", onConnect);
    s.on("reconnect", onReconnect);
    
    // If already connected, attach listeners now
    if (s.connected) {
      console.log("✅ Socket already connected, attaching listeners now");
      attachListeners();
    }
    
    // Log connection error once to avoid console spam on reconnect loops
    let connectErrorLogged = false;
    s.on("connect_error", () => {
      if (!connectErrorLogged) {
        connectErrorLogged = true;
        console.warn("⚠️ Guard socket unavailable (realtime disabled until connection succeeds).");
      }
    });

    return () => {
      // Cleanup: remove all listeners
      s.off("callout_started", onCalloutStarted);
      s.off("shift_filled", onShiftFilled);
      s.off("callout_response", onCalloutResponse);
      s.off("callout_update", onCalloutUpdate);
      s.off("guard_running_late", onGuardRunningLate);
      s.off("guard_clocked_in", onGuardClockedIn);
      s.off("guard_clocked_out", onGuardClockedOut);
      s.off("guard_lunch_started", onGuardLunchStarted);
      s.off("guard_lunch_ended", onGuardLunchEnded);
      s.off("incidents:new", onIncidentNew);
      s.off("incidents:updated", onIncidentUpdated);
      s.off("emergency:sos", onEmergencySOS);
      s.off("emergency:resolved", onEmergencyResolved);
      s.off("connect", onConnect);
      s.off("reconnect", onReconnect);
      if (adminS) {
        adminS.off("guard:availability_updated", onGuardAvailabilityUpdated);
        adminS.off("guard:status_updated", onGuardStatusUpdated);
      }
      if (typeof s.offAny === "function") {
        s.offAny();
      }
    };
  }, [canReadDashboard, qc, qCallouts, qActiveEmergencies]);

  // =============================
  // Permission gate
  // =============================
  if (!canReadDashboard) {
    return (
      <div className="container">
        <h1 style={{ marginBottom: 10 }}>Dashboard</h1>
        <div className="notice">
          You don’t have permission to view dashboard data.
        </div>
      </div>
    );
  }

  // =============================
  // Derived data
  // =============================
  const open = qOpen.data?.data || [];
  
  // After extracting response.data in queryFn:
  // - qCallouts.data = { data: [...] } (the API response body)
  // - qCallouts.data.data = [...] (the actual array)
  // Use local state if available, otherwise use query data
  // ✅ FIX: Use useMemo to ensure recalculation when dependencies change
  const callouts = useMemo(() => {
    const local = localCallouts;
    const query = qCallouts.data?.data;
    
    // Prefer local state if it exists, otherwise use query data
    const result = local || query || [];
    
    // Debug: Log the actual count being used
    console.log("🔢 [COUNT] Callouts count calculation:", {
      localCalloutsLength: local?.length || 0,
      queryDataLength: query?.length || 0,
      finalCalloutsLength: result.length,
      usingSource: local ? "localCallouts" : "qCallouts.data",
      localFirstId: local?.[0]?.id || "none",
      queryFirstId: query?.[0]?.id || "none",
      resultFirstId: result[0]?.id || "none",
      timestamp: new Date().toISOString(),
    });
    
    return result;
  }, [localCallouts, qCallouts.data, qCallouts.dataUpdatedAt]);
  
  // Force a state update when callouts change - track count separately to force re-render
  const [calloutCount, setCalloutCount] = useState(() => {
    const initial = localCallouts?.length || qCallouts.data?.data?.length || 0;
    console.log("🔢 [COUNT] Initial calloutCount:", initial);
    return initial;
  });
  
  useEffect(() => {
    const newCount = callouts.length;
    console.log("🔢 [COUNT] useEffect triggered:", {
      currentCount: calloutCount,
      newCount: newCount,
      calloutsLength: callouts.length,
      willUpdate: newCount !== calloutCount,
    });
    
    if (newCount !== calloutCount) {
      console.log("🔄 [COUNT] Count changed, updating state:", {
        oldCount: calloutCount,
        newCount: newCount,
      });
      setCalloutCount(newCount);
    }
  }, [callouts.length, callouts, calloutCount]);
  const runningLate = qRunningLate.data?.data || [];
  // Fix: getGuardAvailability returns data directly, not nested in data.data
  const avail = qAvail.data || {};
  // Use local state if available, otherwise use query data (similar to callouts for immediate updates)
  const clockStatus = localClockStatus || qClockStatus.data || {};
  const clockedInRaw = clockStatus.clockedIn || [];
  const onBreak = clockStatus.onBreak || [];
  const clockedOutRaw = clockStatus.clockedOut || [];
  // Group clocked in by guard: show one row per guard with their latest clock-in
  const clockedIn = useMemo(() => {
    const byGuard = new Map();
    for (const entry of clockedInRaw) {
      const key = entry.guardId || entry.guardEmail || entry.guardName || entry.id;
      const existing = byGuard.get(key);
      const inAt = entry.clockInAt ? new Date(entry.clockInAt).getTime() : 0;
      if (!existing || (existing.clockInAt && new Date(existing.clockInAt).getTime() < inAt)) {
        byGuard.set(key, entry);
      }
    }
    return Array.from(byGuard.values());
  }, [clockedInRaw]);
  // Group clocked out by guard: show one row per guard with their latest clock-out
  const clockedOut = useMemo(() => {
    const byGuard = new Map();
    for (const entry of clockedOutRaw) {
      const key = entry.guardId || entry.guardEmail || entry.guardName || entry.id;
      const existing = byGuard.get(key);
      const outAt = entry.clockOutAt ? new Date(entry.clockOutAt).getTime() : 0;
      if (!existing || (existing.clockOutAt && new Date(existing.clockOutAt).getTime() < outAt)) {
        byGuard.set(key, entry);
      }
    }
    return Array.from(byGuard.values());
  }, [clockedOutRaw]);
  const incidents = qIncidents.data || [];
  
  // Debug logging for clock status
  useEffect(() => {
    console.log("📊 Clock Status state updated:", {
      clockedInCount: clockedIn.length,
      onBreakCount: onBreak.length,
      clockedOutCount: clockedOut.length,
      isLoading: qClockStatus.isLoading,
      hasData: !!qClockStatus.data,
      lastFetch: qClockStatus.dataUpdatedAt ? new Date(qClockStatus.dataUpdatedAt).toLocaleTimeString() : "never",
    });
    // Debug: Check if Bob is in the right list
    if (clockedOut.length > 0) {
      const bob = clockedOut.find(g => g.guardEmail === "bob@abe.com");
      if (bob) {
        console.log("✅ Bob is in clockedOut array in UI state");
      }
    }
    if (clockedIn.length > 0) {
      const bob = clockedIn.find(g => g.guardEmail === "bob@abe.com");
      if (bob) {
        console.log("⚠️ Bob is in clockedIn array in UI state (should be clockedOut)");
      }
    }
  }, [clockedIn.length, onBreak.length, clockedOut.length, qClockStatus.isLoading, qClockStatus.data, qClockStatus.dataUpdatedAt]);

  // Update local state when query data loads or changes
  useEffect(() => {
    if (qCallouts.data?.data) {
      const newCallouts = qCallouts.data.data;
      const currentCallouts = localCallouts || [];
      
      // Check if data actually changed (compare by ID or length)
      const hasChanged = 
        newCallouts.length !== currentCallouts.length ||
        (newCallouts.length > 0 && newCallouts[0]?.id !== currentCallouts[0]?.id);
      
      if (hasChanged || !localCallouts) {
        console.log("📊 Callouts query data changed, updating local state:", {
          oldCount: currentCallouts.length,
          newCount: newCallouts.length,
          oldFirstId: currentCallouts[0]?.id || "none",
          newFirstId: newCallouts[0]?.id || "none",
        });
        setLocalCallouts(newCallouts);
      }
    }
  }, [qCallouts.data, localCallouts]);
  
  // Update local clock status when query data loads initially
  useEffect(() => {
    if (qClockStatus.data && !localClockStatus) {
      console.log("📊 Initial clock status loaded, setting local state");
      setLocalClockStatus(qClockStatus.data);
    }
  }, [qClockStatus.data, localClockStatus]);

  // Debug: Log when callouts data changes
  useEffect(() => {
    const actualCount = callouts.length;
    const localCount = localCallouts?.length || 0;
    const queryCount = qCallouts.data?.data?.length || 0;
    
    console.log("📊 [UI] Callouts state updated:", {
      actualCount: actualCount,
      localCalloutsCount: localCount,
      queryDataCount: queryCount,
      calloutsSource: localCallouts && localCallouts.length > 0 ? "localCallouts" : "qCallouts.data",
      firstCalloutId: callouts[0]?.id || "none",
      mismatch: actualCount !== localCount && actualCount !== queryCount ? "⚠️ MISMATCH!" : "✅ OK",
    });
    
    // Warn if there's a mismatch
    if (actualCount !== localCount && actualCount !== queryCount) {
      console.warn("⚠️ [UI] Callouts count mismatch detected!", {
        actualCount,
        localCount,
        queryCount,
        calloutsArray: callouts,
        localCalloutsArray: localCallouts,
        queryDataArray: qCallouts.data?.data,
      });
    }
    
    // Verify the data is actually being used
    if (callouts.length > 0) {
      console.log("📊 [UI] First callout:", {
        id: callouts[0].id,
        guardName: callouts[0].guardName || callouts[0].guard_name || "unknown",
        reason: callouts[0].reason || "unknown",
      });
    }
  }, [callouts.length, callouts, localCallouts, qCallouts.data]);

  // Debug: Log availability data
  useEffect(() => {
    console.log("📊 Availability data:", {
      qAvailData: qAvail.data,
      avail: avail,
      available: avail.available,
      unavailable: avail.unavailable,
      active: avail.active,
      total: avail.total,
      isLoading: qAvail.isLoading,
      error: qAvail.error,
      isFetching: qAvail.isFetching,
      dataUpdatedAt: qAvail.dataUpdatedAt,
    });
    
    // Force refetch if data seems stale (older than 5 seconds)
    if (qAvail.data && qAvail.dataUpdatedAt) {
      const age = Date.now() - qAvail.dataUpdatedAt;
      if (age > 5000 && !qAvail.isFetching) {
        console.log("🔄 Data is stale, forcing refetch...");
        qc.refetchQueries({ queryKey: ["availability"] });
      }
    }
  }, [qAvail.data, avail, qAvail.isLoading, qAvail.error, qAvail.isFetching, qAvail.dataUpdatedAt, qc]);

  const availableCount = Number(avail.available || 0);
  const unavailableCount = Number(avail.unavailable || 0);

  const sparkA = [
    safeLen(open),
    safeLen(callouts),
    availableCount,
    unavailableCount,
    safeLen(open),
  ];

  const sparkB = [
    availableCount,
    unavailableCount,
    safeLen(callouts),
    safeLen(open),
    availableCount,
  ];

  return (
    <div className="container">
      {/* ✅ Welcome banner (does NOT replace the dashboard) */}
      <div className="welcomeBanner" style={{ marginBottom: 12 }}>
        <div className="welcomeText">{welcomeText}</div>
      </div>

      {/* Live Clock and SOS Indicator */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
        {/* SOS Indicator */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "12px 20px",
            borderRadius: 12,
            background: activeEmergencies.length > 0 
              ? "rgba(239, 68, 68, 0.15)" 
              : "rgba(255, 255, 255, 0.05)",
            border: `2px solid ${activeEmergencies.length > 0 ? "#ef4444" : "rgba(255, 255, 255, 0.1)"}`,
            cursor: activeEmergencies.length > 0 ? "pointer" : "default",
            transition: "all 0.3s ease",
          }}
          onClick={async () => {
            if (activeEmergencies.length > 0) {
              const details = activeEmergencies.map((e, idx) => 
                `${idx + 1}. ${e.guardName} - ${e.location ? `${e.location.lat.toFixed(4)}, ${e.location.lng.toFixed(4)}` : "No location"}`
              ).join("\n");
              
              const action = confirm(
                `🚨 ACTIVE EMERGENCIES (${activeEmergencies.length})\n\n${details}\n\n` +
                `Click OK to resolve all emergencies, or Cancel to view only.`
              );
              
              if (action) {
                // Resolve all active emergencies
                try {
                  console.log("🔄 Resolving emergencies:", activeEmergencies.map(e => e.id));
                  const resolvePromises = activeEmergencies.map((e) =>
                    resolveEmergency(e.id, "Resolved from dashboard").catch(err => {
                      console.error(`❌ Failed to resolve emergency ${e.id}:`, err);
                      return { error: true, id: e.id, error: err };
                    })
                  );
                  const results = await Promise.all(resolvePromises);
                  
                  // Check for errors
                  const errors = results.filter(r => r && r.error);
                  const successes = results.filter(r => !r || !r.error);
                  
                  console.log(`✅ Resolved ${successes.length} emergencies, ${errors.length} failed`);
                  
                  // Refresh the query
                  await qc.refetchQueries({ queryKey: ["activeEmergencies"] });
                  
                  if (errors.length > 0) {
                    alert(`⚠️ Resolved ${successes.length} emergencies, but ${errors.length} failed. Check console for details.`);
                  } else {
                    alert(`✅ All ${successes.length} emergencies resolved successfully`);
                  }
                } catch (err) {
                  console.error("❌ Error resolving emergencies:", err);
                  console.error("❌ Error details:", err.response?.data || err.message);
                  alert(`❌ Failed to resolve emergencies: ${err.response?.data?.message || err.message || "Unknown error"}`);
                }
              }
            }
          }}
          title={activeEmergencies.length > 0 ? `${activeEmergencies.length} active emergency(ies) - Click to resolve` : "No active emergencies"}
        >
          <div
            style={{
              width: 24,
              height: 24,
              borderRadius: "50%",
              background: activeEmergencies.length > 0 ? "#ef4444" : "#6b7280",
              boxShadow: activeEmergencies.length > 0 
                ? "0 0 20px rgba(239, 68, 68, 0.8), 0 0 40px rgba(239, 68, 68, 0.4)"
                : "none",
              animation: activeEmergencies.length > 0 ? "sosBlink 1s infinite" : "none",
            }}
          />
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <div
              style={{
                fontSize: 16,
                fontWeight: 700,
                color: activeEmergencies.length > 0 ? "#ef4444" : "#9ca3af",
                textShadow: activeEmergencies.length > 0 ? "0 0 10px rgba(239, 68, 68, 0.5)" : "none",
              }}
            >
              🆘 SOS
            </div>
            {activeEmergencies.length > 0 && (
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: "#ef4444",
                }}
              >
                {activeEmergencies.length} Active
              </div>
            )}
          </div>
        </div>
        
        {/* Live Clock */}
        <LiveClock />
      </div>

      <h1 style={{ marginBottom: 14 }}>Dashboard</h1>

      {/* KPI row */}
      <div className="kpiRow" style={{ marginBottom: 14 }}>
        <div className="kpi">
          <div className="kpiLabel">Open Shifts</div>
          <div className="kpiValue">{safeLen(open)}</div>
        </div>
        <div className="kpi">
          <div className="kpiLabel">Clocked In</div>
          <div className="kpiValue">{safeLen(clockedIn)}</div>
        </div>
        <div className="kpi">
          <div className="kpiLabel">On Break</div>
          <div className="kpiValue">{safeLen(onBreak)}</div>
        </div>
        <div className="kpi">
          <div className="kpiLabel">Clocked Out</div>
          <div className="kpiValue">{safeLen(clockedOut)}</div>
        </div>
        <div className="kpi">
          <div className="kpiLabel">Live Callouts</div>
          <div 
            className="kpiValue" 
            key={`callouts-${calloutCount}-${callouts[0]?.id || 'none'}-${localCallouts?.length || 0}`}
            style={{ 
              // Force re-render by using a style that changes
              opacity: calloutCount > 0 ? 1 : 0.8,
            }}
          >
            {calloutCount}
          </div>
        </div>
        <div className="kpi">
          <div className="kpiLabel">Running Late</div>
          <div className="kpiValue">{safeLen(runningLate)}</div>
        </div>
        <div className="kpi">
          <div className="kpiLabel">Available Guards</div>
          <div className="kpiValue">{availableCount}</div>
        </div>
        <div className="kpi">
          <div className="kpiLabel">Open Incidents</div>
          <div className="kpiValue">{safeLen(incidents)}</div>
        </div>
        <div className="kpi">
          <div className="kpiLabel">Sites</div>
          <div className="kpiValue">{qSites.isLoading ? "…" : sitesCount}</div>
        </div>
      </div>

      {/* Charts */}
      <div className="chartRow">
        <Card title="Availability Split" subtitle="Available vs Unavailable">
          {qAvail.isLoading ? (
            <div style={{ opacity: 0.75 }}>Loading…</div>
          ) : (
            <Donut
              a={availableCount}
              b={unavailableCount}
              labelA="Available"
              labelB="Unavailable"
            />
          )}
        </Card>

        <Card title="Ops Activity" subtitle="Quick visual (derived)">
          <SparkBars values={sparkA} />
          <div style={{ fontSize: 12, opacity: 0.7, marginTop: 10 }}>
            Bars are a simple visual cue. (Derived from current counts.)
          </div>
        </Card>
      </div>

      {/* Lists */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
          gap: 14,
          marginTop: 14,
        }}
      >
          <Card
  title="Open Shifts"
  subtitle={qOpen.isLoading ? "Loading…" : `${safeLen(open)} open`}
>
  {qOpen.isLoading ? (
    <div style={{ opacity: 0.75 }}>Loading…</div>
  ) : safeLen(open) === 0 ? (
    <div style={{ opacity: 0.75 }}>No open shifts 🎉</div>
  ) : (
    <ul className="list">
      {open.slice(0, 6).map((s) => {
        // ✅ Your real DB columns (abe_guard.public.shifts)
        // id, tenant_id, guard_id, shift_date, shift_start, shift_end, status, created_at, ai_decision

        const label =
          s.location ||
          s.site ||
          s.site_name ||
          (s.tenant_id ? `Tenant ${String(s.tenant_id).slice(0, 8)}…` : "Shift");

        // ✅ Date: use shift_date only (it's a real DATE)
        const dateStr = s.shift_date || s.shiftDate || "";
        const datePretty = dateStr
          ? new Date(dateStr).toLocaleDateString()
          : "";

        // ✅ Times: shift_start / shift_end are TIME strings (safe to show as-is)
        const start =
          s.shift_start ??
          s.start ??
          s.startTime ??
          s.start_time ??
          "—";

        const end =
          s.shift_end ??
          s.end ??
          s.endTime ??
          s.end_time ??
          "—";

        return (
          <li key={s.id}>
            <b>{label}</b>
            <div className="muted">
              {datePretty ? `${datePretty} • ` : ""}
              {start} → {end}
            </div>
          </li>
        );
      })}
    </ul>
  )}
</Card>



        <Card
          title="Live Callouts"
          subtitle={
            qCallouts.isLoading ? "Loading…" : `${calloutCount} active`
          }
        >
          {qCallouts.isLoading ? (
            <div style={{ opacity: 0.75 }}>Loading…</div>
          ) : safeLen(callouts) === 0 ? (
            <div style={{ opacity: 0.75 }}>No callouts</div>
          ) : (
            <ul className="list">
              {callouts.slice(0, 6).map((c) => (
                <li key={c.id}>
                  <b>{c.guardName || "Guard"}</b>
                  <div className="muted">{c.reason || "No reason"}</div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card
          title="Running Late"
          subtitle={
            qRunningLate.isLoading ? "Loading…" : `${safeLen(runningLate)} guards`
          }
        >
          {qRunningLate.isLoading ? (
            <div style={{ opacity: 0.75 }}>Loading…</div>
          ) : safeLen(runningLate) === 0 ? (
            <div style={{ opacity: 0.75 }}>No guards running late 🎉</div>
          ) : (
            <ul className="list">
              {runningLate.slice(0, 6).map((r) => (
                <li key={r.id}>
                  <b>{r.guardName || "Guard"}</b>
                  <div className="muted">{r.reason || "Running late"}</div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* ✅ Clocked In */}
        <Card
          title="Clocked In"
          subtitle={
            qClockStatus.isLoading ? "Loading…" : `${safeLen(clockedIn)} guards`
          }
        >
          {qClockStatus.isLoading ? (
            <div style={{ opacity: 0.75 }}>Loading…</div>
          ) : safeLen(clockedIn) === 0 ? (
            <div style={{ opacity: 0.75 }}>No guards clocked in</div>
          ) : (
            <ul className="list">
              {clockedIn.slice(0, 6).map((g) => {
                // Debug log for each guard
                if (!g.location) {
                  console.log("⚠️ Guard without location:", {
                    name: g.guardName,
                    id: g.id,
                    shiftId: g.shiftId,
                    allFields: Object.keys(g),
                  });
                }
                // Calculate hours worked (rough estimate)
                const clockInTime = new Date(g.clockInAt);
                const now = new Date();
                const hoursWorked = ((now - clockInTime) / (1000 * 60 * 60)).toFixed(1);
                const isOvertime = parseFloat(hoursWorked) >= 8;

                return (
                  <li key={g.guardId || g.guardEmail || g.id}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <div style={{ flex: 1 }}>
                        <b>{g.guardName || "Guard"}</b>
                        <div className="muted">
                          {g.location ? `${g.location} • ` : ""}
                          Clocked in: {formatRelativeTime(g.clockInAt)}
                          {parseFloat(hoursWorked) > 0 && (
                            <span style={{ 
                              marginLeft: 8, 
                              color: isOvertime ? "#dc2626" : "#64748b",
                              fontWeight: isOvertime ? 600 : 400
                            }}>
                              • {hoursWorked}h {isOvertime && "⚠️ OT"}
                            </span>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={() => setOvertimeOfferGuard(g)}
                        style={{
                          padding: "6px 12px",
                          borderRadius: 6,
                          border: "none",
                          background: "#f97316",
                          color: "white",
                          fontWeight: 600,
                          cursor: "pointer",
                          fontSize: 12,
                          whiteSpace: "nowrap",
                          marginLeft: 12,
                        }}
                        title="Offer overtime to this guard"
                      >
                        Offer OT
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        {/* ✅ On Break */}
        <Card
          title="On Break"
          subtitle={
            qClockStatus.isLoading ? "Loading…" : `${safeLen(onBreak)} guards`
          }
        >
          {qClockStatus.isLoading ? (
            <div style={{ opacity: 0.75 }}>Loading…</div>
          ) : safeLen(onBreak) === 0 ? (
            <div style={{ opacity: 0.75 }}>No guards on break</div>
          ) : (
            <ul className="list">
              {onBreak.slice(0, 6).map((g) => (
                <li key={g.id}>
                  <b>{g.guardName || "Guard"}</b>
                  <div className="muted">
                    {g.location ? `${g.location} • ` : ""}
                    Break started: {formatRelativeTime(g.lunchStartAt)}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* ✅ Clocked Out */}
        <Card
          title="Clocked Out"
          subtitle={
            qClockStatus.isLoading ? "Loading…" : `${safeLen(clockedOut)} guards`
          }
        >
          {qClockStatus.isLoading ? (
            <div style={{ opacity: 0.75 }}>Loading…</div>
          ) : safeLen(clockedOut) === 0 ? (
            <div style={{ opacity: 0.75 }}>No guards clocked out</div>
          ) : (
            <ul className="list">
              {clockedOut.slice(0, 6).map((g) => (
                <li key={g.guardId || g.guardEmail || g.id}>
                  <b>{g.guardName || "Guard"}</b>
                  <div className="muted">
                    {g.location ? `${g.location} • ` : ""}
                    Clocked out: {formatRelativeTime(g.clockOutAt)}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* ✅ Overtime Requests */}
        <OvertimeRequests />

        {/* ✅ Live Incidents */}
        <Card
          title="Live Incidents"
          subtitle={
            qIncidents.isLoading ? "Loading…" : `${safeLen(incidents)} open`
          }
        >
          {qIncidents.isLoading ? (
            <div style={{ opacity: 0.75 }}>Loading…</div>
          ) : safeLen(incidents) === 0 ? (
            <div style={{ opacity: 0.75 }}>No open incidents 🎉</div>
          ) : (
            <ul className="list">
              {incidents.slice(0, 6).map((incident) => {
                const getSeverityColor = (severity) => {
                  switch (severity?.toUpperCase()) {
                    case "HIGH":
                      return "#ef4444";
                    case "MEDIUM":
                      return "#f59e0b";
                    case "LOW":
                      return "#10b981";
                    default:
                      return "#6b7280";
                  }
                };

                const getStatusColor = (status) => {
                  switch (status?.toUpperCase()) {
                    case "OPEN":
                      return "#3b82f6";
                    case "ACKNOWLEDGED":
                      return "#8b5cf6";
                    case "RESOLVED":
                      return "#10b981";
                    default:
                      return "#6b7280";
                  }
                };

                return (
                  <li key={incident.id}>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 4 }}>
                      <b>{incident.type || "Incident"}</b>
                      <span
                        style={{
                          padding: "2px 8px",
                          borderRadius: 8,
                          fontSize: 10,
                          fontWeight: 700,
                          background: getSeverityColor(incident.severity) + "20",
                          color: getSeverityColor(incident.severity),
                        }}
                      >
                        {incident.severity}
                      </span>
                      <span
                        style={{
                          padding: "2px 8px",
                          borderRadius: 8,
                          fontSize: 10,
                          fontWeight: 700,
                          background: getStatusColor(incident.status) + "20",
                          color: getStatusColor(incident.status),
                        }}
                      >
                        {incident.status}
                      </span>
                    </div>
                    <div className="muted">
                      {incident.site?.name || incident.location_text || "No location"}
                      {incident.description && ` • ${incident.description.substring(0, 40)}${incident.description.length > 40 ? "..." : ""}`}
                    </div>
                    <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>
                      Reported: {formatRelativeTime(incident.reported_at)}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        {/* ✅ Recent Activity */}
        <Card title="Recent Activity" subtitle="Latest availability changes">
          {activityErr ? <div className="notice">{activityErr}</div> : null}

          {activityLoading ? (
            <div style={{ opacity: 0.75 }}>Loading…</div>
          ) : activity.length === 0 ? (
            <div style={{ opacity: 0.75 }}>No recent activity yet.</div>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {activity.slice(0, 12).map((a) => {
                const guardLabel =
                  a.guard?.name ||
                  a.guard?.email ||
                  (a.guardId ? `Guard #${a.guardId}` : "Guard");

                const toLabel =
                  a.to === null || typeof a.to === "undefined"
                    ? "—"
                    : a.to
                    ? "Available"
                    : "Unavailable";

                return (
                  <div
                    key={a.id}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 12,
                      padding: 10,
                      borderRadius: 14,
                      border: "1px solid rgba(255,255,255,0.08)",
                      background: "rgba(255,255,255,0.03)",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        gap: 10,
                        alignItems: "center",
                      }}
                    >
                      <span
                        style={{
                          width: 10,
                          height: 10,
                          borderRadius: 999,
                          background: a.to ? "#22c55e" : "#ef4444",
                        }}
                      />
                      <div style={{ display: "grid", gap: 2 }}>
                        <div style={{ fontWeight: 800 }}>
                          {guardLabel} →{" "}
                          <span style={{ opacity: 0.9 }}>{toLabel}</span>
                        </div>
                        <div style={{ fontSize: 12, opacity: 0.75 }}>
                          {a.actorAdminId
                            ? `Changed by Admin #${a.actorAdminId}`
                            : "Changed by —"}
                          {a.note ? ` • ${a.note}` : ""}
                        </div>
                      </div>
                    </div>

                    <div
                      style={{
                        fontSize: 12,
                        opacity: 0.75,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {formatRelativeTime(a.createdAt)}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        <Card title="Quick Visual" subtitle="Derived snapshot">
          <SparkBars values={sparkB} />
        </Card>
      </div>

      {/* Overtime Offer Modal */}
      {overtimeOfferGuard && (
        <OvertimeOfferModal
          guard={overtimeOfferGuard}
          onClose={() => setOvertimeOfferGuard(null)}
          onSuccess={(data) => {
            // Refresh clock status to show updated information
            qc.invalidateQueries({ queryKey: ["clockStatus"] });
            // Optionally show success message
            console.log("Overtime offer created:", data);
          }}
        />
      )}
    </div>
  );
}
