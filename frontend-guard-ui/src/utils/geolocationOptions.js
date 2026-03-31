/**
 * Defaults tuned for WebView / Android emulator / indoor use.
 * High accuracy + short timeout causes frequent TIMEOUT; network/cached fixes are OK for punch.
 */
export const GEO_GET_CURRENT_RELAXED = {
  enableHighAccuracy: false,
  timeout: 30000,
  maximumAge: 300000,
};
