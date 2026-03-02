import React, { useState } from "react";
import NavBar from "../components/NavBar";
import { clockIn, clockOut, breakStart, breakEnd } from "../services/guardApi";

export default function TimeClock() {
  const [shiftId, setShiftId] = useState("");
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

      const options = {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0, // Don't use cached location
      };

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
              errorMessage = "Location request timed out. Please try again.";
              break;
            default:
              errorMessage = "An unknown error occurred while getting location.";
              break;
          }
          setLocationError(errorMessage);
          setLocationStatus("");
          reject(new Error(errorMessage));
        },
        options
      );
    });
  };

  const handleClockIn = async () => {
    setErr("");
    setMsg("");
    setLocationError("");
    setLocationStatus("");

    try {
      if (!shiftId.trim()) {
        throw new Error("Shift ID required");
      }

      // Get location before clocking in
      setLocationStatus("Requesting location permission...");
      let location = null;

      try {
        location = await getCurrentLocation();
      } catch (locationErr) {
        // Ask user if they want to proceed without location
        const proceedWithoutLocation = window.confirm(
          `${locationErr.message}\n\nDo you want to clock in without location verification?`
        );
        if (!proceedWithoutLocation) {
          return;
        }
      }

      // Get device information
      const deviceInfo = getDeviceInfo();

      // Prepare location data (may be null if user chose to proceed without location)
      const locationData = location
        ? {
            lat: location.lat,
            lng: location.lng,
            accuracyM: location.accuracyM,
            ...deviceInfo,
          }
        : {
            ...deviceInfo,
          };

      setLocationStatus("Clocking in...");
      const res = await clockIn(shiftId.trim(), locationData);

      setLocationStatus("");
      setMsg(JSON.stringify(res?.data || { ok: true }));
      setCurrentLocation(null);
    } catch (e) {
      setLocationStatus("");
      const errorMessage = e?.response?.data?.message || e.message || "Request failed";
      setErr(errorMessage);

      // Check if it's a geofencing error
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
      setErr(e?.response?.data?.message || e.message || "Request failed");
    }
  };

  return (
    <>
      <NavBar />
      <div className="page">
        <div className="card">
          <h2>Timeclock</h2>

          <div className="field">
            <label>Shift ID (temporary)</label>
            <input value={shiftId} onChange={(e) => setShiftId(e.target.value)} placeholder="Paste shift UUID" />
          </div>

          <div className="row">
            <button 
              className="btnPrimary" 
              onClick={handleClockIn}
              disabled={isGettingLocation}
            >
              {isGettingLocation ? "Getting Location..." : "Clock In"}
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
