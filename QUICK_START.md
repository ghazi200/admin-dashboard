# 🚀 Quick Start Guide - All Services

## Complete Startup Sequence

You need to start **4 services** in this order:

### Terminal 1: abe-guard-ai (Port 4000)
```bash
cd ~/abe-guard-ai/backend
npm start
```
**Why first?** Other services depend on this for Socket.IO events and API calls.

---

### Terminal 2: admin-dashboard backend (Port 5000)
```bash
cd ~/admin-dashboard/backend
npm run dev
```
**What it does:** Provides REST API for admin dashboard.

---

### Terminal 3: guard-ui (Port 3000)
```bash
cd ~/guard-ui/guard-ui
npm start
```
**What it does:** Guard-facing UI where guards create callouts and manage shifts.

---

### Terminal 4: admin-dashboard frontend (Port 3001)
```bash
cd ~/admin-dashboard/frontend-admin-dashboard/admin-dashboard-frontend
npm start
```
**What it does:** Admin dashboard to view live callouts and manage operations.

---

## 🌐 Access URLs

- **Guard UI**: http://localhost:3000
- **Admin Dashboard**: http://localhost:3001

## ✅ Verification Checklist

After all services start:

1. **abe-guard-ai** (port 4000)
   - ✅ Server running message
   - ✅ Socket.IO ready

2. **admin-dashboard backend** (port 5000)
   - ✅ "Admin Dashboard backend running on port 5000"
   - ✅ "Sequelize synced"

3. **guard-ui** (port 3000)
   - ✅ React app compiled successfully
   - ✅ Opens in browser

4. **admin-dashboard frontend** (port 3001)
   - ✅ React app compiled successfully
   - ✅ Opens in browser
   - ✅ Check console: "✅ Admin realtime socket connected"

## 🧪 Testing Live Callouts

1. **Login to Guard UI** (http://localhost:3000)
   - Login as a guard
   - Create a callout (if the feature exists)

2. **Check Admin Dashboard** (http://localhost:3001)
   - Open browser DevTools (F12)
   - Check Console for socket connection
   - Check Network tab → `/api/admin/dashboard/live-callouts`
   - Verify response structure: `{ data: [...] }`
   - Verify guard names appear (not "Unknown Guard")

3. **Watch for Updates**
   - Dashboard should auto-refresh every 15 seconds
   - If socket events work, updates should be instant

## 🛠️ Automated Startup (macOS)

Run this script to open all services in separate terminal windows:

```bash
cd ~/admin-dashboard
./start-all.sh
```

## 📋 Manual Startup

If automated script doesn't work, use the manual commands above in 4 separate terminals.

## ❓ Troubleshooting

- **Port already in use?** Check what's running: `lsof -i :PORT_NUMBER`
- **Socket not connecting?** Ensure abe-guard-ai is running on port 4000
- **CORS errors?** Make sure all services are running
- **"Unknown Guard" in callouts?** Check database associations are set up correctly

See `TESTING_GUIDE.md` for more detailed information.
