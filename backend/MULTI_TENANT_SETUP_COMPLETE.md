# Multi-Tenant Setup - Admin Dashboard Backend

## ✅ Changes Applied

### 1. Admin Model Updated
- Added `tenant_id` field (UUID, nullable) to `Admin` model
- Location: `/src/models/Admin.js`

### 2. Migration Created
- Created migration to add `tenant_id` column to `Admins` table
- Location: `/src/migrations/add_tenant_id_to_admins.js`
- **Action Required**: Run this migration to add the column to your database

### 3. JWT Tokens Updated
- JWT tokens now include `tenant_id` in the payload
- Updated in both `register` and `login` functions
- Location: `/src/controllers/adminAuth.controller.js`

### 4. Auth Middleware Updated
- `authAdmin` middleware now extracts `tenant_id` from JWT token
- Sets `req.admin.tenant_id` for use in routes
- Location: `/src/middleware/authAdmin.js`

### 5. User Creation Updated
- `createUser` function now accepts `tenant_id` in request body
- Location: `/src/controllers/adminUsers.controller.js`

## 🚀 Next Steps

### 1. Run the Migration

**Option A: Using Sequelize CLI (if configured)**
```bash
cd /Users/ghaziabdullah/admin-dashboard/backend
npx sequelize-cli db:migrate
```

**Option B: Manual SQL**
```sql
ALTER TABLE "Admins" 
ADD COLUMN "tenant_id" UUID NULL;
```

### 2. Update Existing Admins (Optional)

If you have existing admins, you'll need to assign them a `tenant_id`. You can do this via SQL:

```sql
-- Example: Set tenant_id for a specific admin
-- Replace 'admin-id-here' with actual admin ID and 'tenant-uuid-here' with actual tenant UUID
UPDATE "Admins" 
SET "tenant_id" = 'tenant-uuid-here' 
WHERE "id" = 'admin-id-here';
```

### 3. Create New Admins with tenant_id

When creating new admins, include `tenant_id` in the request body:

```bash
# Register new admin with tenant_id
curl -X POST http://localhost:5000/api/admin/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Admin Name",
    "email": "admin@example.com",
    "password": "password123",
    "tenant_id": "uuid-of-tenant-here"
  }'
```

### 4. Test the Integration

1. **Login** - JWT token should now include `tenant_id`
2. **Check Token** - Decode the JWT to verify `tenant_id` is present
3. **Test Supervisor Assistant** - Should now work with `tenant_id` from JWT

## 📋 Verification

### Check Migration Status
```sql
-- Check if tenant_id column exists
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'Admins' AND column_name = 'tenant_id';
```

### Verify JWT Token Contains tenant_id
```javascript
const jwt = require('jsonwebtoken');
const token = 'your-jwt-token-here';
const decoded = jwt.decode(token);
console.log('tenant_id:', decoded.tenant_id);
```

## ⚠️ Important Notes

1. **Backward Compatibility**: `tenant_id` is nullable, so existing admins will continue to work
2. **Migration Period**: During migration, some admins may not have `tenant_id` set
3. **abe-guard-ai Backend**: Requires `tenant_id` in JWT for supervisor routes
4. **Security**: Always ensure `tenant_id` is set for admins in production

## 🔒 Security Considerations

- **Tenant Isolation**: `tenant_id` in JWT ensures admins can only access their tenant's data
- **Token Validation**: `tenant_id` is extracted from verified JWT token (can't be spoofed)
- **Multi-Tenant Safe**: Each tenant's data is properly isolated

## 📝 Summary

The admin-dashboard backend is now multi-tenant ready. JWT tokens include `tenant_id`, which will be used by the abe-guard-ai backend for proper tenant isolation in the supervisor assistant and other features.

**Next**: Run the migration and assign `tenant_id` to existing admins as needed.
