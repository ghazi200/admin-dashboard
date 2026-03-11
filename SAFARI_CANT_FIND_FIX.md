# Safari "can't find ...railway.app/api/admin/login" – fix

Safari shows that when the **browser** tries to reach the Railway URL and fails (e.g. CORS, connection, or it treats the API URL as a page to open).

## What we changed

On **Vercel**, the app now uses **same-origin** requests again: the request goes to  
**`https://admin-dashboard-frontend-flax.vercel.app/api/admin/login`**  
and **not** to the Railway URL. So Safari never tries to "open" or "find" the Railway URL.

The **Vercel proxy** (`api/[...path].js`) forwards `/api/*` to Railway on the server. The browser only talks to your Vercel domain.

## What you must do

**In Vercel → Project Settings → General:**

- Set **Root Directory** to **empty** (leave the field blank).
- So the deployment uses the **repo root**, and the **api/** folder is included. If Root Directory is set to `frontend-admin-dashboard/admin-dashboard-frontend`, the proxy is not deployed and `/api/*` returns 404 or the SPA.

Then **redeploy** (Redeploy with "Clear Build Cache" if possible).

## Check it works

1. Open: `https://admin-dashboard-frontend-flax.vercel.app/api/admin`  
   You should see: `{"ok":true,"service":"admin-api",...}` (from Railway via the proxy).  
   If you get 404 or the login page, the proxy is not running – keep Root Directory empty and redeploy.

2. Log in from the app. In Network, the request should be to  
   `https://admin-dashboard-frontend-flax.vercel.app/api/admin/login`  
   (same host as the app). Safari will not try to open the Railway URL.
