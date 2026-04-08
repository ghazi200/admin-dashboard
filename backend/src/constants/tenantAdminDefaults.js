/**
 * Default permissions for organization (tenant) administrators.
 * Super admin assigns these when provisioning admins for a tenant; scoped to tenant_id in controllers.
 */
const TENANT_ADMIN_DEFAULT_PERMISSIONS = [
  "dashboard:read",
  "dashboard:write",
  "guards:read",
  "guards:write",
  "guards:delete",
  "shifts:read",
  "shifts:write",
  "shifts:delete",
  "schedule:read",
  "schedule:write",
  /** Needed for /api/admin/users — create supervisors and adjust their permissions */
  "users:read",
  "users:write",
];

/** Default for tenant supervisors unless super_admin sends a custom permissions array */
const TENANT_SUPERVISOR_DEFAULT_PERMISSIONS = [
  "dashboard:read",
  "guards:read",
  "shifts:read",
  "schedule:read",
];

module.exports = {
  TENANT_ADMIN_DEFAULT_PERMISSIONS,
  TENANT_SUPERVISOR_DEFAULT_PERMISSIONS,
};
