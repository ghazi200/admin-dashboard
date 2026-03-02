# Debugging Super Admin Dashboard - Data Not Showing

## Quick Checks

1. **Open Browser Console (F12)**
   - Check Console tab for errors
   - Look for "📊 Super Admin Dashboard Data Status" log
   - Check Network tab for API requests to `/api/super-admin/*`

2. **Verify Authentication**
   - Check Application tab → Local Storage → `adminToken`
   - Token should exist and be valid
   - If expired, log out and log back in

3. **Check Backend Server**
   - Ensure backend is running on port 5000
   - Check terminal for errors
   - Verify routes are registered: `/api/super-admin/*`

4. **Check User Role**
   - User must have `role: "super_admin"` in database
   - Check JWT token payload for role

## Common Issues

### Issue 1: "Invalid or expired token"
**Solution**: Log out and log back in as super-admin

### Issue 2: "Super-admin access required"
**Solution**: User role is not `super_admin`. Update in database:
```sql
UPDATE admins SET role = 'super_admin' WHERE email = 'your-email@example.com';
```

### Issue 3: API returns 404
**Solution**: Check backend routes are registered in `server.js`:
```javascript
app.use("/api/super-admin", superAdminRoutes);
```

### Issue 4: CORS errors
**Solution**: Check backend CORS configuration allows frontend origin

### Issue 5: Data loads but doesn't display
**Solution**: Check browser console for React errors or rendering issues

## Debug Steps

1. **Check Network Tab**
   - Open DevTools → Network
   - Filter by "super-admin"
   - Check request status codes:
     - 200 = Success
     - 401 = Auth error
     - 403 = Permission error
     - 404 = Route not found
     - 500 = Server error

2. **Check Console Logs**
   - Look for:
     - `🔄 Fetching tenants...`
     - `✅ Tenants fetched: X`
     - `❌ Error fetching tenants: ...`

3. **Check Data Structure**
   - In console, type:
     ```javascript
     // Check if data exists
     console.log(window.__REACT_QUERY_STATE__);
     ```

4. **Manual API Test**
   - In browser console:
     ```javascript
     const token = localStorage.getItem('adminToken');
     fetch('http://localhost:5000/api/super-admin/tenants', {
       headers: { 'Authorization': `Bearer ${token}` }
     })
     .then(r => r.json())
     .then(console.log)
     .catch(console.error);
     ```

## Expected Behavior

1. **On Load**:
   - Shows "Loading super-admin dashboard data..." briefly
   - Then displays:
     - Summary cards (Total Tenants, Guards, Revenue, Incidents)
     - Charts (Incidents by Status, Plans Distribution)
     - Tenant cards with details
     - Company rankings table

2. **If No Data**:
   - Shows "No tenants found" message
   - Shows 0 for all metrics

3. **If Error**:
   - Shows error message with details
   - Shows "Retry" button

## Files to Check

- `frontend-admin-dashboard/admin-dashboard-frontend/src/pages/SuperAdminDashboard.jsx`
- `frontend-admin-dashboard/admin-dashboard-frontend/src/services/superAdmin.js`
- `frontend-admin-dashboard/admin-dashboard-frontend/src/api/superAdminClient.js` (if exists)
- `backend/src/routes/superAdmin.routes.js`
- `backend/src/controllers/superAdmin.controller.js`
- `backend/src/middleware/requireSuperAdmin.js`

## Next Steps

If data still doesn't show:
1. Share browser console errors
2. Share network tab request/response details
3. Share backend terminal logs
4. Verify test data exists in database
