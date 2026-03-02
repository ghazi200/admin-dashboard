# Tenant Configuration

## ABE Guard Tenant ID

All test and building data now uses the **ABE Security Company** tenant ID:

```
4941a27e-ea61-4847-b983-f56fb120f2aa
```

## Centralized Configuration

The tenant ID is stored in:
```
backend/src/config/tenantConfig.js
```

This ensures consistency across all:
- Seed scripts
- Test files
- Development scripts
- Test data creation

## Usage

Import the tenant ID in any script:

```javascript
const { DEFAULT_TEST_TENANT_ID, ABE_GUARD_TENANT_ID } = require("../config/tenantConfig");

// Use in data creation
await Admin.create({
  name: "Test Admin",
  email: "admin@test.com",
  tenant_id: DEFAULT_TEST_TENANT_ID, // ✅ Uses abe-guard tenant
});
```

## Updated Files

The following files have been updated to use the centralized tenant config:

1. **Seed Scripts:**
   - `backend/src/routes/devSeed.routes.js` - Admin/supervisor seed endpoint
   - `backend/src/scripts/seedAdmin.js` - Admin seed script

2. **Test Files:**
   - `backend/src/test/adminDashboard.test.js` - All test data creation

3. **Development Scripts:**
   - `backend/src/scripts/testSiteHealth.js` - Site health testing
   - `backend/src/scripts/createTestOpEvents.js` - Test event creation

## Environment Override

You can still override the tenant ID using environment variables:

```bash
TEST_TENANT_ID=your-tenant-id node script.js
```

If `TEST_TENANT_ID` is not set, it defaults to the ABE Guard tenant ID.
