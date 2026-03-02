# Deploy Frontends on Vercel

Deploy the **Admin Dashboard** and **Guard UI** as two separate Vercel projects. Backends (admin API, guard API) stay on Railway, Render, Fly.io, or a VPS—do **not** run them on Vercel.

---

## 1. Prerequisites

- Backends deployed and reachable at HTTPS URLs (e.g. `https://admin-api.yourdomain.com`, `https://guard-api.yourdomain.com`).
- **CORS:** Add your Vercel frontend URLs to `CORS_ORIGINS` on **both** backends (see section 6).

---

## 1b. Fix “Not allowed to request resource” / app calling localhost (Steps 1–2–3)

If the deployed app tries to load `http://localhost:5000/api/admin/login` or similar, do:

**Step 1 – Get your backend URLs**  
Use the public HTTPS URLs of your admin and guard backends (e.g. Railway, Render). Example: `https://your-admin-api.up.railway.app`, `https://your-guard-api.up.railway.app`.

**Step 2 – Set env vars in Vercel**  
Vercel → your project → **Settings** → **Environment Variables**. For **Production** (and Preview if you use it), add:

| Project | Variables to set |
|--------|-------------------|
| **Admin Dashboard** | `REACT_APP_API_URL` = admin backend URL (no trailing slash)<br>`REACT_APP_ADMIN_API_URL` = admin URL + `/api/admin`<br>`REACT_APP_GUARD_AI_URL` = guard backend URL |
| **Guard UI** | `REACT_APP_GUARD_API_URL` = guard backend URL<br>`REACT_APP_ADMIN_API_URL` = admin backend URL |

**Step 3 – Redeploy**  
Deployments → **⋯** on latest → **Redeploy**. Env vars are applied at build time, so a new deployment is required.

---

## 1c. Copy-paste env vars & how to set in Vercel

Replace `YOUR_ADMIN_BACKEND_URL` and `YOUR_GUARD_BACKEND_URL` with your real backend URLs (no trailing slash). Example: `https://admin-api.up.railway.app`, `https://guard-api.up.railway.app`.

### Admin Dashboard project – copy-paste (Name = Value)

```
REACT_APP_API_URL=YOUR_ADMIN_BACKEND_URL
REACT_APP_ADMIN_API_URL=YOUR_ADMIN_BACKEND_URL/api/admin
REACT_APP_GUARD_AI_URL=YOUR_GUARD_BACKEND_URL
```

Example (replace with your URLs):

```
REACT_APP_API_URL=https://admin-api.up.railway.app
REACT_APP_ADMIN_API_URL=https://admin-api.up.railway.app/api/admin
REACT_APP_GUARD_AI_URL=https://guard-api.up.railway.app
```

### Guard UI project – copy-paste (Name = Value)

```
REACT_APP_GUARD_API_URL=YOUR_GUARD_BACKEND_URL
REACT_APP_ADMIN_API_URL=YOUR_ADMIN_BACKEND_URL
```

Example:

```
REACT_APP_GUARD_API_URL=https://guard-api.up.railway.app
REACT_APP_ADMIN_API_URL=https://admin-api.up.railway.app
```

### How to set in Vercel

1. Go to [vercel.com](https://vercel.com) and sign in.
2. Open your **project** (Admin Dashboard or Guard UI) from the dashboard.
3. Click **Settings** in the top nav.
4. In the left sidebar, click **Environment Variables**.
5. For each variable:
   - **Key:** paste the name (e.g. `REACT_APP_API_URL`).
   - **Value:** paste the value (e.g. `https://admin-api.up.railway.app`).
   - **Environments:** check **Production** (and **Preview** if you want preview deployments to use the same API).
   - Click **Save**.
6. Repeat for every variable in the copy-paste block above.
7. **Redeploy** so the new vars are used: go to **Deployments** → click **⋯** on the latest deployment → **Redeploy**.

---

## 2. Create two Vercel projects

1. Go to [vercel.com](https://vercel.com) and connect your Git repository.
2. Create **Project 1 – Admin Dashboard**
3. Create **Project 2 – Guard UI** (from the same repo, different root).

---

## 3. Project settings

### Admin Dashboard

| Setting | Value |
|--------|--------|
| **Root Directory** | `frontend-admin-dashboard/admin-dashboard-frontend` |
| **Framework Preset** | Create React App (or leave auto) |
| **Build Command** | `npm run build` (default) |
| **Output Directory** | `build` (default) |
| **Install Command** | `npm ci` (optional, for reproducible builds) |

**Environment variables** (Production – and Preview if you want same API in previews):

| Variable | Example | Required |
|----------|---------|----------|
| `REACT_APP_API_URL` | `https://admin-api.yourdomain.com` | Yes |
| `REACT_APP_ADMIN_API_URL` | `https://admin-api.yourdomain.com/api/admin` | Recommended (for login) |
| `REACT_APP_GUARD_AI_URL` | `https://guard-api.yourdomain.com` | Yes (guard/assistant features) |
| `REACT_APP_ADMIN_REALTIME_URL` | `https://admin-api.yourdomain.com` | Optional (Socket.IO) |
| `REACT_APP_GUARD_REALTIME_URL` | `https://guard-api.yourdomain.com` | Optional (Socket.IO) |
| `REACT_APP_GOOGLE_MAPS_API_KEY` | (your key) | Optional (Geographic Dashboard map) |

Replace `yourdomain.com` with your real backend hostnames.

### Guard UI

| Setting | Value |
|--------|--------|
| **Root Directory** | `frontend-guard-ui` |
| **Framework Preset** | Create React App |
| **Build Command** | `npm run build` |
| **Output Directory** | `build` |

**Environment variables** (Production):

| Variable | Example | Required |
|----------|---------|----------|
| `REACT_APP_GUARD_API_URL` | `https://guard-api.yourdomain.com` | Yes |
| `REACT_APP_ADMIN_API_URL` | `https://admin-api.yourdomain.com` | Yes |

---

## 4. Where to install the Vercel CLI

Install the CLI **on your local machine** (the same place you run `npm run build` and git). You only need it in one place.

**Option A – Global install (recommended)**

From any directory (e.g. your home folder or repo root):

```bash
npm install -g vercel
```

Then run `vercel` or `vercel --prod` from **the folder you want to deploy** (see section 5). Run `vercel login` once to link your account.

**Option B – Use without installing (npx)**

From the folder you want to deploy:

```bash
npx vercel
```

No install step; each run may download the CLI. Run `npx vercel login` once. You must be inside the app folder (e.g. `frontend-admin-dashboard/admin-dashboard-frontend` or `frontend-guard-ui`) when you run it.

**Option C – Inside the project (devDependency)**

Yes, you can install the CLI inside the admin-dashboard repo. Install it in **the same folder you deploy from**:

- **Admin Dashboard:** install in the admin frontend folder, then run `npx vercel` from there.
- **Guard UI:** install in the guard-ui folder, then run `npx vercel` from there.

There is no single repo-root `package.json`, so install in each frontend app if you want the CLI as a devDependency for both:

```bash
# For Admin Dashboard: install and run from admin frontend folder
cd frontend-admin-dashboard/admin-dashboard-frontend
npm install -D vercel
# When deploying: run `npx vercel` from this folder

# For Guard UI: install and run from guard-ui folder
cd frontend-guard-ui
npm install -D vercel
# When deploying: run `npx vercel` from this folder
```

If you only deploy one app from this repo, you only need to add `vercel` in that app’s folder.

---

## 5. Deploy with Vercel CLI

1. **Log in once** (from any directory):

   ```bash
   vercel login
   ```

   Follow the prompts (email or GitHub/GitLab/Bitbucket).

2. **Deploy Admin Dashboard**

   ```bash
   cd frontend-admin-dashboard/admin-dashboard-frontend
   vercel
   ```

   - First run: answer the prompts to create a new project (or link an existing one). Choose your Vercel account/team.
   - Set **environment variables** before or after first deploy:
     - In the [Vercel Dashboard](https://vercel.com/dashboard) → your project → **Settings** → **Environment Variables**, add the Admin variables from the table in section 3 (e.g. `REACT_APP_API_URL`, `REACT_APP_ADMIN_API_URL`, `REACT_APP_GUARD_AI_URL`).
     - Or use the CLI: `vercel env add REACT_APP_API_URL` (and repeat for each variable).
   - Production deploy: `vercel --prod`

3. **Deploy Guard UI**

   ```bash
   cd frontend-guard-ui
   vercel
   ```

   Again, set env vars in the dashboard or with `vercel env add` (`REACT_APP_GUARD_API_URL`, `REACT_APP_ADMIN_API_URL`). Then `vercel --prod` for production.

4. **After first deploy:** Add the Vercel URLs to **CORS_ORIGINS** on both backends and restart them (see section 6).

---

## 6. After first deploy: CORS

Vercel will assign URLs like:

- `https://admin-dashboard-xxx.vercel.app`
- `https://guard-ui-xxx.vercel.app`

Add these (and any custom domains) to **both** backends:

- **Admin backend** `backend/.env`:  
  `CORS_ORIGINS=https://admin-dashboard-xxx.vercel.app,https://guard-ui-xxx.vercel.app,...`
- **Guard backend** `abe-guard-ai/backend/.env`:  
  `CORS_ORIGINS=https://guard-ui-xxx.vercel.app,https://admin-dashboard-xxx.vercel.app,...`

Then **restart both backends**. Otherwise the browser will block API requests with CORS errors.

---

## 7. Build locally with production URLs (optional)

To test a production build locally:

```bash
# Admin Dashboard
cd frontend-admin-dashboard/admin-dashboard-frontend
cp .env.production.example .env.production
# Edit .env.production with your real API URLs, then:
npm run build

# Guard UI
cd frontend-guard-ui
cp .env.production.example .env.production
# Edit .env.production, then:
npm run build
```

Serve the `build/` folder with any static server (e.g. `npx serve build`) and ensure backends have your origin in CORS.

---

## 8. Reference

- **Production steps:** STEPS_TO_PRODUCTION_AND_RECOMMENDATIONS.md  
- **Env examples:**  
  - Admin: `frontend-admin-dashboard/admin-dashboard-frontend/.env.production.example`  
  - Guard: `frontend-guard-ui/.env.production.example`
