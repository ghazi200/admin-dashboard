/**
 * Guard In-App Messaging API
 * Same pattern as admin: messagesClient baseURL /api/guard, paths under /messages
 */
import { messagesClient } from "../api/axiosClients";

const BASE = "/messages";

export function listConversations(params = {}) {
  return messagesClient.get(`${BASE}/conversations`, { params });
}

export function getConversation(conversationId) {
  return messagesClient.get(`${BASE}/conversations/${conversationId}`);
}

export function getMessages(conversationId, params = {}) {
  return messagesClient.get(`${BASE}/conversations/${conversationId}/messages`, { params });
}

export function sendMessage(conversationId, body) {
  return messagesClient.post(`${BASE}/conversations/${conversationId}/messages`, body);
}

export function deleteMessage(conversationId, messageId) {
  return messagesClient.delete(`${BASE}/conversations/${conversationId}/messages/${messageId}`);
}

export function markConversationAsRead(conversationId, body = {}) {
  return messagesClient.post(`${BASE}/conversations/${conversationId}/read`, body);
}

export function deleteConversation(conversationId) {
  return messagesClient.delete(`${BASE}/conversations/${conversationId}`);
}
