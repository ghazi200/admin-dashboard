import axios from "axios";

/** Production: always Railway. Local only: localhost:5000. Guarantees API never uses localhost in production. */
const PRODUCTION_API = "https://admin-dashboard-production-2596.up.railway.app/api/admin";
const isLocal =
  typeof window !== "undefined" &&
  (window.location?.hostname === "localhost" || window.location?.hostname === "127.0.0.1");

const axiosClient = axios.create({
  baseURL: isLocal ? "http://localhost:5000/api/admin" : PRODUCTION_API,
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

/** 401 → clear token and redirect to login */
axiosClient.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error?.response?.status === 401) {
      const msg = String(error?.response?.data?.message || "");
      if (/invalid signature|jwt expired|invalid token|session invalidated/i.test(msg)) {
        localStorage.removeItem("adminToken");
        localStorage.removeItem("adminInfo");
        localStorage.removeItem("adminUser");
        if (!window.location.pathname.includes("/login")) window.location.href = "/login";
      }
    }
    return Promise.reject(error);
  }
);

export default axiosClient;
