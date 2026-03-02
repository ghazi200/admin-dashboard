# 🔐 Admin Login Guide

## Quick Solution: Create Admin Account

You need an admin account to view the dashboard. Here are 3 ways to create one:

### Option 1: Use Dev Seed Endpoint (Easiest - Backend Must Be Running)

Make sure **admin-dashboard backend is running** (port 5000), then run:

```bash
curl -X POST http://localhost:5000/api/dev/seed-admin
```

This creates:
- **Admin**: `admin@test.com` / `password123`
- **Supervisor**: `supervisor@test.com` / `password123`

---

### Option 2: Run Seed Script

```bash
cd ~/admin-dashboard/backend
node src/scripts/seedAdmin.js
```

This creates:
- **Admin**: `admin@test.com` / `password123`

---

### Option 3: Register New Admin (Via API)

```bash
curl -X POST http://localhost:5000/api/admin/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Your Name",
    "email": "your-email@example.com",
    "password": "your-password",
    "role": "admin"
  }'
```

---

## Login Steps

1. **Open Admin Dashboard**: http://localhost:3001
2. **You'll be redirected to login page** (if not logged in)
3. **Enter credentials**:
   - **Email**: `admin@test.com`
   - **Password**: `password123`
4. **Click "Sign in"**

---

## Default Credentials (After Seeding)

- **Admin**:
  - Email: `admin@test.com`
  - Password: `password123`

- **Supervisor**:
  - Email: `supervisor@test.com`
  - Password: `password123`

---

## Troubleshooting

### "Invalid email or password"
- Make sure you ran the seed script/endpoint
- Check that backend is running on port 5000
- Verify credentials match exactly (case-sensitive email)

### "Login failed" or Network Error
- Check backend is running: `curl http://localhost:5000/health`
- Check browser console for errors
- Verify you're using the correct URL (http://localhost:3001)

### Can't Access Dashboard After Login
- Check browser console (F12) for errors
- Verify `adminToken` is in localStorage
- Try clearing localStorage and logging in again

---

## Verify Admin Exists

Check if admin was created:

```bash
# If using SQLite
cd ~/admin-dashboard/backend
sqlite3 database.sqlite "SELECT email, role FROM Admins;"

# Or check via API (if you have a test endpoint)
curl http://localhost:5000/api/admin/me \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

## Quick Test

After creating admin and logging in:

1. ✅ Should see dashboard (not login page)
2. ✅ Browser console should show: `✅ Admin realtime socket connected`
3. ✅ Should see "WELCOME ADMIN" banner
4. ✅ Should see dashboard data (shifts, callouts, etc.)
