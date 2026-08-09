/**
 * Tenant-scoped eligibility for callout ranking.
 * Prevents ranking guards from other tenants when a shift has a tenant_id.
 */

/**
 * @param {{ tenantId?: string|null, callerGuardId?: string|null }} opts
 * @returns {{ where: object, refuseCrossTenant: boolean }}
 */
function buildCalloutEligibleWhere(opts = {}) {
  const tenantId = opts.tenantId ? String(opts.tenantId).trim() : "";
  const where = {
    is_active: true,
    callout_eligible: true,
  };

  if (!tenantId) {
    // No tenant → refuse to load all guards (would leak across tenants)
    return { where: null, refuseCrossTenant: true };
  }

  where.tenant_id = tenantId;
  return { where, refuseCrossTenant: false };
}

/**
 * Filter ranked/eligible guards excluding the caller.
 * @param {Array<{id: any}>} guards
 * @param {string|null} callerGuardId
 */
function excludeCallerGuard(guards, callerGuardId) {
  const list = Array.isArray(guards) ? guards : [];
  if (!callerGuardId) return list;
  const caller = String(callerGuardId).trim();
  return list.filter((g) => String(g.id) !== caller);
}

module.exports = {
  buildCalloutEligibleWhere,
  excludeCallerGuard,
};
