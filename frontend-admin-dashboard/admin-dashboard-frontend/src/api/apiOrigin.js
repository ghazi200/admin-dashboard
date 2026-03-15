/**
 * Backend origin for admin API. No localhost in bundle — use env vars so production uses Railway.
 * Local dev: set REACT_APP_API_URL=http://localhost:5000 and REACT_APP_GUARD_AI_URL=http://localhost:4000
 */
const RAILWAY_ORIGIN = "https://admin-dashboard-production-2596.up.railway.app";

function isProductionHost() {
  if (typeof window === "undefined" || !window.location?.hostname) return false;
  const h = window.location.hostname.toLowerCase();
  return h !== "localhost" && h !== "127.0.0.1";
}

export function getBackendOrigin() {
  if (typeof window === "undefined") return RAILWAY_ORIGIN;
  const envUrl = (process.env.REACT_APP_API_URL || process.env.REACT_APP_ADMIN_API_URL || "").replace(/\/+$/, "");
  const url = envUrl || RAILWAY_ORIGIN;
  if (isProductionHost() && /localhost|127\.0\.0\.1/.test(url)) return RAILWAY_ORIGIN;
  return url;
}

/** abe-guard-ai origin (Inspections, Payroll, Incidents). Set REACT_APP_GUARD_AI_URL in production and locally. */
export function getGuardAiOrigin() {
  const url = (process.env.REACT_APP_GUARD_AI_URL || "").replace(/\/+$/, "");
  if (isProductionHost() && url && /localhost|127\.0\.0\.1/.test(url)) return "";
  return url;
}
