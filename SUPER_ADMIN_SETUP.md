# 🏢 Super-Admin Setup Guide

## Overview

The Super-Admin system allows platform administrators to:
- Create and manage companies/tenants
- Control feature access per tenant
- Assign admins to tenants
- View cross-tenant analytics

## Setup Steps

### 1. Database Setup

The tenants table has been created. If you need to recreate it:

```bash
cd backend
node src/scripts/createTenantsTable.js
```

### 2. Create a Super-Admin User

You need to manually create a super-admin user in the database:

```sql
-- Option 1: Update existing admin
UPDATE admins 
SET role = 'super_admin' 
WHERE email = 'your-admin@email.com';

-- Option 2: Create new super-admin (password will be hashed)
-- First, hash a password using bcrypt (or use the backend)
INSERT INTO admins (name, email, password, role, tenant_id)
VALUES (
  'Super Admin',
  'superadmin@example.com',
  '$2a$10$...', -- Use bcrypt to hash your password
  'super_admin',
  NULL -- Super-admins don't belong to a tenant
);
```

**Or use the backend to create one:**

```bash
cd backend
node -e "
const bcrypt = require('bcryptjs');
const hash = bcrypt.hashSync('your-password', 10);
console.log('Hashed password:', hash);
"
```

Then insert into database with the hashed password.

### 3. Access Super-Admin Portal

1. Login as super-admin
2. Navigate to `/super-admin` in the sidebar (only visible to super-admins)
3. You'll see:
   - **Tenants Tab**: List all tenants, create/edit/delete
   - **Analytics Tab**: Platform-wide statistics

### 4. Create Your First Tenant

1. Click "New Tenant" button
2. Fill in:
   - Company Name (required)
   - Contact Email/Phone
   - Subscription Plan (free, basic, pro, enterprise)
   - Status (trial, active, suspended)
   - Features (checkboxes for each feature)
   - Limits (max guards, max locations)
3. Click "Create Tenant"

### 5. Create Admin for Tenant

After creating a tenant, you can create an admin for it:

1. Click "Edit" on the tenant
2. Or use the API:
```bash
POST /api/super-admin/tenants/:tenantId/admins
{
  "name": "Admin Name",
  "email": "admin@tenant.com",
  "password": "secure-password",
  "role": "admin",
  "permissions": []
}
```

## Available Features

The system supports these feature flags per tenant:

- `dashboard` - Basic dashboard access
- `analytics` - Advanced analytics dashboard
- `ai_optimization` - AI-powered shift optimization
- `callout_prediction` - Predictive callout prevention
- `report_builder` - Custom report builder
- `smart_notifications` - AI-powered notifications
- `scheduled_reports` - Automated report scheduling
- `multi_location` - Multiple location support
- `api_access` - API access
- `white_label` - White-label branding

## API Endpoints

All endpoints require super-admin authentication:

- `GET /api/super-admin/tenants` - List all tenants
- `POST /api/super-admin/tenants` - Create tenant
- `PUT /api/super-admin/tenants/:id` - Update tenant
- `DELETE /api/super-admin/tenants/:id` - Delete tenant (soft delete)
- `GET /api/super-admin/tenants/:id/stats` - Get tenant statistics
- `POST /api/super-admin/tenants/:id/admins` - Create admin for tenant
- `GET /api/super-admin/analytics` - Platform analytics

## Security

- Super-admin routes are protected by `requireSuperAdmin` middleware
- Only users with `role === 'super_admin'` can access
- Regular admins cannot access super-admin endpoints
- All tenant data is isolated by `tenant_id`

## Next Steps

1. Create a super-admin user
2. Login and access `/super-admin`
3. Create your first tenant
4. Assign features to the tenant
5. Create an admin for the tenant
6. Test the tenant's access to enabled features
