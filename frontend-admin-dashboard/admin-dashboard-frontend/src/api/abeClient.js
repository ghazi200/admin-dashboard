
// src/api/abeClient.js
import axios from "axios";

/**
 * Shared /api client (non-admin routes)
 * Requires CRA proxy in admin-dashboard-frontend/package.json:
 *   "proxy": "http://localhost:4000"
 */
const abeClient = axios.create({
  baseURL: "/api/admin",
  headers: { "Content-Type": "application/json" },
  withCredentials: true,
});

abeClient.interceptors.request.use((config) => {
  const token = localStorage.getItem("adminToken");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  else delete config.headers.Authorization;
  return config;
});

export default abeClient;
