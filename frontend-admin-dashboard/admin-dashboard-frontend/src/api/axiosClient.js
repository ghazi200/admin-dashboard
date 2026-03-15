import axios from "axios";

/** No localhost in bundle: use env so Vercel builds use Railway. Local dev: set REACT_APP_API_URL=http://localhost:5000 */
const PRODUCTION_API = "https://admin-dashboard-production-2596.up.railway.app/api/admin";
const fromEnv = (process.env.REACT_APP_API_URL || process.env.REACT_APP_ADMIN_API_URL || "").replace(/\/+$/, "");
const baseURL = fromEnv ? (fromEnv.includes("/api") ? fromEnv : fromEnv + "/api/admin") : PRODUCTION_API;

const axiosClient = axios.create({
  baseURL,
  timeout: 30000,
  headers: { "Content-Type": "application/json" },
  withCredentials: true,
});

/** Never use localhost when app is on production host (guards against bad Vercel env). */
function isProductionHost() {
  if (typeof window === "undefined" || !window.location?.hostname) return false;
  const h = window.location.hostname.toLowerCase();
  return h !== "localhost" && h !== "127.0.0.1";
}

axiosClient.interceptors.request.use(
  (config) => {
    if (isProductionHost() && config.baseURL && /localhost|127\.0\.0\.1/.test(config.baseURL)) {
      config.baseURL = PRODUCTION_API;
    }
    const token = localStorage.getItem("adminToken");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    } else {
      delete config.headers.Authorization;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

/** 401 → clear token and redirect to login, except when on Reports/Inspections so the page never "disappears". */
axiosClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (axios.isCancel(error)) {
      return Promise.reject(error);
    }

    const status = error?.response?.status;

    if (status === 401) {
      const pathname = (typeof window !== "undefined" && window.location?.pathname)
        ? window.location.pathname.toLowerCase()
        : "";

      const isReportPage = pathname.includes("/reports");
      const isInspectionsPage = pathname.includes("/inspections");
      const isLoginPage = pathname.includes("/login");

      if (isReportPage || isInspectionsPage || isLoginPage) {
        return Promise.reject(error);
      }

      const msg = String(error?.response?.data?.message || error?.message || "").toLowerCase();
      const isAuthError =
        msg.includes("invalid signature") ||
        msg.includes("jwt expired") ||
        msg.includes("invalid token") ||
        msg.includes("session invalidated") ||
        msg.includes("unauthorized") ||
        msg.includes("not authenticated");

      if (isAuthError) {
        localStorage.removeItem("adminToken");
        localStorage.removeItem("adminInfo");
        localStorage.removeItem("adminUser");
        localStorage.removeItem("refreshToken");

        if (!window.location.pathname.includes("/login")) {
          window.location.href = "/login";
        }
      }
    }

    return Promise.reject(error);
  }
);

export default axiosClient;
