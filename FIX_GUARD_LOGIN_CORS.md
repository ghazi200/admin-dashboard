# Fix Guard Login CORS Issue

## Problem
Guard login at `http://localhost:4000/auth/login` was failing with CORS error:
```
XMLHttpRequest cannot load http://localhost:4000/auth/login due to access control checks.
```

## Solution Applied
Updated CORS configuration in `/Users/ghaziabdullah/abe-guard-ai/backend/src/app.js` to:
1. Allow localhost on any port in development mode
2. Add better logging for debugging
3. Support both `localhost` and `127.0.0.1` formats
4. Allow `X-Requested-With` header

## Steps to Fix

1. **Restart abe-guard-ai backend:**
   ```bash
   cd /Users/ghaziabdullah/abe-guard-ai/backend
   npm start
   ```

2. **Verify CORS is working:**
   - Check backend console for CORS logs: `🔍 CORS request from origin: ...`
   - Should see: `✅ CORS: Allowing origin: ...`

3. **Test guard login:**
   - Open guard UI (usually http://localhost:3000)
   - Try logging in with `bob@abe.com`
   - Check browser console - should no longer see CORS errors

## If Still Not Working

1. **Check what port guard UI is running on:**
   ```bash
   ps aux | grep react-scripts | grep guard
   ```
   - Look for the port in the output

2. **Check backend logs:**
   - Look for CORS warning messages
   - The origin being blocked will be logged

3. **Verify guard exists:**
   ```bash
   cd /Users/ghaziabdullah/abe-guard-ai/backend
   node -e "require('dotenv').config(); const {pool} = require('./src/config/db'); pool.query('SELECT email FROM guards WHERE email LIKE \\'%bob%\\'').then(r => console.log(r.rows)).then(() => process.exit());"
   ```

4. **Test login directly:**
   ```bash
   curl -X POST http://localhost:4000/auth/login \
     -H "Content-Type: application/json" \
     -H "Origin: http://localhost:3000" \
     -d '{"email":"bob@abe.com","password":"your-password"}'
   ```

## Notes
- The CORS fix allows any localhost port in development
- In production, only specific origins are allowed
- Make sure abe-guard-ai backend is running on port 4000
