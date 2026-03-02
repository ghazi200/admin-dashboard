// src/api/abeGuardAiClient.js
import axios from "axios";

/**
 * Client for abe-guard-ai backend (port 4000)
 * Used for policy/tenant endpoints
 * 
 * Note: In development, CRA proxy forwards /api/guard-ai/* to http://localhost:4000
 * If proxy is not configured, you can use absolute URL: http://localhost:4000
 */
const abeGuardAiClient = axios.create({
  baseURL: process.env.REACT_APP_GUARD_AI_URL || "http://localhost:4000",
  headers: { "Content-Type": "application/json" },
  withCredentials: true,
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
      
      // Handle JWT expiration - same as axiosClient
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
