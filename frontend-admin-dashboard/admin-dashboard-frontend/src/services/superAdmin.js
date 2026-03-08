import axios from "axios";
import { getBackendOrigin } from "../api/apiOrigin";

/**
 * Super-Admin API client.
 * Uses same backend origin as axiosClient (localStorage, env, or production Railway) — never hardcodes localhost in production.
 */
function getSuperAdminBaseURL() {
  const origin = getBackendOrigin();
  return origin ? `${origin}/api/super-admin` : "/api/super-admin";
}

const superAdminClient = axios.create({
  baseURL: getSuperAdminBaseURL(),
  headers: {
    "Content-Type": "application/json",
  },
  withCredentials: true,
});

// Resolve origin at request time so runtime override (e.g. "Use Railway backend") is respected
superAdminClient.interceptors.request.use(
  (config) => {
    const origin = getBackendOrigin();
    config.baseURL = origin ? `${origin}/api/super-admin` : "/api/super-admin";
    if (origin && config.url) {
      const path = config.url.startsWith("/") ? config.url : `/${config.url}`;
      config.url = `${origin}/api/super-admin${path}`;
      config.baseURL = "";
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Attach admin token to requests
superAdminClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("adminToken");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Handle auth errors
superAdminClient.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error?.response?.status === 401) {
      localStorage.removeItem("adminToken");
      if (!window.location.pathname.includes("/login")) {
        window.location.href = "/login";
      }
    }
    return Promise.reject(error);
  }
);

// ===== SUPER-ADMIN: TENANT MANAGEMENT =====
export const listTenants = (params = {}) =>
  superAdminClient.get("/tenants", { params });

export const createTenant = (data) =>
  superAdminClient.post("/tenants", data);

export const updateTenant = (id, data) =>
  superAdminClient.put(`/tenants/${id}`, data);

export const deleteTenant = (id) =>
  superAdminClient.delete(`/tenants/${id}`);

export const getTenantStats = (id) =>
  superAdminClient.get(`/tenants/${id}/stats`);

export const createTenantAdmin = (tenantId, data) =>
  superAdminClient.post(`/tenants/${tenantId}/admins`, data);

export const getSuperAdminAnalytics = () =>
  superAdminClient.get("/analytics");

export const getSuperAdminIncidents = () =>
  superAdminClient.get("/incidents");

export const getCompanyRankings = (days = 30) =>
  superAdminClient.get("/company-rankings", { params: { days } });
