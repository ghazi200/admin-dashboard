# Fix: "Access control" / CORS on login (Vercel + Railway)

## Root cause

The error **"Fetch API cannot load http://localhost:5000/api/admin/login due to access control checks"** happens because:

1. The frontend is **built** with `REACT_APP_ADMIN_API_URL` and `REACT_APP_API_URL` **unset**.
2. Create React App then bakes in the default: **`http://localhost:5000/api/admin`**.
3. When you open the app on **Vercel** (e.g. `https://admin-dashboard-frontend-flax.vercel.app`) and click Sign in, the browser sends the request to **localhost:5000** (your machine), which fails from a different origin → CORS/access control error.

So the **only permanent fix** is: **set the env vars in Vercel and redeploy** so the **next build** uses your Railway backend URL instead of localhost.

---

## Why you don’t see the “updated message”

- The **red banner** and **“Use Railway backend”** button live in code that is only in the **built** JS and in **index.html**.
- If **Vercel is not building from the right place**, or the **last successful deploy** is old, you still get an old bundle and old `index.html` → no new message.
- Also: if you open the **home** URL (`/`) and the app **redirects** you to `/login` in the browser (no full reload), the banner script in `index.html` only ran when the URL was `/`, so it used to never show. That is fixed by re-checking the path every 500ms for 12s so the banner appears after the redirect to `/login`.

---

## 1. Vercel project setup (must be correct)

Your repo is a **monorepo**. The frontend is in:

`frontend-admin-dashboard/admin-dashboard-frontend/`

So in **Vercel**:

1. Open your **project** (the one that serves the admin dashboard).
2. Go to **Settings** → **General**.
3. Under **Root Directory**, set:
   - **Root Directory:** `frontend-admin-dashboard/admin-dashboard-frontend`
   - Leave **Override** unchecked unless you need it.
4. Save.

If Root Directory is wrong or empty, Vercel may build from the repo root (where there is no frontend `package.json`), builds can fail, and you keep seeing an old deployment → no new message and login still points to localhost.

---

## 2. Environment variables (required for login to work)

In the **same** Vercel project:

1. Go to **Settings** → **Environment Variables**.
2. Add (for **Production**; add for Preview if you use preview URLs):

   | Name | Value |
   |------|--------|
   | `REACT_APP_API_URL` | `https://admin-dashboard-production-2596.up.railway.app` |
   | `REACT_APP_ADMIN_API_URL` | `https://admin-dashboard-production-2596.up.railway.app/api/admin` |

   No trailing slash. No quotes.

3. Save.

---

## 3. Redeploy (so the new build uses the env vars)

1. Go to **Deployments**.
2. Open the **⋯** menu on the **latest** deployment.
3. Click **Redeploy**.
4. If there is an option like **“Redeploy with existing Build Cache”**, turn it **off** so the build is clean.
5. Wait until the deployment is **Ready**.

After this, the **new** build will have the Railway URL baked in and login will call your backend instead of localhost.

---

## 4. Backend CORS (Railway)

So the browser allows requests from your Vercel URL:

1. Open **Railway** → the **backend** service (admin dashboard API).
2. **Variables** (or **Settings** → **Variables**).
3. Add or set:
   - **Name:** `CORS_ORIGINS`
   - **Value:** `https://admin-dashboard-frontend-flax.vercel.app`  
   (your real Vercel URL, no trailing slash.)

Redeploy the backend if needed.

---

## 5. See the “updated message” after a deploy

- The **red banner** is in **index.html** and is shown when the path contains `login` (including after client-side redirect to `/login`).
- For that to appear you must be on a **recent** deployment (where the repo’s `public/index.html` includes the banner and the script that runs every 500ms).
- So: **push** the latest code (including `public/index.html` and `vercel.json`), ensure **Root Directory** is correct, then **Redeploy** in Vercel. After the new deploy, open the app (ideally in **incognito** or after a **hard refresh**):
  - `https://admin-dashboard-frontend-flax.vercel.app`
- You should get redirected to `/login` and then see the red banner. You can use the link there to open **/use-railway-backend.html** as a one-time fix even if env vars were not set yet.

---

## 6. One-time workaround (no redeploy)

If you can’t redeploy immediately:

1. Open:  
   `https://admin-dashboard-frontend-flax.vercel.app/use-railway-backend.html`
2. Click **“Use Railway backend and go to Login”**.
3. Sign in.

This only works if the **deployed** app already includes the code that reads `adminApiUrl` from `localStorage` (Login + axiosClient). If the live app is very old, this may not work; then you **must** set env vars and redeploy.

---

## 7. Checklist

- [ ] Vercel **Root Directory** = `frontend-admin-dashboard/admin-dashboard-frontend`
- [ ] Vercel **Environment Variables**: `REACT_APP_API_URL`, `REACT_APP_ADMIN_API_URL` set (Production).
- [ ] Vercel **Redeploy** done (and build succeeded).
- [ ] Railway backend **CORS_ORIGINS** includes your Vercel URL.
- [ ] Test in **incognito** or with **hard refresh** (Ctrl+Shift+R / Cmd+Shift+R).
- [ ] If login still fails, run seed:  
  `curl -X POST https://admin-dashboard-production-2596.up.railway.app/api/dev/seed-admin`  
  then log in with `admin@test.com` / `password123`.

---

## 8. Verify build

- In Vercel, open the **latest deployment** → **Building** (or logs).
- Confirm the build ran **from** `frontend-admin-dashboard/admin-dashboard-frontend` (or that the root is set correctly).
- Confirm the build **finished successfully**. If it fails, the live site stays on the previous deployment → old bundle and no new message.
