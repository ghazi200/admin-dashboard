# Fix: Missing tenantId in JWT Token

## Problem
You're getting "Missing tenantId in JWT token" error when using Guard Reputation or other multi-tenant features.

## Root Cause
Your admin account has `tenant_id: NULL` in the database, so the JWT token includes `tenant_id: null`, which the abe-guard-ai backend rejects.

## Solution

### Step 1: Check Available Tenants
First, find out what tenants exist in your database. Run this query in your abe-guard-ai backend database:

```sql
SELECT id, name FROM tenants LIMIT 10;
```

### Step 2: Assign tenant_id to Your Admin
Update your admin record with a valid tenant_id:

```sql
-- Replace 'YOUR_TENANT_UUID' with an actual tenant ID from Step 1
-- Replace 'admin@test.com' with your admin email
UPDATE "Admins" 
SET tenant_id = 'YOUR_TENANT_UUID' 
WHERE email = 'admin@test.com';
```

Or use this Node script:

```bash
cd /Users/ghaziabdullah/admin-dashboard/backend
node -e "
require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASS
});

(async () => {
  // First, get a tenant ID
  const tenantRes = await pool.query('SELECT id, name FROM tenants LIMIT 1');
  if (tenantRes.rows.length === 0) {
    console.log('❌ No tenants found. Please create a tenant first.');
    await pool.end();
    process.exit(1);
  }
  const tenantId = tenantRes.rows[0].id;
  console.log('Using tenant:', tenantRes.rows[0].name, '(', tenantId, ')');

  // Update your admin
  const adminEmail = 'admin@test.com'; // Change this to your admin email
  const updateRes = await pool.query(
    'UPDATE \"Admins\" SET tenant_id = \$1 WHERE email = \$2 RETURNING id, email, tenant_id',
    [tenantId, adminEmail]
  );

  if (updateRes.rows.length === 0) {
    console.log('❌ Admin not found:', adminEmail);
  } else {
    console.log('✅ Updated admin:', updateRes.rows[0].email, '→ tenant_id:', updateRes.rows[0].tenant_id);
  }

  await pool.end();
  process.exit(0);
})().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
"
```

### Step 3: Log Out and Log Back In
**Important**: You must log out and log back in to get a new JWT token with the `tenant_id`.

1. Clear your browser's localStorage or log out from the admin dashboard
2. Log in again
3. The new JWT token will include your `tenant_id`

### Step 4: Verify JWT Token Contains tenant_id
You can verify the token contains tenant_id by:
1. Opening browser DevTools (F12)
2. Going to Application/Storage → Local Storage
3. Find `adminToken`
4. Copy the token and decode it at https://jwt.io
5. Check that the `tenant_id` field exists and is not null

## Quick Fix Script

Run this to automatically assign the first available tenant to all admins:

```bash
cd /Users/ghaziabdullah/admin-dashboard/backend
node scripts/assignTenantToAdmins.js
```

(You may need to create this script if it doesn't exist)
