import { useEffect, useRef, useCallback } from "react";

const STORAGE_KEYS = ["adminToken", "adminUser", "adminInfo"];
const MIN_MINUTES = 15;
const MAX_MINUTES = 60;
const CHECK_INTERVAL_MS = 60 * 1000; // check every minute

function getTimeoutMinutes() {
  const env = typeof process !== "undefined" && process.env && process.env.REACT_APP_SESSION_TIMEOUT_MINUTES;
  const n = parseInt(env, 10);
  if (!Number.isFinite(n)) return 30;
  return Math.min(MAX_MINUTES, Math.max(MIN_MINUTES, n));
}

export function clearSession() {
  STORAGE_KEYS.forEach((key) => localStorage.removeItem(key));
  window.location.href = "/login";
}

/**
 * Session timeout after inactivity (15–60 minutes configurable).
 * Call this inside the authenticated layout (e.g. Layout). When there's no
 * activity for the configured period, clears admin session and redirects to /login.
 * @param {Object} options - { enabled: boolean, timeoutMinutes: number (15-60), timeoutMs?: number, checkIntervalMs?: number (test only) }
 */
export function useSessionTimeout(options = {}) {
  const { enabled = true, timeoutMinutes: optionMinutes, timeoutMs: optionTimeoutMs, checkIntervalMs: optionCheckIntervalMs } = options;
  const timeoutMinutes = optionMinutes != null
    ? Math.min(MAX_MINUTES, Math.max(MIN_MINUTES, optionMinutes))
    : getTimeoutMinutes();
  const timeoutMs = optionTimeoutMs != null ? optionTimeoutMs : timeoutMinutes * 60 * 1000;
  const checkIntervalMs = optionCheckIntervalMs != null ? optionCheckIntervalMs : CHECK_INTERVAL_MS;
  const lastActivityRef = useRef(Date.now());

  const onActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
  }, []);

  useEffect(() => {
    if (!enabled) return;

    const events = ["mousedown", "mousemove", "keydown", "scroll", "touchstart", "click"];

    events.forEach((ev) => window.addEventListener(ev, onActivity));

    const interval = setInterval(() => {
      const token = localStorage.getItem("adminToken");
      if (!token) return;
      const elapsed = Date.now() - lastActivityRef.current;
      if (elapsed >= timeoutMs) {
        clearInterval(interval);
        clearSession();
      }
    }, checkIntervalMs);

    return () => {
      events.forEach((ev) => window.removeEventListener(ev, onActivity));
      clearInterval(interval);
    };
  }, [enabled, timeoutMinutes, timeoutMs, checkIntervalMs, onActivity]);
}
