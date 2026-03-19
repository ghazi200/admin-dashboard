/**
 * Tenant SQL fragment for raw queries (guard scoped).
 * @param {Object} guard - { tenant_id } from req.guard
 * @param {Array} params - bind array; guard_id should already be $1
 * @returns {string} SQL fragment e.g. "tenant_id = $2" or ""
 */
function getGuardTenantSqlFilter(guard, params = []) {
  const tenantId = guard?.tenant_id || null;
  if (!tenantId) return "";
  params.push(tenantId);
  return `tenant_id = $${params.length}`;
}

module.exports = {
  getGuardTenantSqlFilter,
};
