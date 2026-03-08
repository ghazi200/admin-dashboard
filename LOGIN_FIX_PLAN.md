# Login "Access Control" Error – Plan That Works

## What we just did

1. **Runtime config file** – Added `public/api-config.json` with your Railway backend URL. When the app loads, it fetches this file and uses that URL for login (and saves it to localStorage so the rest of the app uses it too). **So even if the build had localhost, the live app will now use your Railway backend** once you deploy this.

2. **You must deploy this** – Push the new files and let Vercel build. After that, the error should stop.

---

## Your steps (in order)

### 1. Commit and push

```bash
cd /Users/ghaziabdullah/admin-dashboard
git add frontend-admin-dashboard/admin-dashboard-frontend/public/api-config.json frontend-admin-dashboard/admin-dashboard-frontend/src/pages/Login.jsx
git commit -m "Login: use api-config.json so app always uses Railway backend at runtime"
git push origin main
```

### 2. Vercel – Root Directory

- Open **Vercel** → your **admin dashboard** project → **Settings** → **General**.
- **Root Directory:** leave **empty** (no path).
- Save.

### 3. Vercel – Root build config (if you use it)

- The repo has a **root** `vercel.json` that runs the build from `frontend-admin-dashboard/admin-dashboard-frontend`. As long as that file is in the repo and you pushed it, Vercel will use it when Root Directory is empty.
- If you never committed the root `vercel.json`, add and push it:
  - File: `vercel.json` at repo root (same level as `backend/`, `frontend-admin-dashboard/`).
  - Content: buildCommand, outputDirectory, installCommand pointing into `frontend-admin-dashboard/admin-dashboard-frontend`.

### 4. Redeploy

- **Deployments** → latest deployment → **⋯** → **Redeploy**.
- Wait until the build **succeeds**.

### 5. Test

- Open your app in an **incognito** window:  
  `https://admin-dashboard-frontend-flax.vercel.app` (or your real URL).
- Go to login. The app will load `api-config.json` and use the Railway URL.
- Sign in with `admin@test.com` / `password123` (after running the seed if needed).

### 6. Backend CORS (if login still fails)

- **Railway** → your **backend** service → **Variables**.
- Add or set: **CORS_ORIGINS** = `https://admin-dashboard-frontend-flax.vercel.app` (your real Vercel URL, no trailing slash).
- Redeploy the backend if needed.

---

## Why this fixes it

- **Before:** The built JS had `http://localhost:5000` because env vars weren’t in the build or the wrong thing was built.
- **Now:** The app requests `/api-config.json` from your Vercel domain and gets your Railway URL, then uses that for login and stores it for other API calls. So the backend URL is correct **at runtime** and no longer depends on build-time env.

---

## If it still fails

1. **Build logs** – In Vercel, open the latest deployment → **Building**. Confirm the build ran from the frontend folder (root `vercel.json` or correct Root Directory) and **succeeded**.
2. **CORS** – Confirm Railway has **CORS_ORIGINS** set to your exact Vercel URL.
3. **Seed** – Create test admin:  
   `curl -X POST https://admin-dashboard-production-2596.up.railway.app/api/dev/seed-admin`
