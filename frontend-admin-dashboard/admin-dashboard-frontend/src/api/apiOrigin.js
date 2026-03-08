/**
 * Single source of truth for backend origins.
 * - getBackendOrigin: admin-dashboard backend (port 5000 / Railway). Used by axiosClient, superAdmin, guardMessaging.
 * - getGuardAiOrigin: abe-guard-ai backend (port 4000). Used for asset links in Inspections, Payroll, Incidents.
 */
const DEFAULT_PRODUCTION_ORIGIN = "https://admin-dashboard-production-2596.up.railway.app";
const STORAGE_KEY = "adminApiUrl";

export function getBackendOrigin() {
  if (typeof window !== "undefined") {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored && stored.trim()) {
        const base = stored.trim().replace(/[\/?]+$/, "");
        return base.endsWith("/api/admin") ? base.replace(/\/api\/admin\/?$/, "") : base;
      }
    } catch (_) {}
  }
  const hostname = typeof window !== "undefined" && window.location?.hostname;
  // Local dev only: use localhost backend
  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return "http://localhost:5000";
  }
  // Any other host (Vercel, custom domain, etc.): use same-origin so /api/* goes through proxy or same host. Never use localhost.
  if (hostname) {
    return "";
  }
  if (typeof process !== "undefined" && process.env && process.env.REACT_APP_API_URL) {
    return process.env.REACT_APP_API_URL.replace(/[\/?]+$/, "");
  }
  return "";
}

/** abe-guard-ai backend origin for asset URLs (uploads, inspections, pay stubs). Set REACT_APP_GUARD_AI_URL in production. */
export function getGuardAiOrigin() {
  if (typeof process !== "undefined" && process.env?.REACT_APP_GUARD_AI_URL) {
    return String(process.env.REACT_APP_GUARD_AI_URL).replace(/[\/?]+$/, "");
  }
  if (typeof window !== "undefined" && (window.location?.hostname === "localhost" || window.location?.hostname === "127.0.0.1")) {
    return "http://localhost:4000";
  }
  return "";
}
