/**
 * Backend origin for admin API. No localhost in bundle — use env vars so production uses Railway.
 * Local dev: set REACT_APP_API_URL=http://localhost:5000 and REACT_APP_GUARD_AI_URL=http://localhost:4000
 */
const RAILWAY_ORIGIN = "https://admin-dashboard-production-2596.up.railway.app";

export function getBackendOrigin() {
  if (typeof window === "undefined") return RAILWAY_ORIGIN;
  const envUrl = (process.env.REACT_APP_API_URL || process.env.REACT_APP_ADMIN_API_URL || "").replace(/\/+$/, "");
  return envUrl || RAILWAY_ORIGIN;
}

/** abe-guard-ai origin (Inspections, Payroll, Incidents). Set REACT_APP_GUARD_AI_URL in production and locally. */
export function getGuardAiOrigin() {
  const url = (process.env.REACT_APP_GUARD_AI_URL || "").replace(/\/+$/, "");
  return url;
}
