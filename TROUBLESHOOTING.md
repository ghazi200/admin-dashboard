# 🔧 Troubleshooting Connection Refused Error

## Common Causes

The "connection refused" error usually means one of these services isn't running:

### 1. Socket Connection (Port 4000) - Most Common
**Error**: `❌ Admin realtime socket connect_error: connect ECONNREFUSED`

**Solution**: Start **abe-guard-ai** on port 4000
```bash
cd ~/abe-guard-ai/backend
npm start
```

**Check if running**:
```bash
lsof -i :4000
# or
curl http://localhost:4000/health
```

### 2. REST API Connection (Port 5000)
**Error**: API requests failing with connection refused

**Solution**: Start **admin-dashboard backend** on port 5000
```bash
cd ~/admin-dashboard/backend
npm run dev
```

**Check if running**:
```bash
lsof -i :5000
# or
curl http://localhost:5000/health
```

### 3. Frontend Proxy Issue
The frontend proxies API calls to port 5000 (see `package.json`). Make sure:
- Admin dashboard backend is running on port 5000
- The proxy in `package.json` matches: `"proxy": "http://localhost:5000"`

## Quick Diagnostic Steps

### Step 1: Check What's Running
```bash
# Check all relevant ports
lsof -i :4000 -i :5000 -i :3000 -i :3001
```

### Step 2: Start Missing Services

**If port 4000 is not in use:**
```bash
cd ~/abe-guard-ai/backend
npm start
```

**If port 5000 is not in use:**
```bash
cd ~/admin-dashboard/backend
npm run dev
```

### Step 3: Check Browser Console

Open browser DevTools (F12) → Console tab and look for:

✅ **Good signs:**
- `✅ Admin realtime socket connected: [socket-id]`
- `[ADMIN axios] GET /api/admin/dashboard/live-callouts`

❌ **Error signs:**
- `❌ Admin realtime socket connect_error: connect ECONNREFUSED`
- `Network Error` or `ECONNREFUSED` in Network tab

### Step 4: Verify Service Health

**Test abe-guard-ai (port 4000):**
```bash
curl http://localhost:4000/health
# or check if server is listening
netstat -an | grep 4000
```

**Test admin-dashboard backend (port 5000):**
```bash
curl http://localhost:5000/health
# Should return: {"status":"OK"}
```

## Complete Startup Checklist

Make sure all services are running in this order:

1. ✅ **abe-guard-ai** (port 4000) - Socket.IO server
   ```bash
   cd ~/abe-guard-ai/backend && npm start
   ```

2. ✅ **admin-dashboard backend** (port 5000) - REST API
   ```bash
   cd ~/admin-dashboard/backend && npm run dev
   ```

3. ✅ **guard-ui** (port 3000) - Guard UI (optional)
   ```bash
   cd ~/guard-ui/guard-ui && npm start
   ```

4. ✅ **admin-dashboard frontend** (port 3001) - Admin UI
   ```bash
   cd ~/admin-dashboard/frontend-admin-dashboard/admin-dashboard-frontend && npm start
   ```

## Socket Connection Behavior

The socket connection will:
- ✅ **Auto-retry** if abe-guard-ai is not running (reconnection enabled)
- ⚠️ **Show errors** in console but won't crash the app
- ✅ **Work once** abe-guard-ai starts (automatic reconnection)

**Note**: The dashboard will still work with REST API calls even if socket fails. Data will update every 15 seconds via polling.

## Still Having Issues?

1. **Check firewall/antivirus** - might be blocking ports
2. **Check if ports are already in use** - another process might be using them
3. **Restart services** - sometimes a clean restart helps
4. **Check environment variables** - make sure `.env` files are correct
5. **Check database connection** - services need database access

## Port Conflicts

If a port is already in use:

**Find what's using the port:**
```bash
lsof -i :4000  # Find process using port 4000
lsof -i :5000  # Find process using port 5000
```

**Kill the process (if needed):**
```bash
kill -9 <PID>  # Replace <PID> with the process ID from lsof
```
