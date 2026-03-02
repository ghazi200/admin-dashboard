/**
 * Guard In-App Messaging API
 * For use in guard-ui: calls /api/guard/messages/* on the admin-dashboard backend (port 5000).
 *
 * In guard-ui: set baseURL to your backend (e.g. REACT_APP_API_URL=http://localhost:5000)
 * and ensure requests send Authorization: Bearer <guardToken>.
 */
import axios from "axios";

const getBaseURL = () => {
  if (typeof process !== "undefined" && process.env?.REACT_APP_API_URL) {
    return process.env.REACT_APP_API_URL.replace(/\/$/, "");
  }
  if (typeof window !== "undefined" && window.location?.hostname === "localhost") {
    return "http://localhost:5000";
  }
  return "";
};

const baseURL = getBaseURL();
const API_BASE = baseURL ? `${baseURL}/api/guard/messages` : "/api/guard/messages";

const client = axios.create({
  baseURL: API_BASE,
  timeout: 30000,
  headers: { "Content-Type": "application/json" },
  withCredentials: true,
});

client.interceptors.request.use((config) => {
  const token = typeof localStorage !== "undefined" ? localStorage.getItem("guardToken") : null;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

const BASE = "";

export function listConversations(params = {}) {
  return client.get(`${BASE}/conversations`, { params });
}

export function getConversation(conversationId) {
  return client.get(`${BASE}/conversations/${conversationId}`);
}

export function getMessages(conversationId, params = {}) {
  return client.get(`${BASE}/conversations/${conversationId}/messages`, { params });
}

export function sendMessage(conversationId, body) {
  return client.post(`${BASE}/conversations/${conversationId}/messages`, body);
}

export function deleteMessage(conversationId, messageId) {
  return client.delete(`${BASE}/conversations/${conversationId}/messages/${messageId}`);
}

export function markConversationAsRead(conversationId, body = {}) {
  return client.post(`${BASE}/conversations/${conversationId}/read`, body);
}

export function deleteConversation(conversationId) {
  return client.delete(`${BASE}/conversations/${conversationId}`);
}
