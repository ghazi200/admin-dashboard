/**
 * Guard Tenant Filtering Utility
 * 
 * Ensures guards can only access data from their own tenant.
 * Guards without tenant_id cannot access any tenant data.
 */

/**
 * Get tenant filter for the current guard
 * @param {Object} guard - req.user object from guardAuth middleware
 * @returns {string|null} - tenant_id to filter by, or null if guard has no tenant
 */
function getGuardTenantFilter(guard) {
  return guard?.tenant_id || null;
}

/**
 * Get tenant filter for SQL WHERE clause (raw SQL)
 * @param {Object} guard - req.user object from guardAuth middleware
 * @param {Array} params - Array to push parameter to
 * @returns {string} - SQL WHERE clause fragment (empty string if no filter)
 */
function getGuardTenantSqlFilter(guard, params = []) {
  const tenantId = getGuardTenantFilter(guard);
  if (!tenantId) {
    return ""; // Guard without tenant - no filter (will be handled by other checks)
  }
  params.push(tenantId);
  return `tenant_id = $${params.length}`;
}

/**
 * Check if guard can access a specific tenant
 * @param {Object} guard - req.user object from guardAuth middleware
 * @param {string} tenantId - Tenant ID to check
 * @returns {boolean} - true if allowed, false otherwise
 */
function canGuardAccessTenant(guard, tenantId) {
  // Guard without tenant_id cannot access any tenant
  if (!guard?.tenant_id) {
    return false;
  }
  
  // Guard can only access their own tenant
  return guard.tenant_id === tenantId;
}

/**
 * Verify guard has access to a resource based on tenant_id
 * @param {Object} guard - req.user object
 * @param {Object} resource - Resource object with tenant_id property
 * @returns {boolean} - true if guard can access, false otherwise
 */
function canGuardAccessResource(guard, resource) {
  // If resource has no tenant_id, allow access (legacy data)
  if (!resource?.tenant_id) {
    return true; // Allow access to legacy/unassigned resources
  }
  
  // If guard has no tenant_id, deny access
  if (!guard?.tenant_id) {
    return false;
  }
  
  // Guard can only access resources from their tenant
  return guard.tenant_id === resource.tenant_id;
}

module.exports = {
  getGuardTenantFilter,
  getGuardTenantSqlFilter,
  canGuardAccessTenant,
  canGuardAccessResource,
};
