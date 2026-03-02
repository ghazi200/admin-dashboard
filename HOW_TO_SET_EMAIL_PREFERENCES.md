# 📧 How to Set Schedule Email Preferences for Guards

## Location

**Guards Page** → Click the **"📧 Email"** button next to any guard

## Steps

### 1. Navigate to Guards Page
- Go to: http://localhost:3001/guards
- Or click "Guards" in the sidebar

### 2. Find the Guard
- Use the search box to find a guard
- Or scroll through the list

### 3. Click the Email Button
- Look for the **"📧 Email"** button in the actions column
- It's next to "Edit", "History", and "Delete" buttons

### 4. Configure Preferences
In the modal that opens, you can set:

- **Email Frequency:**
  - Weekly (every 7 days)
  - Bi-Weekly (every 14 days)
  - Monthly
  - Never (disabled)

- **Day of Week:**
  - Choose which day to send (Sunday through Saturday)
  - Only applies to Weekly and Bi-Weekly

- **Preferred Time:**
  - Set the time of day to send (e.g., 9:00 AM)
  - Uses 24-hour format

- **Enable/Disable:**
  - Toggle to enable or disable emails for this guard

### 5. Save Preferences
- Click **"Save Preferences"** button
- Preferences are saved immediately

### 6. Send Test Email (Optional)
- Click **"📧 Send Test Email"** button
- Sends an email immediately to test the template
- Great for verifying the guard's email address works

## Requirements

- Guard must have an email address
- If no email, you'll see a warning message
- Add email address in the guard's profile first

## What Happens Next

Once preferences are set:
- ✅ System automatically sends emails based on frequency
- ✅ Emails are sent on the specified day and time
- ✅ All emails are logged in the system
- ✅ Guards receive beautiful HTML emails with their schedules

## Example Settings

**Weekly Schedule:**
- Frequency: Weekly
- Day: Monday
- Time: 09:00
- Active: ✅ Enabled

**Bi-Weekly Schedule:**
- Frequency: Bi-Weekly
- Day: Monday
- Time: 09:00
- Active: ✅ Enabled

## Troubleshooting

**Button not showing?**
- Make sure you have `guards:read` permission
- Refresh the page

**Can't save preferences?**
- Check browser console for errors
- Verify guard has an email address
- Check backend is running on port 5000

**Email not sending?**
- Check SMTP configuration in backend `.env`
- Verify guard's email address is correct
- Check email logs in backend console

## API Alternative

You can also set preferences via API:

```bash
PUT /api/admin/schedule-email/preferences/:guardId
{
  "frequency": "weekly",
  "day_of_week": 1,
  "preferred_time": "09:00:00",
  "is_active": true
}
```
