/**
 * Guard In-App Messaging API
 * Uses Capacitor native HTTP on Android (same as clock-in) so WebView CORS cannot block Messages.
 */
import { messagesClient } from "../api/axiosClients";
import { getAdminApiUrl, getGuardApiUrl } from "../config/apiUrls";
import { isNativeCapable, nativeDeleteJson, nativeGetJson, nativePostJson } from "../utils/nativeHttp";

const BASE = "/messages";

function authHeaders() {
  const token = localStorage.getItem("guardToken") || localStorage.getItem("token") || "";
  return {
    Accept: "application/json",
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

/** Messages live on admin-dashboard backend under /api/guard/messages */
function messagesOrigin() {
  const admin = String(getAdminApiUrl() || "").replace(/\/+$/, "");
  const guard = String(getGuardApiUrl() || "").replace(/\/+$/, "");
  const base = admin || guard;
  return `${base}/api/guard`;
}

async function msgGet(path) {
  const p = path.startsWith("/") ? path : `/${path}`;
  if (isNativeCapable()) {
    const res = await nativeGetJson(`${messagesOrigin()}${p}`, authHeaders());
    if (!res.ok) {
      const err = new Error(res.data?.message || res.data?.error || res.error || "Request failed");
      err.response = { status: res.status, data: res.data || {} };
      throw err;
    }
    return { data: res.data };
  }
  return messagesClient.get(p, { headers: authHeaders() });
}

async function msgPost(path, body = {}) {
  const p = path.startsWith("/") ? path : `/${path}`;
  if (isNativeCapable()) {
    const res = await nativePostJson(`${messagesOrigin()}${p}`, body, authHeaders());
    if (!res.ok) {
      const err = new Error(res.data?.message || res.data?.error || res.error || "Request failed");
      err.response = { status: res.status, data: res.data || {} };
      throw err;
    }
    return { data: res.data };
  }
  return messagesClient.post(p, body, { headers: authHeaders() });
}

async function msgDelete(path) {
  const p = path.startsWith("/") ? path : `/${path}`;
  if (isNativeCapable()) {
    const res = await nativeDeleteJson(`${messagesOrigin()}${p}`, authHeaders());
    if (!res.ok) {
      const err = new Error(res.data?.message || res.data?.error || res.error || "Request failed");
      err.response = { status: res.status, data: res.data || {} };
      throw err;
    }
    return { data: res.data };
  }
  return messagesClient.delete(p, { headers: authHeaders() });
}

export function listConversations(params = {}) {
  const qs = new URLSearchParams(params).toString();
  return msgGet(`${BASE}/conversations${qs ? `?${qs}` : ""}`);
}

export function getConversation(conversationId) {
  return msgGet(`${BASE}/conversations/${encodeURIComponent(conversationId)}`);
}

export function getMessages(conversationId, params = {}) {
  const qs = new URLSearchParams(params).toString();
  return msgGet(
    `${BASE}/conversations/${encodeURIComponent(conversationId)}/messages${qs ? `?${qs}` : ""}`
  );
}

export function sendMessage(conversationId, body) {
  return msgPost(`${BASE}/conversations/${encodeURIComponent(conversationId)}/messages`, body);
}

export function deleteMessage(conversationId, messageId) {
  return msgDelete(
    `${BASE}/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(messageId)}`
  );
}

export function markConversationAsRead(conversationId, body = {}) {
  return msgPost(`${BASE}/conversations/${encodeURIComponent(conversationId)}/read`, body);
}

export function deleteConversation(conversationId) {
  return msgDelete(`${BASE}/conversations/${encodeURIComponent(conversationId)}`);
}
