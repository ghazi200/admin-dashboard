// src/services/payroll.service.js
import abeGuardAiClient from "../api/abeGuardAiClient";
import axiosClient from "../api/axiosClient";

// ===== PAYROLL SETTINGS =====
// Note: GET endpoint may not exist, so we'll get tenant data and extract settings
export const getTenantPayrollSettings = async (tenantId) => {
  try {
    const res = await abeGuardAiClient.get(`/api/admin/tenants`);
    const tenant = res.data?.rows?.find(t => t.id === tenantId);
    if (tenant) {
      return { data: { payroll_mode: tenant.payroll_mode, ai_payroll_enabled: tenant.ai_payroll_enabled } };
    }
    return { data: null };
  } catch {
    return { data: null };
  }
};

export const updateTenantPayrollSettings = (tenantId, data) =>
  abeGuardAiClient.patch(`/api/admin/tenants/${tenantId}/payroll-settings`, data);

// ===== AI PAYROLL =====
export const askPayroll = (payload) =>
  abeGuardAiClient.post("/api/ai/payroll/ask", payload);

// ===== PAY STUBS =====
export const uploadPayStub = (formData) =>
  abeGuardAiClient.post("/api/admin/paystubs", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });

export const listPayStubs = (guardId = null) => {
  const params = guardId ? { guardId } : {};
  return abeGuardAiClient.get("/api/admin/paystubs", { params });
};

// ===== ADJUSTMENTS =====
export const listPendingAdjustments = () =>
  abeGuardAiClient.get("/api/admin/adjustments/pending");

export const listAdjustments = (filters = {}) =>
  abeGuardAiClient.get("/api/admin/adjustments", { params: filters });

export const approveAdjustment = (adjustmentId) =>
  abeGuardAiClient.post(`/api/admin/adjustments/${adjustmentId}/approve`);

export const rejectAdjustment = (adjustmentId) =>
  abeGuardAiClient.post(`/api/admin/adjustments/${adjustmentId}/reject`);

export const createAdjustment = (data) =>
  abeGuardAiClient.post("/api/admin/adjustments", data);

export const getAdjustment = (adjustmentId) =>
  abeGuardAiClient.get(`/api/admin/adjustments/${adjustmentId}`);

// ===== TENANTS (for dropdown) =====
export const listTenants = () =>
  abeGuardAiClient.get("/api/admin/tenants").catch(() => ({ data: { rows: [] } }));

// ===== GUARDS (for dropdown) =====
// Use admin dashboard API for guards list
export const listGuards = () =>
  axiosClient.get("/guards").catch(() => ({ data: [] }));
