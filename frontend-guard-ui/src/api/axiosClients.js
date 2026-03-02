import axios from "axios";
import { getGuardApiUrl, getAdminApiUrl } from "../config/apiUrls";

/**
 * Guard backend (abe-guard-ai). baseURL is set per-request so runtime
 * localStorage override (guardApiUrl) is used – no rebuild needed on phone.
 */
export const guardClient = axios.create({
  timeout: 20000, // 20s for mobile/slow networks
});

/**
 * Use current Guard API URL on every request and attach token.
 */
guardClient.interceptors.request.use((config) => {
  config.baseURL = getGuardApiUrl();
  const token = localStorage.getItem("guardToken");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  } else if (!config.url?.includes("/auth/login")) {
    console.warn("⚠️ No guardToken for request to:", config.url);
  }
  return config;
});

/**
 * Handle token expiration and redirect to login
 */
guardClient.interceptors.response.use(
  (res) => res,
  (error) => {
    const status = error?.response?.status;

    if (status === 401) {
      const msg = String(error?.response?.data?.message || "");
      const looksLikeBadToken =
        msg.toLowerCase().includes("jwt expired") ||
        msg.toLowerCase().includes("invalid token") ||
        msg.toLowerCase().includes("invalid signature") ||
        msg.toLowerCase().includes("expired token");

      if (looksLikeBadToken) {
        // Clear expired token
        localStorage.removeItem("guardToken");
        localStorage.removeItem("guardUser");
        localStorage.removeItem("guardDevToken");

        // Redirect to login if not already there
        if (!window.location.pathname.includes("/login")) {
          window.location.href = "/login";
        }
      }
    }

    return Promise.reject(error);
  }
);

/**
 * Messaging API client – admin-dashboard backend (same DB; guard messages live here).
 * In dev (npm start): relative /api/guard so setupProxy.js proxies to 5000.
 * In production/Capacitor/Android: full Admin API URL so requests reach the server.
 */
function getMessagesBaseUrl() {
  if (typeof window !== "undefined" && window.Capacitor) {
    return `${getAdminApiUrl()}/api/guard`;
  }
  if (typeof process !== "undefined" && process.env?.NODE_ENV === "development") {
    return "/api/guard";
  }
  return `${getAdminApiUrl()}/api/guard`;
}

export const messagesClient = axios.create({
  baseURL: "/api/guard",
  headers: {
    "Content-Type": "application/json",
  },
  withCredentials: true,
});

messagesClient.interceptors.request.use((config) => {
  config.baseURL = getMessagesBaseUrl();
  const token = localStorage.getItem("guardToken") || localStorage.getItem("token") || "";
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

messagesClient.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error?.response?.status === 401) {
      const msg = String(error?.response?.data?.message || "");
      if (/jwt expired|invalid token|invalid signature/i.test(msg)) {
        localStorage.removeItem("guardToken");
        localStorage.removeItem("guardUser");
        if (!window.location.pathname.includes("/login")) {
          window.location.href = "/login";
        }
      }
    }
    return Promise.reject(error);
  }
);
