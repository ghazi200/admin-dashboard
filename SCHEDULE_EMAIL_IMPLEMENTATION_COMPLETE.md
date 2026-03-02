# ✅ Schedule Email Feature - Implementation Complete

## What Was Implemented

### 1. Database Tables ✅
- `schedule_email_preferences` - Stores guard email preferences
- `schedule_email_logs` - Tracks all sent emails

### 2. Models ✅
- `ScheduleEmailPreference` - Sequelize model
- `ScheduleEmailLog` - Sequelize model
- Added to `models/index.js` with associations

### 3. Services ✅
- `scheduleEmailTemplate.service.js` - Generates beautiful HTML/text email templates
- `scheduleEmail.service.js` - Core logic for sending emails and processing schedules

### 4. Controllers ✅
- `scheduleEmail.controller.js` - API endpoints for:
  - Getting/updating preferences
  - Sending emails manually
  - Bulk sending
  - Viewing email logs
  - Processing scheduled emails

### 5. Routes ✅
- `/api/admin/schedule-email/preferences` - Get all preferences
- `/api/admin/schedule-email/preferences/:guardId` - Get/update guard preference
- `/api/admin/schedule-email/send-now/:guardId` - Send email now
- `/api/admin/schedule-email/bulk-send` - Send to multiple guards
- `/api/admin/schedule-email/logs` - View email history
- `/api/admin/schedule-email/process` - Manually trigger processing

### 6. Automated Scheduler ✅
- Runs every 6 hours to check for guards who need emails
- Automatically sends emails based on frequency (weekly/bi-weekly)
- Respects guard preferences (day of week, time)

---

## How to Use

### 1. Configure Email Preferences for Guards

**Via API:**
```bash
PUT /api/admin/schedule-email/preferences/:guardId
{
  "frequency": "weekly",        // "weekly", "bi-weekly", "monthly", "never"
  "day_of_week": 1,             // 0=Sunday, 1=Monday, etc.
  "preferred_time": "09:00:00", // Time to send
  "is_active": true             // Enable/disable
}
```

### 2. Send Email Manually

**Via API:**
```bash
POST /api/admin/schedule-email/send-now/:guardId
{
  "startDate": "2024-01-15",  // Optional, defaults to today
  "endDate": "2024-01-21"     // Optional, defaults to +7 days
}
```

### 3. Send to Multiple Guards

**Via API:**
```bash
POST /api/admin/schedule-email/bulk-send
{
  "guardIds": ["uuid1", "uuid2", "uuid3"],
  "startDate": "2024-01-15",  // Optional
  "endDate": "2024-01-21"     // Optional
}
```

### 4. View Email History

**Via API:**
```bash
GET /api/admin/schedule-email/logs?guardId=uuid&limit=50&offset=0
```

---

## Email Template Features

- ✅ Beautiful HTML design (responsive, mobile-friendly)
- ✅ Plain text fallback
- ✅ Shows all shifts with date, time, location
- ✅ Summary statistics (total shifts, total hours)
- ✅ Professional formatting
- ✅ Print-friendly

---

## Automated Scheduling

The system automatically:
- ✅ Checks every 6 hours for guards who need emails
- ✅ Sends weekly emails (every 7 days)
- ✅ Sends bi-weekly emails (every 14 days)
- ✅ Respects day of week and time preferences
- ✅ Logs all email attempts (success/failure)
- ✅ Updates `last_sent_at` after successful send

---

## Next Steps

### To Test:

1. **Set up email preferences for a guard:**
   ```bash
   curl -X PUT http://localhost:5000/api/admin/schedule-email/preferences/GUARD_ID \
     -H "Authorization: Bearer YOUR_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{
       "frequency": "weekly",
       "day_of_week": 1,
       "preferred_time": "09:00:00",
       "is_active": true
     }'
   ```

2. **Manually send a test email:**
   ```bash
   curl -X POST http://localhost:5000/api/admin/schedule-email/send-now/GUARD_ID \
     -H "Authorization: Bearer YOUR_TOKEN" \
     -H "Content-Type: application/json"
   ```

3. **Check email logs:**
   ```bash
   curl http://localhost:5000/api/admin/schedule-email/logs \
     -H "Authorization: Bearer YOUR_TOKEN"
   ```

### To Enable Automated Emails:

1. Make sure email is configured in `.env`:
   ```
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   SMTP_USER=your-email@gmail.com
   SMTP_PASS=your-app-password
   SMTP_FROM=your-email@gmail.com
   ```

2. Set preferences for guards (they default to weekly on Monday at 9 AM)

3. The scheduler will automatically send emails every 6 hours

---

## Features

✅ **Weekly/Bi-weekly emails** - Automatic scheduling  
✅ **Customizable timing** - Set day of week and time  
✅ **Beautiful email templates** - HTML with plain text fallback  
✅ **Manual sending** - Send emails on-demand  
✅ **Bulk sending** - Send to multiple guards at once  
✅ **Email history** - Track all sent emails  
✅ **Error handling** - Graceful failures with logging  
✅ **Multi-tenant support** - Isolated per tenant  

---

## API Endpoints Summary

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/schedule-email/preferences` | Get all preferences |
| GET | `/api/admin/schedule-email/preferences/:guardId` | Get guard preference |
| PUT | `/api/admin/schedule-email/preferences/:guardId` | Update preference |
| POST | `/api/admin/schedule-email/send-now/:guardId` | Send email now |
| POST | `/api/admin/schedule-email/bulk-send` | Send to multiple guards |
| GET | `/api/admin/schedule-email/logs` | View email history |
| POST | `/api/admin/schedule-email/process` | Manually trigger processing |

---

## ✅ Implementation Complete!

The Schedule Email feature is now fully implemented and ready to use. Guards will automatically receive their schedules via email based on their preferences!
