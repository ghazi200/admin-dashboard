# 🔍 Dashboard Error Debugging Guide

## Error: "Failed to load dashboard"

### Quick Checks:

1. **Backend Server Restart Required**
   ```bash
   cd ~/abe-guard-ai/backend
   # Stop the current server (Ctrl+C)
   # Then restart:
   npm start
   # or
   npm run dev
   ```

2. **Check Browser Console**
   - Open DevTools (F12) → Console tab
   - Look for the detailed error message
   - Check Network tab → Find `/api/guard/dashboard` request
   - Check the response status and error message

3. **Verify Route is Mounted**
   ```bash
   cd ~/abe-guard-ai/backend
   grep -n "guardDashboard" src/app.js
   # Should show: app.use("/api/guard/dashboard", ...)
   ```

4. **Check Backend Logs**
   - Look for errors in the backend console
   - Check for database connection issues
   - Verify guard authentication is working

### Common Issues:

#### Issue 1: Route Not Found (404)
**Symptom**: Network tab shows 404 error
**Solution**: Restart backend server to load new route

#### Issue 2: Authentication Error (401)
**Symptom**: "Unauthorized" or "missing guardId"
**Solution**: 
- Check that guard is logged in
- Verify `guardToken` exists in localStorage
- Try logging out and back in

#### Issue 3: Database Error (500)
**Symptom**: "Server error" or database-related error
**Solution**:
- Check database connection
- Verify tables exist: `shifts`, `time_entries`, `callouts`
- Check backend logs for SQL errors

#### Issue 4: Missing guardId
**Symptom**: "Unauthorized - missing guardId"
**Solution**:
- Check `guardAuth` middleware is setting `req.user.guardId`
- Verify JWT token contains `guardId` field

### Testing the Endpoint Directly:

```bash
# Get guard token from browser console:
# localStorage.getItem('guardToken')

# Test endpoint:
curl -X GET http://localhost:4000/api/guard/dashboard \
  -H "Authorization: Bearer YOUR_GUARD_TOKEN" \
  -H "Content-Type: application/json"
```

### Expected Response:

```json
{
  "upcomingShifts": [...],
  "performance": {
    "reliabilityScore": 95.5,
    "onTimePercentage": 92.0,
    "calloutRate": 3.2,
    "completionRate": 98.0,
    "overallScore": 92.0
  },
  "earnings": {
    "thisWeek": { "hours": 40.0 },
    "thisMonth": { "hours": 160.0 },
    "totalHours": 1200.0,
    "upcoming": { "hours": 24.0 }
  },
  "achievements": {
    "earned": [...],
    "inProgress": [...]
  },
  "streaks": {
    "attendance": 7,
    "onTime": 5,
    "noCallouts": 30
  }
}
```

### Next Steps:

1. **Restart backend server** (most likely fix)
2. **Check browser console** for detailed error
3. **Check backend logs** for server errors
4. **Verify authentication** is working
5. **Test endpoint directly** with curl
