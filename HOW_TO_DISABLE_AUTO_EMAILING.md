# How to Turn Off Auto Report Emailing

There are two types of automated emailing in the system:

1. **Scheduled Reports** - Automatically sends scheduled reports via email (runs every hour)
2. **Schedule Emails** - Automatically sends guard schedule emails (runs every 6 hours)

## Method 1: Using Environment Variables (Recommended)

Add these environment variables to your `.env` file in the `backend` directory:

```bash
# Disable scheduled reports emailing
ENABLE_SCHEDULED_REPORTS=false

# Disable schedule emails to guards
ENABLE_SCHEDULE_EMAILS=false
```

### Steps:

1. **Open your `.env` file** in the `backend` directory:
   ```bash
   cd backend
   nano .env  # or use your preferred editor
   ```

2. **Add the following lines**:
   ```bash
   # Disable automated emailing
   ENABLE_SCHEDULED_REPORTS=false
   ENABLE_SCHEDULE_EMAILS=false
   ```

3. **Restart the backend server**:
   ```bash
   # Stop the current server (Ctrl+C)
   npm run dev  # or node server.js
   ```

4. **Verify it's disabled**:
   - Check the server logs when it starts
   - You should see: `⚠️  Scheduled reports emailing is DISABLED`
   - You should see: `⚠️  Schedule emails are DISABLED`

## Method 2: Disable Individual Scheduled Reports

You can also disable individual scheduled reports without turning off the entire system:

1. **Go to Report Builder** in the admin dashboard
2. **Navigate to "Scheduled Reports"**
3. **Edit or delete** the scheduled reports you don't want to run
4. **Or set their frequency to "never"**

## Method 3: Disable Schedule Emails Per Guard

You can disable schedule emails for specific guards:

1. **Go to Guards page**
2. **Click the "Email" button** next to a guard
3. **Set frequency to "never"** or uncheck "Active"
4. **Save**

## What Gets Disabled

### When `ENABLE_SCHEDULED_REPORTS=false`:
- ❌ Automatic scheduled report generation and emailing
- ✅ Manual report generation still works
- ✅ Manual "Run Now" for scheduled reports still works

### When `ENABLE_SCHEDULE_EMAILS=false`:
- ❌ Automatic schedule emails to guards (weekly/bi-weekly)
- ✅ Manual "Send Now" schedule emails still work
- ✅ Guard schedule email preferences are still saved

## Re-enabling

To re-enable automated emailing:

1. **Remove the environment variables** or set them to `true`:
   ```bash
   ENABLE_SCHEDULED_REPORTS=true
   ENABLE_SCHEDULE_EMAILS=true
   ```

2. **Or simply remove the lines** from `.env`

3. **Restart the server**

## Verification

After restarting, check the server console output:

**When disabled:**
```
⚠️  Scheduled reports emailing is DISABLED (ENABLE_SCHEDULED_REPORTS=false)
⚠️  Schedule emails are DISABLED (ENABLE_SCHEDULE_EMAILS=false)
```

**When enabled (default):**
```
✅ Report scheduler cron job started (runs every hour)
✅ Schedule email scheduler started (runs every 6 hours)
```

## Notes

- The environment variables default to `true` if not set (emailing is enabled by default)
- Manual email sending via the UI is not affected by these settings
- Individual guard preferences and scheduled report settings are preserved in the database
- You can re-enable at any time by changing the environment variables
