# 📧 Email Configuration for Scheduled Reports

## Overview

The scheduled reports feature can automatically email reports to staff members at the configured time (daily, weekly, or monthly).

## Setup Instructions

### 1. Add Email Configuration to `.env`

Add these variables to your `backend/.env` file:

```env
# Email Configuration (for scheduled reports)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM=your-email@gmail.com
```

### 2. Gmail Setup (Most Common)

If using Gmail:

1. **Enable 2-Factor Authentication** on your Google account FIRST:
   - Go to: https://myaccount.google.com/security
   - Find "2-Step Verification"
   - Click "Get Started" or "Turn On"
   - Follow the setup process (phone number, authenticator app, etc.)
   - Complete the setup

2. **Generate an App Password** (only available after 2FA is enabled):
   - Go to: https://myaccount.google.com/apppasswords
   - Select "Mail" and "Other (Custom name)"
   - Enter "Admin Dashboard Reports"
   - Copy the 16-character password

3. **Use the App Password** as `SMTP_PASS` (not your regular Gmail password)

⚠️ **If App Passwords page is not found:**
- Make sure 2FA is enabled first (see step 1 above)
- Some workspace/enterprise accounts may have restrictions
- See `EMAIL_SETUP_ALTERNATIVES.md` for other options

**Example:**
```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=admin@yourcompany.com
SMTP_PASS=abcd efgh ijkl mnop  # Your 16-char app password
SMTP_FROM=admin@yourcompany.com
```

### 3. Other Email Providers

#### Outlook/Office 365
```env
SMTP_HOST=smtp.office365.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@outlook.com
SMTP_PASS=your-password
SMTP_FROM=your-email@outlook.com
```

#### SendGrid
```env
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=apikey
SMTP_PASS=your-sendgrid-api-key
SMTP_FROM=noreply@yourcompany.com
```

#### Custom SMTP Server
```env
SMTP_HOST=mail.yourcompany.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=reports@yourcompany.com
SMTP_PASS=your-password
SMTP_FROM=reports@yourcompany.com
```

### 4. Test Email Configuration

After adding the configuration:

1. Restart your backend server
2. Create a scheduled report with email recipients
3. Click "Run Now" to test immediately
4. Check server logs for email sending status

## How It Works

1. **Automatic Scheduling**: The cron job runs every hour and checks for scheduled reports that are due
2. **Report Generation**: When due, the system:
   - Generates the report from the template
   - Exports in the requested format(s) (PDF, Excel, CSV, HTML)
   - Saves the report run to history
3. **Email Delivery**: If email recipients are configured:
   - Attaches the report file(s) to the email
   - Sends to all recipients
   - Uses custom subject and message if provided
4. **Next Run Calculation**: Automatically calculates the next run time based on frequency

## Troubleshooting

### Email Not Sending

1. **Check server logs** for email errors
2. **Verify SMTP credentials** are correct
3. **Test with "Run Now"** button to see immediate errors
4. **Check spam folder** - emails might be filtered

### Common Errors

- **"Invalid login"**: Wrong SMTP_USER or SMTP_PASS
- **"Connection timeout"**: Wrong SMTP_HOST or SMTP_PORT
- **"Authentication failed"**: For Gmail, make sure you're using an App Password, not your regular password

### Email Not Configured

If email is not configured, scheduled reports will still:
- ✅ Generate automatically
- ✅ Save to history
- ❌ Skip email sending (logs a warning)

## Security Notes

- **Never commit `.env` file** to version control
- **Use App Passwords** for Gmail (not your main password)
- **Restrict SMTP access** to trusted IPs if possible
- **Use environment-specific credentials** (dev vs production)
