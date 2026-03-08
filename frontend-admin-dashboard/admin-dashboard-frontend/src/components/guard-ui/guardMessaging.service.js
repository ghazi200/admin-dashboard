/**
 * Guard In-App Messaging API
 * Calls /api/guard/messages/* on the admin-dashboard backend.
 * Uses same origin as rest of admin app (apiOrigin) so production uses Railway, not localhost.
 */
import axios from "axios";
import { getBackendOrigin } from "../../api/apiOrigin";

function getMessagesBaseURL() {
  const origin = getBackendOrigin();
  return origin ? `${origin}/api/guard/messages` : "/api/guard/messages";
}

const client = axios.create({
  baseURL: getMessagesBaseURL(),
  timeout: 30000,
  headers: { "Content-Type": "application/json" },
  withCredentials: true,
});

client.interceptors.request.use((config) => {
  const origin = getBackendOrigin();
  const baseURL = origin ? `${origin}/api/guard/messages` : "/api/guard/messages";
  if (origin && config.url) {
    const path = config.url.startsWith("/") ? config.url : `/${config.url}`;
    config.url = `${origin}/api/guard/messages${path}`;
    config.baseURL = "";
  } else {
    config.baseURL = baseURL;
  }
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
