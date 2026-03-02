# 🏢 How to Create a Super-Admin User

## Quick Method: Use the Script (Recommended)

The easiest way to create a super-admin user is to use the provided script:

### Step 1: Run the Script

```bash
cd backend
node src/scripts/createSuperAdmin.js
```

This will create a super-admin with default credentials:
- **Email**: `superadmin@example.com`
- **Password**: `superadmin123`
- **Name**: `Super Admin`

### Step 2: Custom Credentials

You can also provide custom credentials:

```bash
node src/scripts/createSuperAdmin.js your-email@example.com your-password "Your Name"
```

Example:
```bash
node src/scripts/createSuperAdmin.js admin@mycompany.com SecurePass123 "Platform Admin"
```

### Step 3: Login

1. **Start the backend** (if not running):
   ```bash
   cd backend
   npm start
   ```

2. **Open the admin dashboard**:
   - URL: http://localhost:3001
   - You'll be redirected to the login page

3. **Login with your super-admin credentials**:
   - Email: `superadmin@example.com` (or your custom email)
   - Password: `superadmin123` (or your custom password)

4. **Access Super-Admin Portal**:
   - After login, you'll see "🏢 Super-Admin" in the sidebar
   - Click it to access `/super-admin`
   - You can now create and manage tenants!

---

## Alternative Methods

### Method 2: Update Existing Admin to Super-Admin

If you already have an admin user, you can update it to super-admin:

**Option A: Using SQL (Direct Database Access)**

```sql
UPDATE admins 
SET role = 'super_admin', tenant_id = NULL
WHERE email = 'admin@test.com';
```

**Option B: Using the Script**

The script will automatically update an existing admin if the email matches:

```bash
node src/scripts/createSuperAdmin.js admin@test.com newpassword123
```

### Method 3: Using the Register Endpoint (Not Recommended)

The register endpoint currently doesn't allow creating `super_admin` roles directly (for security). You would need to:

1. Register as regular admin:
```bash
curl -X POST http://localhost:5000/api/admin/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Admin",
    "email": "admin@example.com",
    "password": "password123",
    "role": "admin"
  }'
```

2. Then update to super-admin using SQL or the script above.

---

## Verify Super-Admin Was Created

Check if the super-admin exists:

```bash
# Using SQL
psql -U your_db_user -d your_db_name -c "SELECT email, role, tenant_id FROM admins WHERE role = 'super_admin';"
```

Or check in the database directly:
```sql
SELECT id, name, email, role, tenant_id FROM admins WHERE role = 'super_admin';
```

---

## Troubleshooting

### "Email already registered"
- The script will update the existing admin to super-admin
- If you want a different email, use a new one

### "Cannot access /super-admin"
- Make sure you logged in with the super-admin account
- Check that `role = 'super_admin'` in the database
- Clear browser cache and localStorage, then login again
- Check browser console (F12) for errors

### "Super-Admin link not showing in sidebar"
- The link only shows if `user.role === 'super_admin'`
- Check localStorage: `localStorage.getItem('adminUser')` should show `"role":"super_admin"`
- Try logging out and logging back in

### "Permission denied" when accessing super-admin routes
- Verify the admin's role in the database
- Check that the JWT token includes `role: 'super_admin'`
- Restart the backend server after updating the role

---

## Default Super-Admin Credentials (After Running Script)

If you used the default script without arguments:

- **Email**: `superadmin@example.com`
- **Password**: `superadmin123`

**⚠️ IMPORTANT**: Change these credentials in production!

---

## Next Steps After Creating Super-Admin

1. ✅ Login as super-admin
2. ✅ Navigate to `/super-admin`
3. ✅ Create your first tenant
4. ✅ Assign features to the tenant
5. ✅ Create an admin for the tenant (using the super-admin portal)

---

## Security Notes

- Super-admin users should have `tenant_id = NULL` (they don't belong to any tenant)
- Super-admin role should only be given to trusted platform administrators
- Consider using strong passwords and 2FA in production
- Regularly audit super-admin accounts
