// src/services/policy.service.js
import abeGuardAiClient from "../api/abeGuardAiClient";

// tenants + sites (on abe-guard-ai backend port 4000)
export const listTenants = () => abeGuardAiClient.get("/api/admin/tenants");
export const listSites = (tenantId) =>
  abeGuardAiClient.get("/api/admin/tenants/sites", { params: tenantId ? { tenantId } : {} });

// docs (on abe-guard-ai backend port 4000)
export const listPolicyDocuments = (tenantId, siteId) =>
  abeGuardAiClient.get("/api/ai/policy/documents", {
    params: { tenantId, ...(siteId ? { siteId } : {}) },
  });

export const setPolicyDocumentActive = (documentId, isActive) =>
  abeGuardAiClient.patch(`/api/ai/policy/documents/${documentId}/active`, { isActive });

export const deletePolicyDocument = (documentId) =>
  abeGuardAiClient.delete(`/api/ai/policy/documents/${documentId}`);

export const reindexPolicyDocument = (documentId, forceExtract = false) =>
  abeGuardAiClient.post(`/api/ai/policy/documents/${documentId}/reindex`, { forceExtract });

// upload (on abe-guard-ai backend port 4000)
export const uploadPolicyPdf = (formData) =>
  abeGuardAiClient.post("/api/ai/policy/upload", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });

export const uploadPolicyText = (formData) =>
  abeGuardAiClient.post("/api/ai/policy/upload", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
