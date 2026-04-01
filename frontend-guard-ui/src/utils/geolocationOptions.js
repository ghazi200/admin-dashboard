/**
 * Defaults tuned for WebView / Android emulator / indoor use.
 * High accuracy + short timeout causes frequent TIMEOUT; network/cached fixes are OK for punch.
 */
export const GEO_GET_CURRENT_RELAXED = {
  enableHighAccuracy: false,
  /** Shorter wait on emulators/indoors — user can use “Clock in (no GPS)” or confirm without location */
  timeout: 15000,
  maximumAge: 300000,
};
