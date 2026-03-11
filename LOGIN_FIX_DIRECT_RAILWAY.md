# Login fix: call Railway directly (no proxy)

## What changed

The frontend on **Vercel** now calls **Railway directly** for the API. The Vercel proxy is no longer used for login.

- **apiOrigin.js** – When the app is not on localhost, `getBackendOrigin()` returns the Railway URL: `https://admin-dashboard-production-2596.up.railway.app`. So every API request (login, axios, superAdmin, etc.) goes straight to Railway.
- **Login.jsx** – Removed the “force same-origin” override. Login uses `getApiBaseForRequest()`, which uses that Railway base, so the login request goes to `https://admin-dashboard-production-2596.up.railway.app/api/admin/login`.

## Why this should work

1. **No proxy** – Nothing depends on Vercel’s `api/` or rewrites. The browser talks only to Vercel (HTML/JS) and to Railway (API).
2. **CORS** – The admin-dashboard backend already allows:
   - `https://admin-dashboard-frontend-flax.vercel.app`
   - Any `*.vercel.app` origin  
   So the browser will allow the request from your Vercel site to Railway.
3. **No localhost** – On Vercel we never use `http://localhost:5000`; we always use the Railway URL.

## What you need to do

1. **Push and redeploy** the frontend to Vercel (so the new build is live).
2. **Railway** – Optional: set `CORS_ORIGINS` to your Vercel URL if you use a custom domain. For `*.vercel.app`, the backend already allows it.
3. **Test** – Open the app on Vercel in **incognito**, try login. In Network you should see **POST** to `https://admin-dashboard-production-2596.up.railway.app/api/admin/login` with status **200** or **401**.

## If it still fails

- **401** – Wrong credentials or no admin user. Run:  
  `curl -X POST https://admin-dashboard-production-2596.up.railway.app/api/dev/seed-admin`  
  then log in with `admin@test.com` / `password123`.
- **CORS error** – On Railway, add your exact frontend URL to `CORS_ORIGINS` and redeploy the backend.
- **Still localhost** – Hard refresh or clear site data; confirm the latest commit is deployed on Vercel.
