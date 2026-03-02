# Email Scheduler Settings Guide

## Overview

The Email Scheduler Settings feature allows you to configure automated email sending with customizable times and the ability to turn features on/off.

## Features

1. **Scheduled Reports** - Configure automatic report emailing
   - Enable/disable
   - Set check interval (in minutes)
   - Default: Runs every 60 minutes (1 hour)

2. **Schedule Emails to Guards** - Configure automatic guard schedule emails
   - Enable/disable
   - Set check interval (in minutes)
   - Default: Runs every 360 minutes (6 hours)

## How to Access

1. **Navigate to Email Settings**:
   - Click "Email Settings" in the sidebar (requires `users:write` permission)
   - Or go to: `http://localhost:3001/email-scheduler-settings`

2. **Configure Settings**:
   - Toggle "Enable Scheduled Reports" on/off
   - Set the check interval (in minutes) for scheduled reports
   - Toggle "Enable Schedule Emails" on/off
   - Set the check interval (in minutes) for schedule emails
   - Click "Save Settings" for each section

## Configuration Options

### Scheduled Reports

- **Enabled**: Toggle to enable/disable automatic scheduled report emailing
- **Check Interval**: How often the system checks for reports to send (in minutes)
  - Minimum: 1 minute
  - Recommended: 60 minutes (1 hour) or more
  - Example: 60 = checks every hour, 1440 = checks once per day

### Schedule Emails

- **Enabled**: Toggle to enable/disable automatic guard schedule emails
- **Check Interval**: How often the system checks for schedule emails to send (in minutes)
  - Minimum: 1 minute
  - Recommended: 360 minutes (6 hours) or more
  - Example: 360 = checks every 6 hours, 1440 = checks once per day

## How It Works

1. **Settings are stored in the database** (`email_scheduler_settings` table)
2. **Changes take effect immediately** - The server reloads schedulers when settings are updated
3. **Per-tenant support** - Settings can be configured per tenant (future enhancement)
4. **Real-time updates** - Changes are broadcast via Socket.IO to all connected admins

## Examples

### Example 1: Disable Scheduled Reports
1. Go to Email Scheduler Settings
2. Uncheck "Enable Scheduled Reports"
3. Click "Save Settings"
4. Scheduled reports will stop being sent automatically

### Example 2: Change Check Interval to 30 Minutes
1. Go to Email Scheduler Settings
2. Set "Check Interval" to `30` minutes
3. Click "Save Settings"
4. System will now check for reports every 30 minutes

### Example 3: Run Schedule Emails Once Per Day
1. Go to Email Scheduler Settings
2. Set "Check Interval" for Schedule Emails to `1440` (24 hours)
3. Click "Save Settings"
4. System will check for schedule emails once per day

## Technical Details

### Database Table
- **Table**: `email_scheduler_settings`
- **Fields**:
  - `setting_type`: "scheduled_reports" or "schedule_emails"
  - `enabled`: Boolean (true/false)
  - `interval_minutes`: Integer (check interval in minutes)
  - `run_times`: JSONB array (for future: specific times to run)
  - `timezone`: String (default: "America/New_York")

### API Endpoints
- **GET** `/api/admin/email-scheduler-settings` - Get current settings
- **PUT** `/api/admin/email-scheduler-settings` - Update settings
  - Body: `{ settingType, enabled, intervalMinutes, runTimes, timezone }`

### Permissions
- Requires `users:write` permission to access and modify settings

## Troubleshooting

### Settings Not Saving
- Check that you have `users:write` permission
- Check browser console for errors
- Verify backend server is running

### Schedulers Not Running
- Check server logs for scheduler status
- Verify settings are enabled in the database
- Restart the backend server if needed

### Changes Not Taking Effect
- Settings are reloaded automatically when saved
- If issues persist, restart the backend server
- Check server logs for scheduler initialization messages

## Future Enhancements

- **Specific Run Times**: Set specific times of day to run (e.g., 9:00 AM, 5:00 PM)
- **Timezone Support**: Configure timezone per setting
- **Per-Tenant Settings**: Different settings for different tenants
- **Email Templates**: Customize email templates per scheduler type
- **Notification Alerts**: Get notified when emails are sent or fail
