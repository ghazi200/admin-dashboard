// src/api/abeGuardAiClient.js
import axios from "axios";
import { getGuardAiOrigin } from "./apiOrigin";

/**
 * Client for abe-guard-ai backend. URL from getGuardAiOrigin() (env or localhost:4000 only when host is local).
 * Production: never localhost; set REACT_APP_GUARD_AI_URL.
 */
const abeGuardAiClient = axios.create({
  baseURL: "",
  headers: { "Content-Type": "application/json" },
  withCredentials: true,
  timeout: 30000,
});

abeGuardAiClient.interceptors.request.use((config) => {
  const origin = getGuardAiOrigin();
  if (origin && config.url) {
    const path = config.url.startsWith("/") ? config.url : `/${config.url}`;
    config.url = `${origin.replace(/\/+$/, "")}${path}`;
    config.baseURL = "";
  }
  return config;
});

abeGuardAiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem("adminToken");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  } else {
    delete config.headers.Authorization;
  }
  return config;
});

abeGuardAiClient.interceptors.response.use(
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

      const onReportsOrInspections = pathname.includes("/reports") || pathname.includes("/inspections");

      if (onReportsOrInspections) {
        return Promise.reject(error);
      }

      const msg = String(error?.response?.data?.message || error?.message || "").toLowerCase();
      const looksLikeBadToken =
        msg.includes("invalid signature") ||
        msg.includes("jwt expired") ||
        msg.includes("invalid token") ||
        msg.includes("expired") ||
        msg.includes("unauthorized");

      if (looksLikeBadToken) {
        localStorage.removeItem("adminToken");
        localStorage.removeItem("adminInfo");
        localStorage.removeItem("adminUser");

        if (!window.location.pathname.includes("/login")) {
          window.location.href = "/login";
        }
      }
    }

    if (status === 400) {
      console.error("[abeGuardAiClient] 400 Bad Request:", error.response?.data);
    }

    return Promise.reject(error);
  }
);

export default abeGuardAiClient;
