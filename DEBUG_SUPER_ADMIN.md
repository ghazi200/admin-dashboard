# 🔍 Debugging Super-Admin Dashboard - No Data Showing

## Quick Checks

### 1. Verify Backend is Running
```bash
curl http://localhost:5000/health
```
Should return: `{"status":"OK"}`

### 2. Check Database Has Data
```bash
cd backend
node -e "
require('dotenv').config();
const { Sequelize } = require('sequelize');
const sequelize = new Sequelize(process.env.DB_NAME, process.env.DB_USER, process.env.DB_PASS, {
  host: process.env.DB_HOST,
  dialect: 'postgres',
  logging: false
});
Promise.all([
  sequelize.query('SELECT COUNT(*) as count FROM tenants'),
  sequelize.query('SELECT COUNT(*) as count FROM guards'),
  sequelize.query('SELECT COUNT(*) as count FROM incidents')
]).then(([[tenants], [guards], [incidents]]) => {
  console.log('Tenants:', tenants[0].count);
  console.log('Guards:', guards[0].count);
  console.log('Incidents:', incidents[0].count);
  sequelize.close();
});
"
```

### 3. Check Browser Console
Open browser DevTools (F12) and check:
- Network tab: Are API calls being made?
- Console tab: Any errors?
- Look for logs like:
  - "🔄 Fetching tenants..."
  - "✅ Tenants fetched: X"
  - "❌ Error fetching tenants: ..."

### 4. Verify Authentication
- Make sure you're logged in as super-admin
- Check localStorage: `localStorage.getItem('adminToken')` should exist
- Check localStorage: `localStorage.getItem('adminUser')` should have `role: "super_admin"`

### 5. Test API Directly
```bash
# Get your token from browser localStorage, then:
curl -H "Authorization: Bearer YOUR_TOKEN" http://localhost:5000/api/super-admin/tenants
```

## Common Issues

### Issue 1: CORS Error
**Symptom**: Browser console shows CORS error
**Fix**: Make sure backend CORS allows your frontend origin

### Issue 2: 401 Unauthorized
**Symptom**: API returns 401
**Fix**: 
- Make sure you're logged in
- Token might be expired - try logging out and back in
- Verify token is being sent in Authorization header

### Issue 3: 403 Forbidden
**Symptom**: API returns 403
**Fix**: 
- Verify your user has `role = 'super_admin'` in database
- Check: `SELECT email, role FROM admins WHERE email = 'your-email@example.com'`

### Issue 4: Network Error / Connection Refused
**Symptom**: Cannot connect to server
**Fix**: 
- Make sure backend is running: `cd backend && npm start`
- Check backend is on port 5000
- Check firewall/network settings

### Issue 5: Data Structure Mismatch
**Symptom**: Data loads but doesn't display
**Fix**: 
- Check browser console for data structure
- Verify `response.data` contains the expected format
- Check React Query cache in DevTools

## Testing the Fix

After fixing the API client, you should see:
1. Browser console logs showing data being fetched
2. Data appearing in the dashboard
3. No error messages in console

If still not working, check:
- Backend logs for errors
- Network tab in browser DevTools
- React Query DevTools (if installed)
