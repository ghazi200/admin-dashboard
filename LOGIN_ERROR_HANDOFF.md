# Login Error – Handoff for Another Developer

**Status:** Unresolved after multiple attempts. Backend and env vars are set; deployed frontend still hits "access control" / CORS and login fails.

---

## Why login worked, then broke when we fixed “blocked pages”

- **Before:** Login worked because the app was calling the **Railway URL** (e.g. from `localStorage.adminApiUrl` set by `index.html` or `/use-railway-backend.html`, or from an older build that used env/defaults pointing to Railway).
- **What changed:** While fixing reports/inspections and “no localhost in production”, we changed **apiOrigin.js** so that on Vercel, when there was no stored URL, we returned **same-origin (`""`)** so requests would go through a Vercel proxy to Railway.
- **Why that broke login:** The frontend then sent requests to `https://your-app.vercel.app/api/admin/login` instead of directly to Railway. That only works if the **Vercel serverless proxy** (`api/[...path].js`) is deployed and working. If the proxy isn’t there or the build isn’t from the right directory, the request never reaches Railway and login fails (or you get the SPA instead of JSON).
- **Current code fix:** **apiOrigin.js** was updated so that in **production (including Vercel)** we no longer force same-origin. When there’s no valid stored URL, we return the **Railway URL** directly. So login no longer depends on the proxy; CORS must allow your Vercel origin on Railway (e.g. `CORS_ORIGINS=https://admin-dashboard-frontend-flax.vercel.app`).
- **What you must do:** **Redeploy the frontend** on Vercel from the repo that contains this fix (so the built bundle uses the new apiOrigin logic). After deploy, do a hard refresh or use an incognito window so the browser doesn’t use an old cached bundle. If you still see requests to localhost, the deployed build is still old or from the wrong app.

---

## Exact error (copy-paste)

**Browser console / user-facing:**
```
Fetch API cannot load http://localhost:5000/api/admin/login due to access control checks.
```

**Or in the app:** Login request fails; user may see a generic network/error message or "access control" in the browser dev tools.

---

## What’s going on

- **Frontend:** Deployed on **Vercel** (e.g. `https://admin-dashboard-frontend-flax.vercel.app`).
- **Backend:** Deployed on **Railway** at `https://admin-dashboard-production-2596.up.railway.app`.
- **Problem:** The **built** frontend is calling **`http://localhost:5000/api/admin/login`** instead of the Railway URL. So the browser blocks the request (cross-origin / CORS from the Vercel origin to localhost).
- **Root cause:** The frontend is a Create React App; `REACT_APP_ADMIN_API_URL` and `REACT_APP_API_URL` are baked in at **build time**. If the Vercel build doesn’t see those env vars (or isn’t building the right app), the bundle keeps the default `http://localhost:5000/api/admin`.

---

## What’s already been tried

1. **Vercel env vars** – User reports `REACT_APP_API_URL` and `REACT_APP_ADMIN_API_URL` are set in Vercel (and have been). Login still fails, so either the build isn’t using them or the wrong build is being served.
2. **Vercel Root Directory** – Setting Root Directory to `frontend-admin-dashboard/admin-dashboard-frontend` in the dashboard returns: *"The specified Root Directory does not exist"*. Repo on GitHub: `ghazi200/admin-dashboard`, branch `main`; that path exists in the repo. Cause unknown (wrong project, cache, or Vercel quirk).
3. **Root `vercel.json`** – A `vercel.json` was added at repo root to run install/build from `frontend-admin-dashboard/admin-dashboard-frontend` so Root Directory can stay empty. Unclear if this is the active build config on Vercel.
4. **Runtime overrides** – Login page was given:
   - `?api=<url>` and localStorage key `adminApiUrl`
   - “Use Railway backend” button
   - Fetch of `/api-config.json` at runtime to set API base
   - `public/api-config.json` with the Railway URL  
   User still sees the same login error, so either the new code/config isn’t in the deployed build, or the request is still going to localhost (e.g. cached bundle or config not loaded).
5. **Banner / messaging** – Red banner and messages were added in `index.html` and Login to explain the issue and link to `/use-railway-backend.html`. User reports not seeing updated messages (suggesting the deployed assets may be old or cached).
6. **Backend CORS** – Backend (Railway) should allow the Vercel origin; `CORS_ORIGINS` is documented. Not confirmed whether it’s set and redeployed on Railway.

---

## Repo layout (monorepo)

- **Repo:** `ghazi200/admin-dashboard` (GitHub), branch `main`.
- **Frontend (admin dashboard):**  
  `frontend-admin-dashboard/admin-dashboard-frontend/`  
  - CRA, `react-scripts` build.  
  - `vercel.json` and `package.json` (with `build:vercel`) live here.  
  - Login: `src/pages/Login.jsx`.  
  - API client: `src/api/axiosClient.js`.  
  - Runtime config: `public/api-config.json` (Railway URL).
- **Backend (admin API):**  
  `backend/`  
  - Node, runs on Railway.  
  - Login route: `/api/admin/login` (and register, etc.).
- **Root:**  
  - Root `vercel.json` (if present) runs build from `frontend-admin-dashboard/admin-dashboard-frontend`.

---

## Relevant files (for whoever fixes it)

| Path | Purpose |
|------|--------|
| `frontend-admin-dashboard/admin-dashboard-frontend/src/pages/Login.jsx` | Login form; uses `BUILD_API_URL` (env) and runtime override / `api-config.json`. |
| `frontend-admin-dashboard/admin-dashboard-frontend/src/api/axiosClient.js` | All other API calls; reads `REACT_APP_API_URL` and localStorage `adminApiUrl`. |
| `frontend-admin-dashboard/admin-dashboard-frontend/public/api-config.json` | Runtime API base URL (intended to override build default). |
| `frontend-admin-dashboard/admin-dashboard-frontend/public/index.html` | Has banner script and cache meta tags. |
| `frontend-admin-dashboard/admin-dashboard-frontend/public/use-railway-backend.html` | Static page to set `adminApiUrl` in localStorage and redirect to login. |
| `frontend-admin-dashboard/admin-dashboard-frontend/vercel.json` | Build/output/cache headers for this app. |
| `vercel.json` (repo root) | Optional; runs install/build from `frontend-admin-dashboard/admin-dashboard-frontend` when Root Directory is empty. |
| `FIX_LOGIN_VERCEL.md` | Earlier fix notes (env, Root Directory, CORS). |
| `LOGIN_FIX_PLAN.md` | Plan using `api-config.json` and deploy steps. |

---

## URLs (copy-paste)

- **Frontend (Vercel):** `https://admin-dashboard-frontend-flax.vercel.app` (confirm in Vercel dashboard).
- **Backend (Railway):** `https://admin-dashboard-production-2596.up.railway.app`
- **Admin API base:** `https://admin-dashboard-production-2596.up.railway.app/api/admin`
- **Seed admin (POST):** `https://admin-dashboard-production-2596.up.railway.app/api/dev/seed-admin`  
  (Then login with `admin@test.com` / `password123`.)

---

## What would fix it (for next developer)

**Option A – Build with correct env (preferred)**  
- Ensure the **Vercel project** that serves the dashboard:
  - Builds from the **frontend** app (either Root Directory = `frontend-admin-dashboard/admin-dashboard-frontend` once the “does not exist” issue is resolved, or root `vercel.json` with that path is used and Root Directory is empty).
  - Has **Production** env vars:  
    `REACT_APP_API_URL` = `https://admin-dashboard-production-2596.up.railway.app`  
    `REACT_APP_ADMIN_API_URL` = `https://admin-dashboard-production-2596.up.railway.app/api/admin`
  - Then **Redeploy** (no cache) and test in incognito. The built JS should then call Railway, not localhost.

**Option B – Runtime config only**  
- Ensure the **deployed** site includes the latest `public/api-config.json` and the Login/axios code that fetches it and uses it (and writes to `adminApiUrl` in localStorage). Then ensure no caching (browser/CDN) serves an old bundle that ignores the config. If the live bundle doesn’t load `api-config.json` or still uses localhost, trace why (wrong deploy, wrong project, or caching).

**Option C – Different host/build**  
- Deploy the frontend from a different host or build process (e.g. build locally with env set, then deploy the `build/` output; or a separate repo that only contains the frontend with Root Directory empty) so the bundle is guaranteed to have the Railway URL.

**Backend**  
- On Railway, set **CORS_ORIGINS** to the exact Vercel URL (e.g. `https://admin-dashboard-frontend-flax.vercel.app`), redeploy, and confirm the dashboard origin is allowed.

---

## Quick checks for next developer

1. In Vercel: **Settings → Environment Variables** – Are `REACT_APP_API_URL` and `REACT_APP_ADMIN_API_URL` set for **Production** with the Railway URLs above?
2. In Vercel: **Settings → General** – What is **Root Directory**? If empty, is there a root `vercel.json` in the repo that points to `frontend-admin-dashboard/admin-dashboard-frontend`?
3. In Vercel: **Deployments** – Open the latest deployment; did the build **succeed**? From which directory did the build run (check build logs)?
4. In the browser: On the login page, open dev tools → Network. When you click Sign in, which URL is requested? If it’s still `http://localhost:5000/...`, the served JS is still the old bundle or the runtime override isn’t applied.
5. In the browser: Request `https://<your-vercel-url>/api-config.json` directly. Does it return the JSON with the Railway URL? If not, the deployed app doesn’t have the latest `public/api-config.json`.

---

## Error again (copy-paste for tickets / chat)

```
Fetch API cannot load http://localhost:5000/api/admin/login due to access control checks.
```

Context: Admin dashboard frontend on Vercel; backend on Railway. Frontend build appears to use default API URL (localhost) instead of production backend URL; runtime overrides and api-config.json added but login still fails. See LOGIN_ERROR_HANDOFF.md in repo for full context and attempted fixes.
