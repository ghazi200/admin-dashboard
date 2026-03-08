import axios from "axios";
import { getBackendOrigin } from "./apiOrigin";

/**
 * Admin API client.
 * Uses apiOrigin.getBackendOrigin() (localStorage, REACT_APP_API_URL, or production Railway URL).
 */
const backendOrigin = getBackendOrigin();
const baseURL = backendOrigin ? `${backendOrigin}/api/admin` : "/api/admin";

// Avoid browser/default timeouts; 30s so slow DB or cold start can still respond
const REQUEST_TIMEOUT_MS = 30000;

const axiosClient = axios.create({
  baseURL,
  timeout: REQUEST_TIMEOUT_MS,
  headers: {
    "Content-Type": "application/json",
  },
  withCredentials: true,
});

/**
 * Always use path /api/admin/... and, when using backend origin, full URL (axios can drop base path for /path).
 */
axiosClient.interceptors.request.use(
  (config) => {
    if (!config.url || typeof config.url !== "string") return config;
    const path = config.url.startsWith("/") ? config.url : `/${config.url}`;
    const apiPath = path.startsWith("/api/admin") ? path : `/api/admin${path === "/" ? "" : path}`;
    const origin = getBackendOrigin();
    if (origin) {
      config.url = `${origin}${apiPath}`;
      config.baseURL = "";
    } else {
      config.url = apiPath;
      config.baseURL = "";
    }
    return config;
  },
  (error) => Promise.reject(error)
);

/**
 * Always attach latest admin token
 */
axiosClient.interceptors.request.use(
  (config) => {
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

/**
 * Global auth handling and timeout/network hints
 */
axiosClient.interceptors.response.use(
  (res) => res,
  (error) => {
    const isTimeout = error?.code === "ECONNABORTED" || /timeout/i.test(String(error?.message || ""));
    const isNetwork = error?.message === "Network Error" || !error?.response;
    if (isTimeout || isNetwork) {
      console.warn(
        "[ADMIN axios] Request failed (backend may be down or slow):",
        error?.config?.url,
        isTimeout ? "timeout" : "network error. Is the server running on http://localhost:5000?"
      );
    }

    const status = error?.response?.status;

    if (status === 401) {
      console.warn("401 from Admin API:", error?.config?.url);

      const msg = String(error?.response?.data?.message || "");
      const looksLikeBadToken =
        msg.toLowerCase().includes("invalid signature") ||
        msg.toLowerCase().includes("jwt expired") ||
        msg.toLowerCase().includes("invalid token") ||
        msg.toLowerCase().includes("session invalidated");

      if (looksLikeBadToken) {
        localStorage.removeItem("adminToken");
        localStorage.removeItem("adminInfo");
        localStorage.removeItem("adminUser");

        if (!window.location.pathname.includes("/login")) {
          window.location.href = "/login";
        }
      }
    }

    return Promise.reject(error);
  }
);

export default axiosClient;
