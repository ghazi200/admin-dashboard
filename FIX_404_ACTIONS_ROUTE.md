# Fix 404 Error for /command-center/actions

## Issue
Frontend is getting 404 when calling `/command-center/actions`

## Root Cause
The backend server needs to be restarted to pick up the new routes that were just added.

## Solution

### Step 1: Restart Backend Server
```bash
cd admin-dashboard/backend
# Stop the current server (Ctrl+C)
npm start
```

### Step 2: Verify Route is Working
The route should be accessible at:
- `GET /api/admin/command-center/actions`
- `POST /api/admin/command-center/actions/:id/approve`
- `POST /api/admin/command-center/actions/:id/reject`

### Step 3: Check Backend Logs
After restarting, you should see:
- Routes loaded successfully
- No errors about missing controllers

## Verification

The route is properly defined in:
- ✅ `backend/src/routes/adminCommandCenter.routes.js` - Route definition
- ✅ `backend/src/controllers/commandCenter.controller.js` - Controller function
- ✅ `backend/server.js` - Route registration
- ✅ `frontend/src/services/api.js` - Frontend API call
- ✅ `backend/src/models/index.js` - CommandCenterAction model exported

## Expected Behavior After Restart

1. Frontend calls `/command-center/actions`
2. Axios client adds baseURL: `/api/admin`
3. Full path: `/api/admin/command-center/actions`
4. Backend route matches and returns actions

## If Still Getting 404 After Restart

1. Check backend console for route registration errors
2. Verify `CommandCenterAction` model exists in database
3. Check if middleware is blocking the route
4. Verify authentication token is valid
