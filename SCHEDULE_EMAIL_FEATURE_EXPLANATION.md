# 📧 Schedule Email Feature - Explanation

## Overview

This feature will automatically email guards their work schedules on a weekly or bi-weekly basis. Guards will receive a beautifully formatted email with their upcoming shifts, making it easy for them to plan ahead.

---

## 🎯 What It Does

### Core Functionality:
1. **Automated Schedule Emails**
   - Sends personalized schedule emails to each guard
   - Weekly or bi-weekly frequency (configurable per guard or tenant)
   - Includes all assigned shifts for the upcoming period

2. **Email Content Includes:**
   - Guard's name and personalized greeting
   - Schedule period (e.g., "Week of Jan 15-21, 2024")
   - List of all assigned shifts with:
     - Date and day of week
     - Start and end times
     - Location
     - Shift status
   - Summary statistics (total hours, number of shifts)
   - Visual calendar view (optional)
   - Contact information for questions

3. **Smart Scheduling:**
   - Automatically determines which guards need emails
   - Respects guard preferences (opt-in/opt-out)
   - Handles schedule changes (sends updates if needed)
   - Tracks email delivery status

---

## 🏗️ Technical Architecture

### Backend Components:

#### 1. **Database Tables**
   - `schedule_email_preferences` table:
     - `id` (UUID)
     - `guard_id` (UUID) - Foreign key to guards
     - `tenant_id` (UUID) - For multi-tenant support
     - `frequency` (ENUM: 'weekly', 'bi-weekly', 'monthly', 'never')
     - `day_of_week` (INTEGER: 0-6, Sunday=0) - When to send weekly emails
     - `day_of_month` (INTEGER: 1-28) - For monthly emails
     - `preferred_time` (TIME) - Time of day to send (e.g., "09:00")
     - `is_active` (BOOLEAN) - Enable/disable for this guard
     - `last_sent_at` (TIMESTAMP) - Track last email sent
     - `created_at`, `updated_at`

   - `schedule_email_logs` table:
     - `id` (UUID)
     - `guard_id` (UUID)
     - `tenant_id` (UUID)
     - `email_sent_at` (TIMESTAMP)
     - `schedule_period_start` (DATE)
     - `schedule_period_end` (DATE)
     - `shifts_count` (INTEGER)
     - `email_status` (ENUM: 'sent', 'failed', 'pending')
     - `error_message` (TEXT) - If failed
     - `email_subject` (STRING)
     - `created_at`

#### 2. **Services**

   **`scheduleEmail.service.js`**
   - `generateGuardSchedule(guardId, startDate, endDate)` - Get all shifts for a guard in date range
   - `formatScheduleForEmail(guard, shifts, period)` - Format schedule data for email template
   - `sendScheduleEmail(guard, scheduleData)` - Send email using email service
   - `processScheduledEmails()` - Main function to process all due emails
   - `calculateNextSendDate(frequency, lastSent)` - Calculate when next email should be sent

   **`scheduleEmailTemplate.service.js`**
   - `generateHTMLTemplate(guard, shifts, period)` - Generate beautiful HTML email
   - `generateTextTemplate(guard, shifts, period)` - Plain text fallback
   - `formatShiftRow(shift)` - Format individual shift for display

#### 3. **Controllers**

   **`scheduleEmail.controller.js`**
   - `GET /api/admin/schedule-email/preferences` - Get guard email preferences
   - `PUT /api/admin/schedule-email/preferences/:guardId` - Update preferences
   - `POST /api/admin/schedule-email/send-now/:guardId` - Manually trigger email
   - `GET /api/admin/schedule-email/logs` - View email history
   - `POST /api/admin/schedule-email/bulk-send` - Send to multiple guards

#### 4. **Cron Job / Scheduler**

   - Runs daily (or hourly) to check for guards who need schedule emails
   - Checks `schedule_email_preferences` for active guards
   - Calculates if it's time to send based on frequency and last sent date
   - Processes and sends emails in batches
   - Logs all email attempts

---

## 📧 Email Template Design

### HTML Email Structure:

```
┌─────────────────────────────────────┐
│  [Company Logo]                     │
│                                     │
│  Hi [Guard Name],                   │
│                                     │
│  Your schedule for the week of     │
│  [Start Date] - [End Date]         │
│                                     │
│  ┌───────────────────────────────┐ │
│  │ 📅 Your Shifts                │ │
│  ├───────────────────────────────┤ │
│  │ Mon, Jan 15                    │ │
│  │ 🕐 7:00 AM - 3:00 PM           │ │
│  │ 📍 Main Gate                   │ │
│  ├───────────────────────────────┤ │
│  │ Tue, Jan 16                    │ │
│  │ 🕐 3:00 PM - 11:00 PM          │ │
│  │ 📍 Patrol Route A              │ │
│  └───────────────────────────────┘ │
│                                     │
│  📊 Summary:                        │
│  • 5 shifts this week              │
│  • 40 total hours                  │
│                                     │
│  Questions? Contact:                │
│  [Admin Email] or [Admin Phone]    │
│                                     │
│  [Unsubscribe Link]                 │
└─────────────────────────────────────┘
```

### Features:
- **Responsive Design** - Works on mobile and desktop
- **Color-coded** - Different colors for different days
- **Calendar View** - Optional visual calendar
- **Print-friendly** - Can be printed for reference
- **Accessibility** - Proper HTML structure for screen readers

---

## ⚙️ Configuration Options

### Per Guard:
- **Frequency**: Weekly, Bi-weekly, Monthly, Never
- **Day of Week**: Which day to send (e.g., Monday mornings)
- **Time**: What time to send (e.g., 9:00 AM)
- **Active/Inactive**: Enable or disable emails

### Per Tenant (Admin Settings):
- **Default Frequency**: Set default for all guards
- **Default Send Day**: Default day of week
- **Default Send Time**: Default time
- **Email Template**: Customize email template
- **Include Unassigned Shifts**: Show open shifts they could pick up

---

## 🔄 How It Works

### Weekly Schedule:
1. **Every Monday at 9:00 AM** (or configured time):
   - System checks all guards with `frequency = 'weekly'`
   - Finds guards who haven't received email in 7 days
   - Generates schedule for next 7 days (or configured period)
   - Sends personalized email to each guard

### Bi-Weekly Schedule:
1. **Every other Monday at 9:00 AM**:
   - System checks guards with `frequency = 'bi-weekly'`
   - Finds guards who haven't received email in 14 days
   - Generates schedule for next 14 days
   - Sends email

### Manual Trigger:
- Admin can manually send schedule email to any guard
- Useful for schedule changes or new guard onboarding

---

## 📊 Admin Dashboard Features

### Schedule Email Management Page:
- **View All Guards** - List of all guards with email preferences
- **Bulk Actions** - Enable/disable emails for multiple guards
- **Email History** - See when emails were sent, delivery status
- **Test Email** - Send test email to verify template
- **Settings** - Configure default preferences

### Features:
- ✅ See which guards have emails enabled
- ✅ View last email sent date
- ✅ See email delivery status (sent/failed)
- ✅ Manually trigger emails
- ✅ Update preferences in bulk
- ✅ Export email logs

---

## 🎨 User Experience

### For Guards:
1. **Receive Email** - Get schedule email automatically
2. **Easy to Read** - Clean, organized format
3. **Mobile Friendly** - View on phone
4. **Printable** - Print for reference
5. **Unsubscribe** - Option to opt-out

### For Admins:
1. **Set It and Forget It** - Configure once, runs automatically
2. **Monitor Status** - See delivery logs
3. **Flexible** - Per-guard or bulk configuration
4. **Manual Override** - Send emails anytime

---

## 🔒 Security & Privacy

- **Email Validation** - Only send to valid email addresses
- **Opt-in/Opt-out** - Guards can disable emails
- **Tenant Isolation** - Only send to guards in same tenant
- **Rate Limiting** - Prevent email spam
- **Error Handling** - Graceful failures, retry logic

---

## 📈 Benefits

### For Guards:
- ✅ Never miss a shift
- ✅ Plan ahead with advance notice
- ✅ Easy reference (save email, print it)
- ✅ Professional communication

### For Admins:
- ✅ Reduce "when is my shift?" questions
- ✅ Improve guard satisfaction
- ✅ Professional image
- ✅ Automated communication
- ✅ Track who received schedules

---

## 🚀 Implementation Plan

### Phase 1: Core Functionality
1. Create database tables
2. Build email template service
3. Create schedule email service
4. Add cron job for automated sending
5. Basic API endpoints

### Phase 2: Admin Interface
1. Schedule email preferences page
2. Email history/logs page
3. Bulk actions
4. Settings page

### Phase 3: Enhancements
1. Custom email templates
2. Calendar view in email
3. SMS notifications (optional)
4. Schedule change notifications
5. Analytics dashboard

---

## 💡 Example Use Cases

1. **Weekly Schedule**: Every Monday, guards receive their schedule for the upcoming week
2. **Bi-Weekly Schedule**: Every other Monday, guards receive their schedule for the next 2 weeks
3. **New Guard Onboarding**: Admin manually sends first schedule email
4. **Schedule Change**: Admin manually sends updated schedule when changes occur
5. **Bulk Communication**: Admin sends schedule to all guards at once

---

## 🔧 Technical Details

### Email Service Integration:
- Uses existing `email.service.js` (already configured for reports)
- Supports HTML and plain text
- Handles email failures gracefully
- Retry logic for failed sends

### Performance:
- Batch processing (send multiple emails efficiently)
- Queue system (optional, for large deployments)
- Rate limiting (respect email provider limits)
- Async processing (don't block main thread)

### Dependencies:
- Existing: `email.service.js`, `nodemailer`
- New: `scheduleEmail.service.js`, `scheduleEmailTemplate.service.js`
- Database: New tables for preferences and logs

---

## ❓ Questions to Consider

1. **Default Frequency**: Should all guards get weekly emails by default, or opt-in?
2. **Schedule Period**: Show next 7 days, 14 days, or full month?
3. **Include Open Shifts**: Should emails include unassigned shifts guards could pick up?
4. **Schedule Changes**: Send update emails when shifts change?
5. **Multi-language**: Support different languages for emails?

---

## ✅ Ready to Implement?

This feature will:
- ✅ Improve guard communication
- ✅ Reduce admin workload
- ✅ Professionalize operations
- ✅ Increase guard satisfaction
- ✅ Provide audit trail

**Would you like me to proceed with implementation?**
