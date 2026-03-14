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
  // Use adminToken for admin endpoints
  const token = localStorage.getItem("adminToken");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
    console.log("[abeGuardAiClient] Request with token:", config.method?.toUpperCase(), config.url);
  } else {
    delete config.headers.Authorization;
    console.log("[abeGuardAiClient] Request WITHOUT token:", config.method?.toUpperCase(), config.url);
  }
  return config;
});

abeGuardAiClient.interceptors.response.use(
  (res) => res,
  (error) => {
    const status = error?.response?.status;

    if (status === 401) {
      console.error("[abeGuardAiClient] 401 Unauthorized:", error.response?.data);
      const pathname = (typeof window !== "undefined" && window.location?.pathname) ? window.location.pathname.toLowerCase() : "";
      const onReportsOrInspections = pathname.indexOf("/reports") !== -1 || pathname.indexOf("/inspections") !== -1;
      // Never clear token or redirect on Reports/Inspections — keeps page visible
      if (onReportsOrInspections) {
        return Promise.reject(error);
      }
      const msg = String(error?.response?.data?.message || "");
      const looksLikeBadToken =
        msg.toLowerCase().includes("invalid signature") ||
        msg.toLowerCase().includes("jwt expired") ||
        msg.toLowerCase().includes("invalid token") ||
        msg.toLowerCase().includes("expired");

      if (looksLikeBadToken) {
        console.warn("[abeGuardAiClient] Token expired or invalid - clearing and redirecting to login");
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
      console.error("[abeGuardAiClient] Error message:", error.response?.data?.message);
    }
    
    return Promise.reject(error);
  }
);

export default abeGuardAiClient;
