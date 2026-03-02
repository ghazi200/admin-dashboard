# 📧 Email Setup - Alternative Methods

## Issue: App Passwords Page Not Found

If `myaccount.google.com/apppasswords` is not found, it's usually because:
1. **2-Factor Authentication (2FA) is not enabled** - Required for App Passwords
2. **Workspace/Enterprise account** - May have different settings
3. **Account type restrictions** - Some accounts don't allow App Passwords

## Solution Options

### Option 1: Enable 2FA First (Recommended)

1. Go to: https://myaccount.google.com/security
2. Find "2-Step Verification" section
3. Click "Get Started" or "Turn On"
4. Follow the setup process (phone number, authenticator app, etc.)
5. Once 2FA is enabled, go to: https://myaccount.google.com/apppasswords
6. Now you should see the App Passwords page

### Option 2: Use "Less Secure App Access" (Older Method - Not Recommended)

⚠️ **Note:** Google is phasing this out, but it might still work for some accounts.

1. Go to: https://myaccount.google.com/security
2. Look for "Less secure app access" (may not be visible)
3. Turn it ON
4. Use your regular Gmail password (not recommended for security)

### Option 3: Use OAuth2 (More Complex)

This requires setting up OAuth2 credentials in Google Cloud Console. More secure but complex.

### Option 4: Use a Different Email Provider

You can use any SMTP provider:
- **SendGrid** (Free tier: 100 emails/day)
- **Mailgun** (Free tier: 5,000 emails/month)
- **Outlook/Office 365**
- **Custom SMTP server**

## Quick Setup: SendGrid (Easiest Alternative)

1. Sign up: https://sendgrid.com (free account)
2. Get API key from dashboard
3. Update `.env`:
```env
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=apikey
SMTP_PASS=your-sendgrid-api-key-here
SMTP_FROM=techworldstarzllc@gmail.com
```

## Quick Setup: Outlook/Office 365

If you have an Outlook account:
```env
SMTP_HOST=smtp.office365.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@outlook.com
SMTP_PASS=your-outlook-password
SMTP_FROM=your-email@outlook.com
```

## Test Without Email (For Now)

You can test the report generation without email:
- Reports will still be generated
- Saved to history
- Can be downloaded manually
- Email will work once SMTP is configured
