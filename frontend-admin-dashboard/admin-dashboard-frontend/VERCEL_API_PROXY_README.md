# API proxy in this app (so /api/admin returns JSON, not the app)

The **api/** folder is now **inside** this frontend app. So when Vercel **Root Directory** is set to this folder (`frontend-admin-dashboard/admin-dashboard-frontend`), the proxy is deployed and `/api/*` works.

## What was added

- **api/[...path].js** – Forwards `/api/*` to Railway. So `/api/admin` returns `{"ok":true,...}` and `/api/admin/login` accepts POST for login.
- **vercel.json** – Rewrites: `/api/:path*` → API handler first, then `/(.*)` → `/index.html` (SPA).

## After deploy

1. Open: `https://your-app.vercel.app/api/admin`  
   You should see: **`{"ok":true,"service":"admin-api",...}`** (not the login page).

2. If you still see the app, the **api** folder may not be deployed. In Vercel → Deployments → select the latest → check "Source" and that the repo includes this **api** folder. Redeploy if needed.

3. Optional: set **RAILWAY_BACKEND_URL** in Vercel (Environment Variables) to your Railway URL. Default in the code is already set.
