# Login Fix – Expert Review & Plan (no code changes)

This document reviews the external expert’s analysis and turns it into a single, ordered fix plan. **No code or config has been changed**; this is the plan only.

---

## Expert’s root cause (agreed)

- The problem is **not CORS** per se; it’s that the **production bundle** is built with `http://localhost:5000` as the API URL.
- So the browser is sending requests to localhost from a Vercel origin → “access control” / CORS-style failure.
- **Likely cause:** Vercel is **building from the repo root** (or the wrong directory), so the CRA app either isn’t built at all or is built **without** `REACT_APP_*` env vars. Hence the bundle keeps the CRA default (localhost).
- The “Root Directory does not exist” error in the dashboard is a strong sign: Root Directory can’t be set to the frontend path, so the project may be building from root and not from the frontend folder.

---

## What the expert recommends (summary)

1. **Force Vercel to build the frontend subfolder** using a **root** `vercel.json` (repo root).
2. **Set env vars** in Vercel for Production, Preview, and Development.
3. **Redeploy without cache** so the new build picks up env and correct directory.
4. **Verify** the login request goes to Railway, not localhost.
5. **Set CORS_ORIGINS** on Railway to the Vercel URL.
6. (Optional) Move to **runtime config** (e.g. `window.APP_CONFIG` or `config.js`) so API URL isn’t tied to build-time env.

---

## Current repo state (for the plan)

- **Root `vercel.json`** already exists and:
  - `buildCommand`: `cd frontend-admin-dashboard/admin-dashboard-frontend && npm run build:vercel`
  - `outputDirectory`: `frontend-admin-dashboard/admin-dashboard-frontend/build`
  - `installCommand`: `cd frontend-admin-dashboard/admin-dashboard-frontend && npm install --no-audit`
  - `framework`: `null`
  - Has SPA `rewrites` to `/index.html`
- **Expert’s suggested root `vercel.json`** is slightly different:
  - `buildCommand`: `cd frontend-admin-dashboard/admin-dashboard-frontend && npm install && npm run build`
  - Same `outputDirectory`
  - `framework`: `"create-react-app"`
  - No separate `installCommand` (install inside buildCommand).
- **Frontend** already has:
  - `public/api-config.json` (runtime API URL).
  - Login and axiosClient reading that / localStorage; “Use Railway backend” and `?api=` override.

So the repo already tries to force the frontend subfolder from root. If the deployed site still calls localhost, either: (a) the root `vercel.json` isn’t being used (e.g. Root Directory set to something else, or different project), (b) env vars aren’t available at build time, or (c) a cached build is being served.

---

## Ordered fix plan (do in this order)

### 1. Root `vercel.json` (repo root)

- **Goal:** Force Vercel to build the CRA app in `frontend-admin-dashboard/admin-dashboard-frontend` and output its `build/`.
- **Current:** Root `vercel.json` already points to that folder for install and build.
- **Action:** Either keep it as is, or **replace** the root `vercel.json` with the expert’s version (see “Expert’s exact root vercel.json” below) if you want to match their recommendation exactly. Ensure Root Directory in Vercel is **empty** so this root config is used.

### 2. Vercel environment variables

- **Goal:** CRA sees `REACT_APP_API_URL` and `REACT_APP_ADMIN_API_URL` at **build** time.
- **Where:** Vercel → Project → Settings → Environment Variables.
- **Add (exact names):**

  - **Name:** `REACT_APP_API_URL`  
    **Value:** `https://admin-dashboard-production-2596.up.railway.app`  
    **Environments:** Production, Preview, Development

  - **Name:** `REACT_APP_ADMIN_API_URL`  
    **Value:** `https://admin-dashboard-production-2596.up.railway.app/api/admin`  
    **Environments:** Production, Preview, Development

- No trailing slash; no quotes in the value.

### 3. Vercel Root Directory

- **Goal:** So that the **root** `vercel.json` is used (which runs the frontend build).
- **Action:** Vercel → Settings → General → **Root Directory** = **empty** (clear any value). Save.

### 4. Redeploy without cache

- **Goal:** New build that uses the frontend folder and env vars; no old cached bundle.
- **Action:** Deployments → open latest deployment → ⋯ → **Redeploy** → choose **Redeploy without cache** (or equivalent). Wait for success.

### 5. Verify the bundle

- Open: `https://admin-dashboard-frontend-flax.vercel.app` (or your real Vercel URL).
- Open DevTools → Network. Click **Sign in**.
- **Check:** The login request URL must be  
  `https://admin-dashboard-production-2596.up.railway.app/api/admin/login`  
  and must **not** be `http://localhost:5000/...`.
- Optional: In console run  
  `fetch("/api-config.json").then(r=>r.json()).then(console.log)`  
  and confirm it returns your Railway API base/admin URL (so the deployed app has the right `public/api-config.json`).

### 6. Railway CORS

- **Goal:** Backend allows requests from the Vercel origin.
- **Where:** Railway → backend service → Variables (or .env).
- **Set:**  
  `CORS_ORIGINS=https://admin-dashboard-frontend-flax.vercel.app`  
  (your real Vercel URL; no trailing slash.)
- Redeploy the backend if needed.

### 7. Backend login test (sanity check)

- **Method:** POST  
- **URL:** `https://admin-dashboard-production-2596.up.railway.app/api/admin/login`  
- **Body (JSON):**  
  `{"email":"admin@test.com","password":"password123"}`  
- If you get a token (or requiresMfa), backend is fine. If 401, run the seed:  
  `POST https://admin-dashboard-production-2596.up.railway.app/api/dev/seed-admin`

---

## If login still calls localhost

Then the deployed bundle is still wrong. Checklist:

- Build logs in Vercel: did the build **run** from the repo root and execute the root `vercel.json`’s buildCommand (cd into frontend and run build)?
- Are the env vars definitely set for the **environment** of the deployment (Production vs Preview)?
- Try a hard refresh or incognito to rule out browser cache; if possible, try “Redeploy without cache” again.

---

## Expert’s exact root `vercel.json` (for copy-paste if you decide to adopt it)

Replace **repo root** `vercel.json` with this only if you want to match the expert’s suggestion exactly (otherwise keep current root config):

```json
{
  "buildCommand": "cd frontend-admin-dashboard/admin-dashboard-frontend && npm install && npm run build",
  "outputDirectory": "frontend-admin-dashboard/admin-dashboard-frontend/build",
  "framework": "create-react-app"
}
```

Note: This uses `npm run build` instead of `npm run build:vercel`; if you rely on build:vercel (e.g. CI=false), keep that in the plan when you apply changes.

---

## Optional: runtime config (expert recommendation)

To avoid depending on build-time env for the API URL:

- Add something like `public/config.js` that sets `window.APP_CONFIG = { API_URL: "https://admin-dashboard-production-2596.up.railway.app" };` and load it from `index.html`.
- In the API client / Login, use `window.APP_CONFIG.API_URL` (or similar) instead of only `process.env.REACT_APP_*`.

The repo already has `public/api-config.json` and runtime reading in Login/axios; the expert’s `config.js` + `window.APP_CONFIG` is an alternative pattern. No change made here; this is for a future improvement.

---

## One-sentence fix (expert summary)

Force Vercel to **build the frontend subfolder** (via root `vercel.json` and empty Root Directory), set **REACT_APP_API_URL** and **REACT_APP_ADMIN_API_URL** in Vercel, then **redeploy without cache**.

---

## References in repo

- `LOGIN_ERROR_HANDOFF.md` – full error and what was tried.
- `FIX_LOGIN_VERCEL.md` – earlier env and Root Directory notes.
- `LOGIN_FIX_PLAN.md` – api-config.json and deploy steps.
- Root `vercel.json` – current “build frontend from root” config.
