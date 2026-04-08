/**
 * Tenant Filtering Utility
 * 
 * Ensures admins and supervisors can only access data from their own tenant.
 * Super Admin bypasses all tenant restrictions.
 */

function isValidTenantUuid(v) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(v || "").trim()
  );
}

/**
 * Merge DB-backed tenant_id and role so creates are not wrong when JWT is stale.
 * @param {import("express").Request} req
 * @returns {Promise<object>}
 */
async function resolveAdminTenantForWrite(req) {
  const base = req.admin || {};
  const adminId = base.id;
  if (adminId == null) return base;
  const { Admin } = req.app.locals.models || {};
  if (!Admin) return base;
  try {
    const row = await Admin.findByPk(adminId, { attributes: ["tenant_id", "role"] });
    if (!row) return base;
    return {
      ...base,
      tenant_id: row.tenant_id != null ? row.tenant_id : base.tenant_id,
      role: String(row.role || base.role || "admin").toLowerCase(),
    };
  } catch {
    return base;
  }
}

/**
 * Get tenant filter for the current admin
 * @param {Object} admin - req.admin object from authAdmin middleware
 * @returns {string|null} - tenant_id to filter by, or null if super_admin (no filter)
 */
function getTenantFilter(admin) {
  // Super Admin can see all tenants (no filter)
  if (admin?.role === "super_admin") {
    return null;
  }

  // Admin, Supervisor, and Owner are restricted to their tenant
  return admin?.tenant_id || null;
}

/**
 * Get tenant filter for WHERE clause (Sequelize)
 * @param {Object} admin - req.admin object
 * @returns {Object|null} - Sequelize where clause or null
 */
function getTenantWhere(admin) {
  const tenantId = getTenantFilter(admin);
  if (tenantId === null) {
    return null; // Super Admin - no filter
  }
  return { tenant_id: tenantId };
}

/**
 * Get tenant filter for SQL WHERE clause (raw SQL)
 * @param {Object} admin - req.admin object
 * @param {Array} params - Array to push parameter to
 * @returns {string} - SQL WHERE clause fragment (empty string if no filter)
 */
function getTenantSqlFilter(admin, params = []) {
  const tenantId = getTenantFilter(admin);
  if (tenantId === null) {
    return ""; // Super Admin - no filter
  }
  params.push(tenantId);
  return `tenant_id = $${params.length}`;
}

/**
 * Ensure tenant_id is set for create/update operations
 * @param {Object} admin - req.admin object
 * @param {Object} data - Data object to set tenant_id on
 * @returns {Object} - Data object with tenant_id set (if not super_admin)
 */
function ensureTenantId(admin, data) {
  // Super Admin can set any tenant_id (or leave it null)
  if (admin?.role === "super_admin") {
    return data;
  }

  // Admin and Supervisor must use their tenant_id
  if (admin?.tenant_id) {
    return { ...data, tenant_id: admin.tenant_id };
  }

  return data;
}

/**
 * Check if admin can access a specific tenant
 * @param {Object} admin - req.admin object
 * @param {string} tenantId - Tenant ID to check
 * @returns {boolean} - true if allowed, false otherwise
 */
function canAccessTenant(admin, tenantId) {
  // Super Admin can access any tenant
  if (admin?.role === "super_admin") {
    return true;
  }

  // Admin and Supervisor can only access their own tenant
  return admin?.tenant_id === tenantId;
}

module.exports = {
  getTenantFilter,
  getTenantWhere,
  getTenantSqlFilter,
  ensureTenantId,
  canAccessTenant,
  isValidTenantUuid,
  resolveAdminTenantForWrite,
};
