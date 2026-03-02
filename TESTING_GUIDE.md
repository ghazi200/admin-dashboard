# Testing Guide for Live Callouts Fix

## Project Architecture

Your project has 3 main components:
1. **abe-guard-ai** (port 4000) - Main backend with Socket.IO for realtime events
2. **admin-dashboard** (port 5000 backend, 3001 frontend) - Admin dashboard
3. **guard-ui** (port 3000) - Guard-facing UI

## Quick Test Steps

### 1. Start abe-guard-ai (Socket.IO Server - Port 4000)
```bash
cd ~/abe-guard-ai/backend
npm start
# or if you have a dev script:
npm run dev
```

The server should start on port 4000. Look for:
- ✅ Server running on port 4000
- ✅ Socket.IO ready

**Note**: This is where `callout_started`, `callout_response`, and `shift_filled` socket events are emitted.

### 2. Start Admin Dashboard Backend (Port 5000)
```bash
cd ~/admin-dashboard/backend
npm run dev
# or
npm start
```

The backend should start on port 5000. Look for:
- ✅ "Admin Dashboard backend running on port 5000"
- ✅ "Sequelize synced"

### 3. Start Admin Dashboard Frontend (Port 3001)
```bash
cd ~/admin-dashboard/frontend-admin-dashboard/admin-dashboard-frontend
npm start
```

The frontend should start on port 3001 (3000 is usually taken by guard-ui).

### 4. Start Guard UI (Port 3000)
```bash
cd ~/guard-ui/guard-ui
npm start
```

This is the guard-facing UI. Guards use this to:
- View their shifts
- Create callouts
- Update availability
- Respond to callouts

**Note**: Guard UI proxies to abe-guard-ai (port 4000) for API calls.

### 5. Test the Live Callouts Endpoint

**Option A: Test via Browser Console**
1. Open the dashboard in your browser
2. Open Developer Tools (F12)
3. Go to the Network tab
4. Look for requests to `/api/admin/dashboard/live-callouts`
5. Check the response - it should have `{ data: [...] }` structure

**Option B: Test via curl/Postman**
```bash
# Get your admin token first (from localStorage or login)
curl -X GET http://localhost:5000/api/admin/dashboard/live-callouts \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json"
```

Expected response structure:
```json
{
  "data": [
    {
      "id": 1,
      "guardId": 123,
      "guardName": "John Doe",
      "reason": "SMS",
      "contactType": "SMS",
      "active": true,
      "timestamp": "2024-01-01T00:00:00.000Z",
      "createdAt": "2024-01-01T00:00:00.000Z"
    }
  ]
}
```

### 6. Check Browser Console

Look for these logs:
- ✅ "Admin realtime socket connected: [socket-id]"
- ✅ "🔄 Refreshing all dashboard queries..." (when socket events fire)
- ✅ "📡 callout_started", "📡 callout_response", etc. (if socket events are working)

### 7. Verify Dashboard Updates

1. The "Live Callouts" card should display the count correctly
2. The list should show guard names and reasons
3. Data should refresh every 15 seconds (polling fallback)
4. If socket events work, updates should be instant

## What to Look For

✅ **Success Indicators:**
- Live callouts count displays correctly
- Guard names appear in the list (not "Unknown Guard")
- Data structure matches: `{ data: [...] }`
- No console errors related to callouts
- Dashboard updates automatically

❌ **Issues to Watch For:**
- "Failed to load live callouts" errors
- Empty array when callouts exist
- "Unknown Guard" for all entries (association issue)
- Socket connection errors - check that abe-guard-ai is running on port 4000
- CORS errors - ensure all services are running

## Rollback Instructions

If you need to undo the changes:

```bash
# Revert backend changes
cd backend
git checkout src/controllers/adminDashboard.controllers.js
git checkout src/models/index.js

# Revert frontend changes
cd frontend-admin-dashboard/admin-dashboard-frontend
git checkout src/pages/Dashboard.jsx
```

Or use your IDE's undo feature (Cmd+Z / Ctrl+Z).

## Testing Socket Events

The socket events (`callout_started`, `callout_response`, `shift_filled`) are emitted from **abe-guard-ai** (port 4000).

### To Test Socket Events:
1. Ensure **abe-guard-ai** is running on port 4000
2. Create a new callout (through guard-ui or directly in the database)
3. Watch the browser console in admin-dashboard for:
   - ✅ "📡 callout_started" or "📡 callout_response"
   - ✅ "🔄 Refreshing all dashboard queries..."
4. Verify the dashboard updates immediately (not waiting 15 seconds)

### If Socket Events Don't Work:
- Check that abe-guard-ai is running on port 4000
- Check browser console for socket connection errors
- The 15-second polling fallback will still keep data updated

## Service Startup Order (Recommended)

Start services in this order for best results:

1. **abe-guard-ai** (port 4000) - Socket.IO server & main backend
   - Must start first - other services depend on it
   - Emits socket events for callouts

2. **admin-dashboard backend** (port 5000) - Admin REST API
   - Provides admin dashboard data
   - Connects to same database as abe-guard-ai

3. **guard-ui** (port 3000) - Guard-facing UI
   - Guards use this to create callouts
   - Proxies API calls to abe-guard-ai (port 4000)

4. **admin-dashboard frontend** (port 3001) - Admin UI
   - Admin dashboard for viewing/managing callouts
   - Connects to admin-dashboard backend (port 5000) for REST API
   - Connects to abe-guard-ai (port 4000) for Socket.IO events

## Quick Test Script

You can test the API directly without starting all services:

```bash
# Test admin-dashboard backend (make sure it's running)
curl http://localhost:5000/health

# Test live callouts endpoint (need admin token)
curl -X GET http://localhost:5000/api/admin/dashboard/live-callouts \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```
