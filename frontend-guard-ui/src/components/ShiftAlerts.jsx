/**
 * Shift Alerts Component
 * 
 * Displays weather, traffic, and transit alerts for shifts
 */

import React, { useEffect, useState } from "react";
import { getCombinedAlert } from "../services/guardApi";
import "./ShiftAlerts.css";

export default function ShiftAlerts({ shiftId, shift, origin = null }) {
  const [alerts, setAlerts] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [manualOrigin, setManualOrigin] = useState("");
  const [showManualInput, setShowManualInput] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [errorDismissed, setErrorDismissed] = useState(false);

  useEffect(() => {
    setErrorDismissed(false);
  }, [shiftId]);

  useEffect(() => {
    if (!shiftId) return;

    const loadAlerts = async () => {
      try {
        setLoading(true);
        setError(null);

        // Try to get origin from browser geolocation if not provided
        let finalOrigin = origin;
        if (!finalOrigin && navigator.geolocation) {
          console.log("📍 Requesting geolocation for traffic/transit alerts...");
          navigator.geolocation.getCurrentPosition(
            (position) => {
              finalOrigin = `${position.coords.latitude},${position.coords.longitude}`;
              console.log("✅ Geolocation obtained:", finalOrigin);
              fetchAlerts(finalOrigin);
            },
            (error) => {
              // Geolocation failed - log the error
              console.warn("⚠️ Geolocation failed:", error.message);
              console.warn("   Traffic and transit alerts require location permission");
              console.warn("   Weather alerts will still work");
              // Show manual input option
              setShowManualInput(true);
              // Try without origin (weather only)
              fetchAlerts(null);
            },
            {
              timeout: 10000, // 10 second timeout
              enableHighAccuracy: false, // Faster, less accurate is fine
            }
          );
        } else {
          fetchAlerts(finalOrigin);
        }
      } catch (err) {
        console.error("Failed to load alerts:", err);
        setError(err.message);
        setLoading(false);
      }
    };

    const fetchAlerts = async (originLocation) => {
      try {
        console.log(`🌐 Fetching alerts for shift ${shiftId}, origin: ${originLocation || 'none'}`);
        const response = await getCombinedAlert(shiftId, {
          origin: originLocation,
          includeTransit: true,
        });
        console.log("✅ Alerts received:", response.data);
        setAlerts(response.data);
      } catch (err) {
        console.error("❌ Failed to fetch alerts:", err);
        console.error("   Response:", err.response?.data);
        const isNetworkError = !err.response || err.message === "Network Error";
        const message = isNetworkError
          ? "Cannot reach Guard API. Ensure the guard backend is running (port 4000) and try again."
          : (err.response?.data?.message || err.message);
        setError(message);
      } finally {
        setLoading(false);
      }
    };

    loadAlerts();
  }, [shiftId, origin, retryCount]);

  if (loading) {
    return (
      <div className="shift-alerts">
        <div className="alerts-loading">Loading alerts...</div>
      </div>
    );
  }

  if (error && !errorDismissed) {
    return (
      <div className="shift-alerts" style={{ marginTop: 8 }}>
        <div className="alerts-error" style={{ padding: "8px 10px", fontSize: 12, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
          <span>Alerts unavailable. Start guard backend (port 4000) if needed.</span>
          <span style={{ display: "flex", gap: 6 }}>
            <button
              type="button"
              className="alerts-retry"
              onClick={() => {
                setError(null);
                setErrorDismissed(false);
                setLoading(true);
                setRetryCount((c) => c + 1);
              }}
              style={{
                padding: "4px 10px",
                fontSize: 12,
                cursor: "pointer",
                background: "rgba(255,255,255,0.1)",
                border: "1px solid rgba(255,255,255,0.3)",
                borderRadius: 6,
                color: "inherit",
              }}
            >
              Retry
            </button>
            <button
              type="button"
              onClick={() => setErrorDismissed(true)}
              style={{
                padding: "4px 10px",
                fontSize: 12,
                cursor: "pointer",
                background: "transparent",
                border: "1px solid rgba(255,255,255,0.2)",
                borderRadius: 6,
                color: "inherit",
                opacity: 0.8,
              }}
            >
              Dismiss
            </button>
          </span>
        </div>
      </div>
    );
  }
  if (error && errorDismissed) {
    return null;
  }

  if (!alerts) {
    return null;
  }

  // Check if traffic/transit are missing due to no origin
  const hasTraffic = alerts && alerts.traffic && alerts.traffic.normalTime;
  const hasTransit = alerts && alerts.transit && alerts.transit.options && alerts.transit.options.length > 0;
  // Show location input if: no origin, no manual origin set, no traffic/transit data, AND (weather exists OR manual input was triggered)
  const needsLocation = alerts && !origin && !manualOrigin && !hasTraffic && !hasTransit && (alerts.weather || showManualInput);

  // Handle manual origin input
  const handleManualOriginSubmit = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (manualOrigin.trim()) {
      console.log("📍 Using manual origin:", manualOrigin);
      setLoading(true);
      setError(null);
      try {
        const response = await getCombinedAlert(shiftId, {
          origin: manualOrigin.trim(),
          includeTransit: true,
        });
        console.log("✅ Alerts received with manual origin:", response.data);
        setAlerts(response.data);
        // Don't close the input - keep it open in case user wants to change
      } catch (err) {
        console.error("❌ Failed to fetch alerts with manual origin:", err);
        setError(err.response?.data?.message || err.message);
      } finally {
        setLoading(false);
      }
    }
  };

  const getAlertIcon = (level) => {
    switch (level) {
      case "CRITICAL":
        return "🔴";
      case "WARNING":
        return "🟡";
      default:
        return "ℹ️";
    }
  };

  const getAlertColor = (level) => {
    switch (level) {
      case "CRITICAL":
        return "#ef4444";
      case "WARNING":
        return "#f59e0b";
      default:
        return "#3b82f6";
    }
  };

  return (
    <div className="shift-alerts">
      {/* Location Input (Manual or Permission) */}
      {(needsLocation || showManualInput) && (
        <div 
          className="alert-card" 
          style={{ 
            background: "rgba(59, 130, 246, 0.1)", 
            border: "1px solid rgba(59, 130, 246, 0.3)",
            marginBottom: 12,
            padding: 12,
            borderRadius: 8
          }}
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {showManualInput ? (
            <form onSubmit={handleManualOriginSubmit} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ fontSize: 12, opacity: 0.9, marginBottom: 4 }}>
                📍 <strong>Enter your location</strong> for traffic & transit alerts
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  type="text"
                  value={manualOrigin}
                  onChange={(e) => setManualOrigin(e.target.value)}
                  placeholder="e.g., New York, NY or 10001 or address"
                  style={{
                    flex: 1,
                    padding: "6px 10px",
                    borderRadius: 6,
                    border: "1px solid rgba(148, 163, 184, 0.3)",
                    background: "rgba(15, 23, 42, 0.5)",
                    color: "#fff",
                    fontSize: 12,
                  }}
                />
                <button
                  type="submit"
                  disabled={!manualOrigin.trim() || loading}
                  style={{
                    padding: "6px 12px",
                    borderRadius: 6,
                    border: "none",
                    background: manualOrigin.trim() ? "#3b82f6" : "rgba(59, 130, 246, 0.3)",
                    color: "#fff",
                    fontSize: 12,
                    cursor: manualOrigin.trim() ? "pointer" : "not-allowed",
                  }}
                >
                  Get Routes
                </button>
              </div>
              <div style={{ fontSize: 11, opacity: 0.7 }}>
                Or <button
                  type="button"
                  onClick={() => {
                    setShowManualInput(false);
                    if (navigator.geolocation) {
                      navigator.geolocation.getCurrentPosition(
                        (pos) => {
                          const coords = `${pos.coords.latitude},${pos.coords.longitude}`;
                          setLoading(true);
                          setError(null);
                          getCombinedAlert(shiftId, {
                            origin: coords,
                            includeTransit: true,
                          }).then((response) => {
                            setAlerts(response.data);
                            setLoading(false);
                          }).catch((err) => {
                            setError(err.response?.data?.message || err.message);
                            setLoading(false);
                          });
                        },
                        (err) => {
                          console.warn("Geolocation still denied:", err);
                          setShowManualInput(true);
                        }
                      );
                    }
                  }}
                  style={{
                    background: "none",
                    border: "none",
                    color: "#3b82f6",
                    textDecoration: "underline",
                    cursor: "pointer",
                    fontSize: 11,
                    padding: 0,
                  }}
                >
                  try location permission again
                </button>
              </div>
            </form>
          ) : (
            <div style={{ fontSize: 12, opacity: 0.9 }}>
              📍 <strong>Location access needed</strong> for traffic & transit alerts
              <br />
              <div style={{ marginTop: 8, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (navigator.geolocation) {
                      setLoading(true);
                      setError(null);
                      navigator.geolocation.getCurrentPosition(
                        (pos) => {
                          const coords = `${pos.coords.latitude},${pos.coords.longitude}`;
                          console.log("✅ Geolocation obtained:", coords);
                          getCombinedAlert(shiftId, {
                            origin: coords,
                            includeTransit: true,
                          }).then((response) => {
                            setAlerts(response.data);
                            setLoading(false);
                          }).catch((err) => {
                            setError(err.response?.data?.message || err.message);
                            setLoading(false);
                          });
                        },
                        (err) => {
                          console.warn("❌ Geolocation denied:", err);
                          setError(`Location permission denied: ${err.message}. Please enter address manually.`);
                          setShowManualInput(true);
                          setLoading(false);
                        },
                        {
                          timeout: 10000,
                          enableHighAccuracy: false,
                        }
                      );
                    } else {
                      setError("Geolocation not supported in this browser. Please enter address manually.");
                      setShowManualInput(true);
                    }
                  }}
                  disabled={loading}
                  style={{
                    padding: "6px 12px",
                    borderRadius: 6,
                    border: "1px solid rgba(59, 130, 246, 0.5)",
                    background: loading ? "rgba(59, 130, 246, 0.3)" : "rgba(59, 130, 246, 0.2)",
                    color: "#3b82f6",
                    fontSize: 11,
                    cursor: loading ? "not-allowed" : "pointer",
                  }}
                >
                  {loading ? "Requesting..." : "Request Location Access"}
                </button>
                <span style={{ fontSize: 11, opacity: 0.7 }}>
                  or <button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setShowManualInput(true);
                    }}
                    style={{
                      background: "none",
                      border: "none",
                      color: "#3b82f6",
                      textDecoration: "underline",
                      cursor: "pointer",
                      fontSize: 11,
                      padding: 0,
                    }}
                  >
                    enter address manually
                  </button>
                </span>
              {error && (
                <div style={{ fontSize: 11, color: "#ef4444", opacity: 0.9, marginTop: 4 }}>
                  ⚠️ {error}
                </div>
              )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Overall Alert Banner */}
      {alerts.overallAlertLevel !== "INFO" && (
        <div
          className="alert-banner"
          style={{
            borderLeftColor: getAlertColor(alerts.overallAlertLevel),
          }}
        >
          <div className="alert-banner-icon">
            {getAlertIcon(alerts.overallAlertLevel)}
          </div>
          <div className="alert-banner-content">
            <div className="alert-banner-title">Travel Alert</div>
            <div className="alert-banner-message">
              {alerts.overallRecommendation}
            </div>
            {alerts.leaveEarlyMinutes > 0 && (
              <div className="alert-banner-time">
                Leave {alerts.leaveEarlyMinutes} minutes earlier
              </div>
            )}
          </div>
        </div>
      )}

      {/* Weather Alert */}
      {alerts.weather && (
        <div className="alert-card weather-alert">
          <div className="alert-card-header">
            <span className="alert-icon">🌤️</span>
            <span className="alert-title">Weather</span>
            {alerts.weather.alertLevel !== "INFO" && (
              <span
                className="alert-badge"
                style={{ backgroundColor: getAlertColor(alerts.weather.alertLevel) }}
              >
                {alerts.weather.alertLevel}
              </span>
            )}
          </div>
          <div className="alert-card-body">
            <div className="weather-condition">
              {alerts.weather.description} • {alerts.weather.temperature}°F
            </div>
            {alerts.weather.warnings.length > 0 && (
              <div className="weather-warnings">
                {alerts.weather.warnings.map((warning, idx) => (
                  <div key={idx} className="warning-item">
                    ⚠️ {warning}
                  </div>
                ))}
              </div>
            )}
            {alerts.weather.recommendation && (
              <div className="weather-recommendation">
                💡 {alerts.weather.recommendation}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Traffic Alert */}
      {alerts.traffic && (
        <div className="alert-card traffic-alert">
          <div className="alert-card-header">
            <span className="alert-icon">🚗</span>
            <span className="alert-title">Driving Route</span>
            {alerts.traffic.alertLevel !== "INFO" && (
              <span
                className="alert-badge"
                style={{ backgroundColor: getAlertColor(alerts.traffic.alertLevel) }}
              >
                {alerts.traffic.alertLevel}
              </span>
            )}
          </div>
          <div className="alert-card-body">
            <div className="route-time">
              <span className="time-label">Normal:</span>
              <span className="time-value">{alerts.traffic.normalTime} min</span>
            </div>
            <div className="route-time">
              <span className="time-label">With Traffic:</span>
              <span className="time-value">{alerts.traffic.currentTime} min</span>
              {alerts.traffic.delay > 0 && (
                <span className="delay-badge">+{alerts.traffic.delay} min delay</span>
              )}
            </div>
            {alerts.traffic.issues.length > 0 && (
              <div className="traffic-issues">
                {alerts.traffic.issues.map((issue, idx) => (
                  <div key={idx} className="issue-item">
                    ⚠️ {issue}
                  </div>
                ))}
              </div>
            )}
            {alerts.traffic.recommendation && (
              <div className="traffic-recommendation">
                💡 {alerts.traffic.recommendation}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Transit Options */}
      {alerts.transit && alerts.transit.options.length > 0 && (
        <div className="alert-card transit-alert">
          <div className="alert-card-header">
            <span className="alert-icon">🚌</span>
            <span className="alert-title">Public Transit</span>
          </div>
          <div className="alert-card-body">
            {alerts.transit.options.slice(0, 3).map((option, idx) => (
              <div
                key={idx}
                className={`transit-option ${option === alerts.transit.bestOption ? "best-option" : ""}`}
              >
                <div className="transit-header">
                  <span className="transit-mode-icon">
                    {option.mode === "bus" ? "🚌" : "🚇"}
                  </span>
                  <span className="transit-route">{option.routeName}</span>
                  {option === alerts.transit.bestOption && (
                    <span className="best-badge">⭐ Best</span>
                  )}
                </div>
                <div className="transit-details">
                  <div className="transit-time">
                    {option.totalTime} min total
                    {option.walkingTime > 0 && (
                      <span className="transit-walk"> ({option.walkingTime} min walk)</span>
                    )}
                  </div>
                  {option.transfers > 0 && (
                    <div className="transit-transfers">
                      {option.transfers} transfer{option.transfers > 1 ? "s" : ""}
                    </div>
                  )}
                  {option.delays > 0 && (
                    <div className="transit-delay">
                      ⚠️ {option.delays} min delay
                    </div>
                  )}
                  {option.status === "on-time" && (
                    <div className="transit-status">✅ On-time</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Comparison */}
      {alerts.comparison && alerts.comparison.available && (
        <div className="alert-card comparison-alert">
          <div className="alert-card-header">
            <span className="alert-icon">📊</span>
            <span className="alert-title">Best Option</span>
          </div>
          <div className="alert-card-body">
            <div className="comparison-result">
              <div className="best-mode">
                {alerts.comparison.bestMode === "transit" ? "🚌" : "🚗"}{" "}
                {alerts.comparison.bestMode === "transit" ? "Public Transit" : "Driving"}
              </div>
              <div className="comparison-reason">{alerts.comparison.reason}</div>
              <div className="comparison-recommendation">
                💡 {alerts.comparison.recommendation}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
