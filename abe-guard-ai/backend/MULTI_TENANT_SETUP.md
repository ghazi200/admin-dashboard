# Multi-Tenant Setup Guide

## Overview

For proper multi-tenant support, `tenant_id` **MUST** be included in JWT tokens issued by the admin-dashboard backend. This ensures proper tenant isolation and security.

## Required Changes for Admin-Dashboard Backend

### 1. Add `tenant_id` to Admin Model

The admin-dashboard backend's `Admin` model should include a `tenant_id` field (UUID):

```javascript
// backend/src/models/Admin.js
const Admin = sequelize.define("Admin", {
  // ... existing fields ...
  tenant_id: {
    type: DataTypes.UUID,
    allowNull: false, // ⚠️ Required for multi-tenant
    references: { model: 'tenants', key: 'id' }, // If you have a tenants table
  },
});
```

### 2. Include `tenant_id` in JWT Tokens

Update the admin authentication controller to include `tenant_id` in JWT tokens:

```javascript
// backend/src/controllers/adminAuth.controller.js

// In login function:
const token = jwt.sign(
  { 
    adminId: admin.id, 
    role: admin.role, 
    permissions: admin.permissions || [],
    tenant_id: admin.tenant_id, // ✅ ADD THIS
  },
  process.env.JWT_SECRET,
  { expiresIn: "7d" }
);

// In register function:
const token = jwt.sign(
  { 
    adminId: admin.id, 
    role: admin.role, 
    permissions: admin.permissions || [],
    tenant_id: admin.tenant_id, // ✅ ADD THIS (if provided during registration)
  },
  process.env.JWT_SECRET,
  { expiresIn: "7d" }
);
```

### 3. Update Admin Registration/Login to Handle `tenant_id`

```javascript
// During registration, accept tenant_id from request body or assign default
const tenantId = req.body.tenant_id || null; // Or set default tenant

const admin = await Admin.create({
  // ... other fields ...
  tenant_id: tenantId, // ✅ Set tenant_id
});
```

## How It Works

1. **Admin logs in** → Admin-dashboard backend issues JWT with `tenant_id` in payload
2. **Admin makes request** → JWT token sent to abe-guard-ai backend
3. **abe-guard-ai extracts `tenant_id`** → Used to filter all queries by tenant
4. **Tenant isolation** → Each tenant only sees their own data

## Security Benefits

- ✅ **Tenant Isolation**: Prevents admins from accessing other tenants' data
- ✅ **No Data Leakage**: All queries are automatically filtered by `tenant_id`
- ✅ **Scalable**: Works with unlimited tenants
- ✅ **Secure**: Tenant ID comes from authenticated JWT token (can't be spoofed)

## Testing

1. Ensure admin-dashboard backend includes `tenant_id` in JWT tokens
2. Test that supervisor assistant routes work with JWT tokens containing `tenant_id`
3. Verify that data is properly isolated per tenant

## Migration Path

If you're migrating from single-tenant to multi-tenant:

1. Add `tenant_id` column to `admins` table (allow NULL initially)
2. Update existing admins to have a `tenant_id`
3. Update JWT token generation to include `tenant_id`
4. Update abe-guard-ai backend to require `tenant_id` (already done)
5. Remove NULL `tenant_id` allowance once all admins have been assigned
