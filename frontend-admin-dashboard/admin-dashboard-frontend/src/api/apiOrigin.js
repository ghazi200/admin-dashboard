/**
 * Backend origin for admin API. Used by superAdmin, guardMessaging.
 * Production (non-localhost) uses Railway so login and API work without Vercel env.
 */
const RAILWAY_ORIGIN = "https://admin-dashboard-production-2596.up.railway.app";

export function getBackendOrigin() {
  if (typeof window === "undefined") return "";
  const host = window.location?.hostname;
  const isLocal = host === "localhost" || host === "127.0.0.1";
  const envUrl = process.env.REACT_APP_API_URL && String(process.env.REACT_APP_API_URL).replace(/\/+$/, "");
  if (envUrl && (isLocal || !/localhost|127\.0\.0\.1/.test(envUrl))) return envUrl;
  if (isLocal) return "http://localhost:5000";
  if (host) return RAILWAY_ORIGIN;
  return "";
}

/** abe-guard-ai origin for asset URLs (Inspections, Payroll, Incidents). Set REACT_APP_GUARD_AI_URL in production. */
export function getGuardAiOrigin() {
  if (typeof process !== "undefined" && process.env?.REACT_APP_GUARD_AI_URL) {
    return String(process.env.REACT_APP_GUARD_AI_URL).replace(/\/+$/, "");
  }
  if (typeof window !== "undefined" && (window.location?.hostname === "localhost" || window.location?.hostname === "127.0.0.1")) {
    return "http://localhost:4000";
  }
  return "";
}
