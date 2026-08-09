/**
 * B3 — MFA policy for pilot / production admins.
 *
 * Env:
 *   MFA_REQUIRED=true                     → require MFA for tenant-scoped admins
 *   MFA_REQUIRED_TENANT_IDS=uuid,uuid     → require MFA for those tenants (pilot)
 *   MFA_REQUIRED_FOR_SUPER_ADMIN=true     → also require for super_admin when MFA_REQUIRED=true
 */

function parseBool(v) {
  const s = String(v ?? "").trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes" || s === "on";
}

function requiredTenantIds() {
  const raw = String(process.env.MFA_REQUIRED_TENANT_IDS || "").trim();
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * @param {{ role?: string, tenant_id?: string|null }} admin
 * @returns {boolean}
 */
function isMfaRequiredForAdmin(admin) {
  if (!admin) return false;

  const role = String(admin.role || "").toLowerCase();
  const tenantId = admin.tenant_id != null ? String(admin.tenant_id).trim().toLowerCase() : "";
  const globalOn = parseBool(process.env.MFA_REQUIRED);
  const forSuper = parseBool(process.env.MFA_REQUIRED_FOR_SUPER_ADMIN);
  const tenantList = requiredTenantIds();

  if (role === "super_admin") {
    return globalOn && forSuper;
  }

  if (tenantId && tenantList.includes(tenantId)) {
    return true;
  }

  if (globalOn) {
    // admin | supervisor | owner (and any other non–super-admin)
    return true;
  }

  return false;
}

/**
 * Paths allowed while MFA is required but not yet enabled.
 * @param {import('express').Request} req
 */
function isMfaEnrollmentPathAllowed(req) {
  const url = String(req.originalUrl || req.url || "").split("?")[0];
  const allowedExact = [
    "/api/admin/me",
    "/api/admin/mfa/setup",
    "/api/admin/mfa/verify-setup",
    "/api/admin/change-password",
  ];
  if (allowedExact.includes(url)) return true;
  // Some proxies strip /api prefix in originalUrl inconsistently
  return (
    url.endsWith("/me") ||
    url.endsWith("/mfa/setup") ||
    url.endsWith("/mfa/verify-setup") ||
    url.endsWith("/change-password")
  );
}

function getMfaPolicyInfo() {
  return {
    mfaRequiredGlobal: parseBool(process.env.MFA_REQUIRED),
    mfaRequiredTenantIds: requiredTenantIds(),
    mfaRequiredForSuperAdmin: parseBool(process.env.MFA_REQUIRED_FOR_SUPER_ADMIN),
  };
}

module.exports = {
  isMfaRequiredForAdmin,
  isMfaEnrollmentPathAllowed,
  getMfaPolicyInfo,
  requiredTenantIds,
};
