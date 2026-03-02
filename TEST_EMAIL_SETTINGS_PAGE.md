# Testing Email Settings Page

## Quick Checks

1. **Check if you can access the page directly:**
   - Go to: `http://localhost:3001/email-scheduler-settings`
   - If you see an error, check the browser console (F12)

2. **Check your permissions:**
   - You need `users:write` permission OR `admin`/`super_admin` role
   - Check in browser console: `localStorage.getItem('adminInfo')`

3. **Check backend API:**
   - Open browser DevTools → Network tab
   - Navigate to the page
   - Look for: `GET /api/admin/email-scheduler-settings`
   - Check the response status and error message

4. **Common Issues:**

   **Issue: Sidebar link not showing**
   - **Cause**: Missing `users:write` permission
   - **Fix**: Access page directly via URL or grant permission

   **Issue: Page shows "Error loading settings"**
   - **Cause**: Backend API error or permission denied
   - **Fix**: Check backend logs and verify permissions

   **Issue: Page is blank**
   - **Cause**: React component error
   - **Fix**: Check browser console for errors

## Manual Test

1. **Start backend server** (if not running):
   ```bash
   cd backend
   npm run dev
   ```

2. **Start frontend** (if not running):
   ```bash
   cd frontend-admin-dashboard/admin-dashboard-frontend
   npm start
   ```

3. **Login as admin** with `users:write` permission

4. **Navigate to**: `http://localhost:3001/email-scheduler-settings`

5. **Expected Result**: 
   - Page loads with two sections:
     - "Scheduled Reports" section
     - "Schedule Emails to Guards" section
   - Each section has enable/disable toggle and interval input

## Debug Steps

If the page is not showing:

1. **Check browser console** (F12 → Console tab)
   - Look for any red error messages
   - Check for network errors

2. **Check Network tab** (F12 → Network tab)
   - Filter by "email-scheduler-settings"
   - Check if request is made
   - Check response status (should be 200)
   - Check response body for errors

3. **Check backend logs**
   - Look for errors related to email scheduler settings
   - Verify route is registered: `/api/admin/email-scheduler-settings`

4. **Verify database table exists**
   ```bash
   cd backend
   node src/scripts/createEmailSchedulerSettingsTable.js
   ```

## Expected API Response

**GET /api/admin/email-scheduler-settings** should return:
```json
{
  "scheduledReports": {
    "settingType": "scheduled_reports",
    "enabled": true,
    "intervalMinutes": 60,
    "runTimes": [],
    "timezone": "America/New_York"
  },
  "scheduleEmails": {
    "settingType": "schedule_emails",
    "enabled": true,
    "intervalMinutes": 360,
    "runTimes": [],
    "timezone": "America/New_York"
  }
}
```
