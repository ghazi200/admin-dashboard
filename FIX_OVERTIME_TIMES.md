# Fix Overtime Times Issue

## Problem
Overtime offers are showing wrong times:
- Current End: 3:00 AM (should be 5:00 PM)
- Proposed End: 4:00 AM (should be 6:00 PM)

## Root Cause
The backend server is still running with the old database connection (ghaziabdullah) instead of the correct one (abe_guard).

## Solution

### Step 1: Restart the Admin Dashboard Backend Server
**CRITICAL**: The backend server MUST be restarted for the database connection changes to take effect.

1. Stop the current backend server (Ctrl+C in the terminal where it's running)
2. Restart it:
   ```bash
   cd /Users/ghaziabdullah/admin-dashboard/backend
   npm start
   # or
   node server.js
   ```

### Step 2: Verify Database Connection
After restarting, check the server logs. You should see:
- `✅ Connected to database: abe_guard` (NOT ghaziabdullah)

### Step 3: Delete Old Incorrect Offers
Run this script to delete all incorrect offers:
```bash
cd /Users/ghaziabdullah/admin-dashboard/backend
node src/scripts/deleteWrongOvertimeOffers.js
```

### Step 4: Create New Overtime Offer
1. Refresh the admin dashboard
2. Create a new overtime offer
3. It should now show:
   - Current End: **5:00 PM** ✅
   - Proposed End: (whatever you select)

## What Was Fixed

1. ✅ **Database Connections**: All files now use `DATABASE_URL` pointing to `abe_guard`
   - `backend/src/models/index.js` - Fixed
   - `backend/src/config/db.js` - Fixed
   - All scripts - Fixed

2. ✅ **Shift End Time**: Database has correct value `17:00:00` (5 PM)

3. ✅ **Display Logic**: Guard-ui now converts UTC to local time correctly

4. ✅ **Backend Calculation**: Code correctly calculates 5 PM EST = 22:00 UTC

## Verification

After restarting, test the connection:
```bash
cd /Users/ghaziabdullah/admin-dashboard/backend
node src/scripts/verifyAllDatabaseConnections.js
```

All connections should show: `✅ CORRECT DATABASE (abe_guard)`

## If Still Not Working

If times are still wrong after restarting:
1. Check backend server logs for the DEBUG output
2. Look for: `🔍 DEBUG: Shift data from database:`
3. Verify `shift_end` shows `17:00:00`
4. Check `Calculated currentEndTime:` log - should show `utcHours: 22`
