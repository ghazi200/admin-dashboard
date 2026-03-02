# Google Maps API Key Setup & Restrictions Guide

## ⚠️ Important: API Key Security

Your Google Maps API key is now configured, but you should set up proper restrictions to prevent unauthorized usage and unexpected charges.

---

## Recommended Restriction Strategy

### For Backend API (Your Use Case)

Since your backend serves API requests, **DO NOT use IP address restrictions** because:
- ❌ Backend might be accessed from different IPs
- ❌ Development vs production environments have different IPs
- ❌ Cloud hosting often has dynamic IPs
- ❌ Multiple developers need access

### ✅ Best Option: Application Restrictions

**Select: "Application restrictions" → "None"** (for backend)

OR

**Select: "HTTP referrers (web sites)"** and add:
```
localhost:*
127.0.0.1:*
http://localhost:*
https://localhost:*
```

This allows:
- Local development
- Backend API calls
- Frontend requests

---

## Step-by-Step Setup

### 1. Go to Google Cloud Console
- Navigate to: https://console.cloud.google.com/apis/credentials
- Find your API key: `AIzaSyAKnqE2uDWF27W3xu8BrJ2UqYDLdcFSoQQ`

### 2. Click "Edit" on the API key

### 3. Set Application Restrictions

**Option A: For Development (Recommended)**
- Select: **"HTTP referrers (web sites)"**
- Add these referrers:
  ```
  http://localhost:*
  https://localhost:*
  http://127.0.0.1:*
  https://127.0.0.1:*
  localhost:*
  127.0.0.1:*
  ```

**Option B: For Production**
- If you have a production domain, add:
  ```
  https://yourdomain.com/*
  https://*.yourdomain.com/*
  ```

**Option C: No Restrictions (Less Secure)**
- Select: **"None"**
- ⚠️ Only use if you have other security measures

### 4. Set API Restrictions (IMPORTANT!)

**Select: "Restrict key"**

**Enable ONLY these APIs:**
- ✅ **Directions API** (Required for traffic & transit)
- ✅ **Geocoding API** (Required for address conversion)
- ❌ Maps JavaScript API (Not needed for backend)
- ❌ Places API (Not needed)
- ❌ Other APIs (Disable all others)

This prevents:
- Unauthorized API usage
- Unexpected charges
- Security vulnerabilities

### 5. Save Changes

Click "Save" and wait 1-2 minutes for changes to propagate.

---

## Alternative: IP Restrictions (If Needed)

If you MUST use IP restrictions (not recommended for backend):

### For Local Development
Add your local IP:
```
127.0.0.1
::1
```

### For Production Server
Add your server's IP address:
```
YOUR_SERVER_IP
```

**To find your server IP:**
```bash
# On your server
curl ifconfig.me
# or
hostname -I
```

### ⚠️ Problems with IP Restrictions

1. **Dynamic IPs**: If your IP changes, API will stop working
2. **Multiple Locations**: Can't access from different places
3. **Cloud Hosting**: IPs might change on restart
4. **Team Access**: Each developer needs their IP added

---

## Recommended Final Setup

### Application Restrictions
- **Type**: HTTP referrers (web sites)
- **Referrers**: 
  ```
  http://localhost:*
  https://localhost:*
  localhost:*
  ```

### API Restrictions
- **Restrict key**: Yes
- **APIs allowed**:
  - ✅ Directions API
  - ✅ Geocoding API
  - ❌ All others disabled

### Usage Limits (Optional)
- Set daily/monthly quotas to prevent unexpected charges
- Enable billing alerts

---

## Testing After Restrictions

After setting restrictions, test:

```bash
cd /Users/ghaziabdullah/abe-guard-ai/backend
node src/scripts/testWeatherTrafficAlerts.js
```

If you see errors like "This API key is not authorized", the restrictions are too strict. Adjust accordingly.

---

## Security Best Practices

1. ✅ **Always restrict APIs** - Only enable what you need
2. ✅ **Use HTTP referrers** for web apps
3. ✅ **Set usage quotas** to prevent overages
4. ✅ **Enable billing alerts** in Google Cloud
5. ✅ **Rotate keys periodically** (every 90 days)
6. ✅ **Never commit keys to git** - Use .env files
7. ✅ **Use different keys** for dev/staging/production

---

## Current Status

- ✅ API Key: `AIzaSyAKnqE2uDWF27W3xu8BrJ2UqYDLdcFSoQQ`
- ✅ Configured in: `/Users/ghaziabdullah/abe-guard-ai/backend/.env`
- ⚠️ **Action Required**: Set restrictions in Google Cloud Console

---

## Quick Answer to Your Question

**For IP Address Restrictions:**

If you MUST use IP restrictions (not recommended):
- **Local Development**: `127.0.0.1` or `::1`
- **Production Server**: Your server's public IP

**But Better Option:**
- Use **"HTTP referrers"** instead
- Add: `localhost:*` and `127.0.0.1:*`
- This is more flexible for backend APIs

---

**Last Updated**: Setup guide for Google Maps API key restrictions
