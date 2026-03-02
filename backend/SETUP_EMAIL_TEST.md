# 📧 Setup Email Test - Quick Guide

## Step 1: Get Gmail App Password

1. Go to: https://myaccount.google.com/apppasswords
2. Sign in with: `techworldstarzllc@gmail.com`
3. Select:
   - App: "Mail"
   - Device: "Other (Custom name)"
   - Name: "Admin Dashboard Reports"
4. Click "Generate"
5. Copy the 16-character password (looks like: `abcd efgh ijkl mnop`)

## Step 2: Update .env File

Open `backend/.env` and replace `YOUR_APP_PASSWORD_HERE` with your App Password:

```env
SMTP_PASS=abcd efgh ijkl mnop  # Your actual App Password here
```

**Important:** Remove spaces or keep them - both work, but be consistent.

## Step 3: Restart Backend Server

```bash
# Kill existing server
lsof -ti:5000 | xargs kill -9

# Start server
cd backend
npm start
```

## Step 4: Run Test

Once the server is running, you can:

**Option A: Run test script**
```bash
cd backend
node src/scripts/testScheduledReportEmail.js
```

**Option B: Use the UI**
1. Go to Reports page → "Scheduled" tab
2. Find "Test Report for Ghazi - Weekly"
3. Click "▶️ Run Now"
4. Check email inbox: `techworldstarzllc@gmail.com`

## Expected Result

✅ Email should arrive with:
- Subject: "Test Report: Weekly Summary for Ghazi"
- PDF attachment with the test report
- Custom message you configured

## Troubleshooting

**If email doesn't send:**
- Check server logs for errors
- Verify App Password is correct (no typos)
- Check spam folder
- Make sure 2FA is enabled on Gmail account

**Common Errors:**
- "Invalid login" → Wrong App Password
- "Connection timeout" → Check SMTP_HOST and SMTP_PORT
- "Authentication failed" → Make sure you're using App Password, not regular password
