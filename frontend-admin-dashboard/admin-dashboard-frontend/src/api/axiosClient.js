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

/** Attach admin token */
axiosClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("adminToken");
    if (token) config.headers.Authorization = `Bearer ${token}`;
    else delete config.headers.Authorization;
    return config;
  },
  (e) => Promise.reject(e)
);

/** 401 → clear token and redirect to login, except for non-critical requests so the page doesn't "go away" (e.g. Reports). */
axiosClient.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error?.response?.status === 401) {
      const msg = String(error?.response?.data?.message || "");
      const url = (error?.config?.url || error?.config?.baseURL || "").toLowerCase();
      const isNonCritical =
        /\/reports\//.test(url) ||
        /reports\/runs/.test(url) ||
        /reports\/templates/.test(url) ||
        /notifications/.test(url) ||
        /geographic/.test(url) ||
        /scheduled-reports/.test(url);
      if (/invalid signature|jwt expired|invalid token|session invalidated/i.test(msg)) {
        if (!isNonCritical) {
          localStorage.removeItem("adminToken");
          localStorage.removeItem("adminInfo");
          localStorage.removeItem("adminUser");
          if (!window.location.pathname.includes("/login")) window.location.href = "/login";
        }
      }
    }
    return Promise.reject(error);
  }
);

export default axiosClient;
