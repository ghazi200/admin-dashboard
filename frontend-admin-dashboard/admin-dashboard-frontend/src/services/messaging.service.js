/**
 * Admin In-App Messaging API
 * Uses axiosClient (baseURL: /api/admin) → /api/admin/messages/*
 */
import axiosClient from "../api/axiosClient";

const BASE = "/messages";

export function listConversations(params = {}) {
  return axiosClient.get(`${BASE}/conversations`, { params });
}

export function getConversation(conversationId) {
  return axiosClient.get(`${BASE}/conversations/${conversationId}`);
}

export function getMessages(conversationId, params = {}) {
  return axiosClient.get(`${BASE}/conversations/${conversationId}/messages`, { params });
}

export function sendMessage(conversationId, body) {
  return axiosClient.post(`${BASE}/conversations/${conversationId}/messages`, body);
}

export function deleteMessage(conversationId, messageId) {
  return axiosClient.delete(
    `${BASE}/conversations/${String(conversationId)}/messages/${String(messageId)}`
  );
}

export function markConversationAsRead(conversationId, body = {}) {
  return axiosClient.post(`${BASE}/conversations/${conversationId}/read`, body);
}

export function createGroupConversation(body) {
  return axiosClient.post(`${BASE}/conversations/group`, body);
}

export function addParticipants(conversationId, participantIds) {
  return axiosClient.post(`${BASE}/conversations/${conversationId}/participants`, {
    participantIds,
  });
}

export function removeParticipant(conversationId, participantId) {
  return axiosClient.delete(
    `${BASE}/conversations/${conversationId}/participants/${participantId}`
  );
}

export function deleteConversation(conversationId) {
  return axiosClient.delete(`${BASE}/conversations/${conversationId}`);
}
