import axios from "axios";

/**
 * Super-Admin API client
 * Uses direct connection to backend on port 5000
 */
const superAdminClient = axios.create({
  baseURL: "http://localhost:5000/api/super-admin",
  headers: {
    "Content-Type": "application/json",
  },
  withCredentials: true,
});

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
