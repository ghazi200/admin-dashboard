// backend/src/config/tenantConfig.js
/**
 * Tenant Configuration
 * Centralized tenant IDs for testing and development
 */

// ABE Guard tenant ID (ABE Security Company)
const ABE_GUARD_TENANT_ID = "4941a27e-ea61-4847-b983-f56fb120f2aa";

module.exports = {
  ABE_GUARD_TENANT_ID,
  // Default tenant for all test/seed data
  DEFAULT_TEST_TENANT_ID: ABE_GUARD_TENANT_ID,
};
