import React, { useState, useEffect, useCallback } from "react";
import NavBar from "../components/NavBar";
import {
  clockIn,
  clockOut,
  breakStart,
  breakEnd,
  listShifts,
  formatGuardApiError,
} from "../services/guardApi";
import { getGuardApiUrl } from "../config/apiUrls";
import { GEO_GET_CURRENT_RELAXED } from "../utils/geolocationOptions";
import "./TimeClock.css";

function formatShiftDate(d) {
  if (d == null || d === "") return "?";
  if (typeof d === "string") return d.length >= 10 ? d.slice(0, 10) : d;
  try {
    const t = new Date(d);
    if (!Number.isNaN(t.getTime())) return t.toISOString().slice(0, 10);
  } catch (_) {}
  return String(d).slice(0, 10);
}

export default function TimeClock() {
  const [shiftId, setShiftId] = useState("");
  /** When false and shiftId came from dropdown, UUID is read-only so it can’t be mistyped in the text field. */
  const [uuidEditUnlocked, setUuidEditUnlocked] = useState(false);
  const [myShifts, setMyShifts] = useState([]);
  const [shiftsLoading, setShiftsLoading] = useState(false);
  const [shiftsHint, setShiftsHint] = useState("");

  const idFromList = Boolean(shiftId && myShifts.some((s) => s.id === shiftId));
  const lockUuid = idFromList && !uuidEditUnlocked;

  const loadMyShifts = useCallback(async () => {
    const token = localStorage.getItem("guardToken") || localStorage.getItem("token");
    if (!token) {
      setShiftsHint("Log in first, then refresh this list.");
      setMyShifts([]);
      return;
    }
    setShiftsLoading(true);
    setShiftsHint("");
    try {
      const res = await listShifts();
      const rows = Array.isArray(res?.data) ? res.data : [];
      setMyShifts(rows);
      if (rows.length === 0) {
        setShiftsHint("No shifts returned — check Server URL matches the DB where shifts were created.");
      }
    } catch (e) {
      setMyShifts([]);
      setShiftsHint(e?.response?.data?.message || e?.message || "Could not load shifts");
    } finally {
      setShiftsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMyShifts();
  }, [loadMyShifts]);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [locationStatus, setLocationStatus] = useState("");
  const [locationError, setLocationError] = useState("");
  const [isGettingLocation, setIsGettingLocation] = useState(false);
  const [currentLocation, setCurrentLocation] = useState(null);

  // Get device information
  const getDeviceInfo = () => {
    const ua = navigator.userAgent;
    let deviceType = "Unknown";
    let deviceOS = "Unknown";
    let deviceId = localStorage.getItem("deviceId");

    // Generate or retrieve device ID
    if (!deviceId) {
      deviceId = `device_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      localStorage.setItem("deviceId", deviceId);
    }

    // Detect device type and OS
    if (/iPhone|iPad|iPod/i.test(ua)) {
      deviceType = "iOS";
      const match = ua.match(/OS (\d+)_(\d+)/);
      if (match) {
        deviceOS = `iOS ${match[1]}.${match[2]}`;
      } else {
        deviceOS = "iOS";
      }
    } else if (/Android/i.test(ua)) {
      deviceType = "Android";
      const match = ua.match(/Android (\d+(\.\d+)?)/);
      if (match) {
        deviceOS = `Android ${match[1]}`;
      } else {
        deviceOS = "Android";
      }
    } else if (/Windows/i.test(ua)) {
      deviceType = "Windows";
      deviceOS = "Windows";
    } else if (/Mac/i.test(ua)) {
      deviceType = "Mac";
      deviceOS = "macOS";
    }

    return { deviceId, deviceType, deviceOS };
  };

  // Get current geolocation
  const getCurrentLocation = () => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error("Geolocation is not supported by your browser"));
        return;
      }

      setIsGettingLocation(true);
      setLocationStatus("Getting your location...");
      setLocationError("");

      const options = { ...GEO_GET_CURRENT_RELAXED };

      navigator.geolocation.getCurrentPosition(
        (position) => {
          const location = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            accuracyM: position.coords.accuracy,
          };
          setCurrentLocation(location);
          setLocationStatus(`Location found (accuracy: ${Math.round(location.accuracyM)}m)`);
          setIsGettingLocation(false);
          resolve(location);
        },
        (error) => {
          setIsGettingLocation(false);
          let errorMessage = "Failed to get location";
          switch (error.code) {
            case error.PERMISSION_DENIED:
              errorMessage = "Location permission denied. Please enable location access in your browser settings.";
              break;
            case error.POSITION_UNAVAILABLE:
              errorMessage = "Location information unavailable.";
              break;
            case error.TIMEOUT:
              errorMessage =
                "Location timed out (common on emulators or indoors). You can still clock in without GPS — choose OK on the next prompt.";
              break;
            default:
              errorMessage = "An unknown error occurred while getting location.";
              break;
          }
          setLocationStatus("");
          // Do not set locationError on TIMEOUT — it races the confirm dialog and looks like a failure after OK.
          // TIMEOUT: only the confirm + “Clock in (no GPS)” path apply. Other errors: show red box.
          if (error.code !== error.TIMEOUT) {
            setLocationError(errorMessage);
          }
          reject(new Error(errorMessage));
        },
        options
      );
    });
  };

  /**
   * @param {{ skipGps?: boolean }} opts - skipGps: never call geolocation (emulator / indoors)
   */
  const handleClockIn = async (opts = {}) => {
    const skipGps = opts?.skipGps === true;
    setErr("");
    setMsg("");
    setLocationError("");
    setLocationStatus("");

    try {
      if (!shiftId.trim()) {
        throw new Error("Shift ID required");
      }

      let location = null;

      if (skipGps) {
        setLocationStatus("Clocking in without GPS…");
      } else {
        setLocationStatus("Requesting location…");
        try {
          location = await getCurrentLocation();
        } catch (locationErr) {
          const proceedWithoutLocation = window.confirm(
            `${locationErr.message}\n\nDo you want to clock in without location verification?`
          );
          if (!proceedWithoutLocation) {
            if (locationErr.message?.includes("timed out")) {
              setLocationError(locationErr.message);
            }
            return;
          }
          setLocationError("");
          setLocationStatus("Clocking in without GPS (after prompt)…");
        }
      }

      const deviceInfo = getDeviceInfo();
      const locationData = location
        ? {
            lat: location.lat,
            lng: location.lng,
            accuracyM: location.accuracyM,
            ...deviceInfo,
          }
        : { ...deviceInfo };

      if (!skipGps) {
        setLocationStatus((prev) =>
          prev.includes("without GPS") ? prev : "Clocking in..."
        );
      }
      const res = await clockIn(shiftId.trim(), locationData);

      setLocationStatus("");
      setLocationError("");
      setMsg(JSON.stringify(res?.data || { ok: true }));
      setCurrentLocation(null);
    } catch (e) {
      setLocationStatus("");
      setLocationError("");
      setErr(formatGuardApiError(e));

      if (e?.response?.data?.geofence) {
        const geofence = e.response.data.geofence;
        setLocationError(
          `You are ${Math.round(geofence.distance)}m away from the shift location (required: within ${geofence.radius}m)`
        );
      }
    }
  };

  const run = async (fn) => {
    setErr("");
    setMsg("");
    setLocationError("");
    setLocationStatus("");
    try {
      if (!shiftId.trim()) throw new Error("Shift ID required (for now)");
      const res = await fn(shiftId.trim());
      setMsg(JSON.stringify(res?.data || { ok: true }));
    } catch (e) {
      setErr(formatGuardApiError(e));
    }
  };

  return (
    <>
      <NavBar />
      <div className="page">
        <div className="card">
          <h2>Timeclock</h2>
          <p className="muted" style={{ fontSize: 12, marginBottom: 12, lineHeight: 1.4 }}>
            API base:{" "}
            <strong style={{ wordBreak: "break-all" }}>{getGuardApiUrl()}</strong>
            {typeof window !== "undefined" && window.Capacitor ? (
              <>
                {" "}
                — 404 on clock-in here almost always means <strong>10.0.2.2</strong> is hitting a Mac process that is{" "}
                <em>not</em> the current <code style={{ fontSize: 11 }}>admin-dashboard/backend</code> (or it’s an old build).{" "}
                Fix: <strong>Logout</strong> → Login → <strong>Use Railway backend</strong> → Save URL → Test connection → log in again.
                Or on the Mac run <code style={{ fontSize: 11 }}>{"cd backend && npm start"}</code> (port 5000) with this repo’s server.
              </>
            ) : null}
          </p>

          <div className="field">
            <label>Your shifts (from API — avoids typos)</label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 8 }}>
              <select
                value={myShifts.some((s) => s.id === shiftId) ? shiftId : ""}
                onChange={(e) => {
                  const v = e.target.value;
                  setShiftId(v);
                  setUuidEditUnlocked(false);
                }}
                disabled={shiftsLoading || myShifts.length === 0}
                style={{ flex: 1, minWidth: 200, padding: 10, borderRadius: 8 }}
              >
                <option value="">{shiftsLoading ? "Loading…" : myShifts.length ? "— Select a shift —" : "— No shifts —"}</option>
                {myShifts.map((s) => (
                  <option key={s.id} value={s.id}>
                    {formatShiftDate(s.shift_date) +
                      " · " +
                      (s.shift_start || "") +
                      "–" +
                      (s.shift_end || "") +
                      " · " +
                      String(s.location || "").slice(0, 40)}
                  </option>
                ))}
              </select>
              <button type="button" className="btn" onClick={loadMyShifts} disabled={shiftsLoading}>
                {shiftsLoading ? "…" : "Refresh"}
              </button>
            </div>
            {shiftsHint ? <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>{shiftsHint}</div> : null}
            <label>Shift ID used for Clock In / Out</label>
            {lockUuid ? (
              <div style={{ marginTop: 6 }}>
                <div
                  style={{
                    fontFamily: "ui-monospace, monospace",
                    fontSize: 12,
                    padding: "10px 12px",
                    background: "rgba(0,0,0,0.06)",
                    borderRadius: 8,
                    wordBreak: "break-all",
                  }}
                >
                  {shiftId}
                </div>
                <button
                  type="button"
                  className="btn"
                  style={{ marginTop: 8 }}
                  onClick={() => setUuidEditUnlocked(true)}
                >
                  Edit UUID manually (not recommended)
                </button>
              </div>
            ) : (
              <>
                <input
                  value={shiftId}
                  onChange={(e) => setShiftId(e.target.value)}
                  placeholder="Paste full UUID only if you have no shifts in the list"
                  style={{ marginTop: 6 }}
                />
                {idFromList ? (
                  <button type="button" className="btn" style={{ marginTop: 8 }} onClick={() => setUuidEditUnlocked(false)}>
                    Lock to list selection again
                  </button>
                ) : null}
              </>
            )}
          </div>

          <div className="row">
            <button
              className="btn btnPrimary timeClockClockIn"
              type="button"
              onClick={() => handleClockIn({ skipGps: false })}
              disabled={isGettingLocation}
            >
              {isGettingLocation ? "Getting Location..." : "Clock In"}
            </button>
            <button
              type="button"
              className="btn"
              title="Skip GPS wait — use on emulator or when indoors"
              onClick={() => handleClockIn({ skipGps: true })}
              disabled={isGettingLocation}
            >
              Clock In (no GPS)
            </button>
            <button className="btn" onClick={() => run(clockOut)}>Clock Out</button>
          </div>

          <div className="row">
            <button className="btn" onClick={() => run(breakStart)}>Lunch Break Start</button>
            <button className="btn" onClick={() => run(breakEnd)}>Lunch Break End</button>
          </div>

          {/* Location Status */}
          {locationStatus && (
            <div style={{ 
              padding: "12px", 
              marginTop: "12px", 
              background: "#e3f2fd", 
              borderRadius: "8px",
              border: "1px solid #90caf9",
              color: "#1565c0",
              fontSize: "14px"
            }}>
              📍 {locationStatus}
            </div>
          )}

          {/* Location Error */}
          {locationError && (
            <div style={{ 
              padding: "12px", 
              marginTop: "12px", 
              background: "#ffebee", 
              borderRadius: "8px",
              border: "1px solid #ef5350",
              color: "#c62828",
              fontSize: "14px"
            }}>
              ⚠️ {locationError}
            </div>
          )}

          {/* Current Location Display */}
          {currentLocation && !isGettingLocation && (
            <div style={{ 
              padding: "12px", 
              marginTop: "12px", 
              background: "#e8f5e9", 
              borderRadius: "8px",
              border: "1px solid #81c784",
              color: "#2e7d32",
              fontSize: "12px"
            }}>
              ✅ Location: {currentLocation.lat.toFixed(6)}, {currentLocation.lng.toFixed(6)} 
              <br />
              Accuracy: ±{Math.round(currentLocation.accuracyM)}m
            </div>
          )}

          {err ? <div className="error">{err}</div> : null}
          {msg ? <div className="success">{msg}</div> : null}
        </div>
      </div>
    </>
  );
}
