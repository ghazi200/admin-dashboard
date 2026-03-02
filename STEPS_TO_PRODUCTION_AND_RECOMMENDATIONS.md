# Steps to Production & Best Recommendations

This document consolidates production deployment steps and recommendations from the admin-dashboard project. Use it together with **PRODUCTION_CHECKLIST.md** and the backend **.env.example** files.

---

## 1. Steps to Production (in order)

### 1.1 Set environment and secrets

- **NODE_ENV**  
  Set to `production` on both backends. Required for strict CORS, JWT checks, and production logging.

**How to set NODE_ENV=production (Step 1):**

1. **Using `.env` files (recommended)**  
   On the machine or container where you run the backends, edit the real `.env` (not .env.example):

   - **Admin backend:** open `backend/.env` and set:
     ```bash
     NODE_ENV=production
     ```
   - **Guard backend:** open `abe-guard-ai/backend/.env` and set:
     ```bash
     NODE_ENV=production
     ```
   Save the file. The next time you start each backend (`node server.js` or `node src/server.js`), it will read `NODE_ENV=production` from `.env`.

2. **Using the shell when starting** (no file edit):
   ```bash
   # Admin backend
   cd backend && NODE_ENV=production node server.js

   # Guard backend (in another terminal)
   cd abe-guard-ai/backend && NODE_ENV=production node src/server.js
   ```

3. **Using a process manager (PM2)**  
   Set in the ecosystem file or when starting:
   ```bash
   NODE_ENV=production pm2 start server.js --name admin-backend
   NODE_ENV=production pm2 start src/server.js --name guard-backend
   ```

4. **Using a hosting platform (Railway, Render, Fly.io, etc.)**  
   In the project’s **Environment** or **Variables** settings, add:
   - Key: `NODE_ENV`  
   - Value: `production`  
   Redeploy or restart the service so the new variable is applied.

After setting `NODE_ENV=production`, restart both backends so the change takes effect. No code changes are required.

- **DATABASE_URL**  
  PostgreSQL URL (e.g. `postgresql://user:password@host:5432/abe_guard`). Same DB can be used by both backends.

- **JWT_SECRET**  
  At least 16 characters. **Must be identical** on admin and guard backends so tokens work across both.

- **CORS_ORIGINS**  
  Comma-separated list of your frontend origins (e.g. `https://admin.mycompany.com,https://guard.mycompany.com`). Set on **both** backends. In production, only listed origins are allowed; the backends log a one-time warning when they block an origin.

Copy from `.env.example` to `.env` in each backend and fill in real values:

- Admin: `backend/.env`
- Guard: `abe-guard-ai/backend/.env`

### 1.2 Install dependencies

After adding or changing dependencies (e.g. `pino`), run in each backend:

```bash
cd backend && npm install
cd abe-guard-ai/backend && npm install
```

### 1.3 Start the backends (correct entry points)

- **Admin backend** — entry point is **`server.js`** in the backend root (not under `src/`):
  ```bash
  cd backend && node server.js
  ```
  or `npm start` (same thing).

- **Guard backend** — entry point is **`src/server.js`**:
  ```bash
  cd abe-guard-ai/backend && node src/server.js
  ```
  or `npm start`.

Using `node src/server.js` in the **admin** backend will fail with “Cannot find module …/backend/src/server.js” because that file does not exist there.

### 1.4 Build frontends with production API URLs and deploy on Vercel

- **Admin dashboard:** Set `REACT_APP_API_URL`, `REACT_APP_ADMIN_API_URL`, `REACT_APP_GUARD_AI_URL` (and optional realtime URLs) to your **deployed** backend URLs, then `npm run build`. Deploy the `build/` output (e.g. to Vercel).

- **Guard UI:** Set `REACT_APP_GUARD_API_URL` and `REACT_APP_ADMIN_API_URL` to your deployed backend URLs, then `npm run build`. Deploy the `build/` output.

**Vercel (recommended):** Use two Vercel projects (one per frontend), set **Root Directory** and **Environment Variables** as in **VERCEL_DEPLOY.md**. After the first deploy, add the Vercel frontend URLs (e.g. `https://admin-dashboard-xxx.vercel.app`, `https://guard-ui-xxx.vercel.app`) to **CORS_ORIGINS** on both backends and restart them.

- **Full guide:** See **VERCEL_DEPLOY.md** for project settings, env vars, and CORS.
- Ensure every frontend origin you use is listed in **CORS_ORIGINS** on both backends (step 1.1).

**Fix: Deployed app calling localhost (“Not allowed to request resource” / CORS)**

If the deployed admin or guard frontend tries to call `http://localhost:5000` or `http://localhost:4000`, do these three steps:

1. **Step 1 – Get your backend URLs**  
   Use the public HTTPS URLs of your admin and guard backends (e.g. from Railway, Render, or your server). Example: `https://admin-api.up.railway.app`, `https://guard-api.up.railway.app`.

2. **Step 2 – Set environment variables in Vercel**  
   In Vercel → your project (Admin Dashboard or Guard UI) → **Settings** → **Environment Variables** → add for **Production** (and Preview if needed):
   - **Admin Dashboard project:** `REACT_APP_API_URL`, `REACT_APP_ADMIN_API_URL`, `REACT_APP_GUARD_AI_URL` = your admin and guard backend URLs (no trailing slash; `REACT_APP_ADMIN_API_URL` = admin URL + `/api/admin`).
   - **Guard UI project:** `REACT_APP_GUARD_API_URL`, `REACT_APP_ADMIN_API_URL` = same backend URLs.

3. **Step 3 – Redeploy**  
   Deployments → latest deployment → **⋯** → **Redeploy**. Env vars are applied at build time, so a new build is required.

After this, the built app will call your production APIs instead of localhost.

### 2. CORS (allowed origins)

**Status:** Both backends use `CORS_ORIGINS` in `.env`. Include your real frontend origins (e.g. Vercel URLs).

- **Admin backend** (`backend/.env`):  
  `CORS_ORIGINS=https://admin-dashboard-frontend-flax.vercel.app,https://admin-dashboard-frontend-techworldstarzllcs-projects.vercel.app,https://frontend-guard-ui.vercel.app`  
  (replace or add your actual admin and guard frontend URLs).

- **Guard backend** (`abe-guard-ai/backend/.env`):  
  Same comma-separated list of frontend origins.

**When you deploy:** Use your real frontend origins (no trailing slash) in **both** `.env` files, then restart both backends. Otherwise the browser will block requests with CORS errors.

### 1.5 HTTPS and reverse proxy

- Run both backends behind a reverse proxy (e.g. Nginx, Caddy) and terminate TLS there, or use a platform that provides HTTPS.
- Serve the frontend over HTTPS (or the same scheme as the API) to avoid mixed-content issues.

### 1.6 Health and readiness

- Use **GET /health** (liveness) and **GET /health/ready** (readiness, includes DB) for load balancers or Kubernetes. See **HEALTH.md** for paths and example probes.

---

## 2. Best recommendations

### 2.1 Hosting: frontend vs backend

- **Frontend (admin dashboard, guard UI)**  
  **Vercel, Netlify, or similar** are a good fit: static builds, global CDN, automatic HTTPS, and no long-lived processes. Point `REACT_APP_*` URLs to your backend domains.

- **Backend (admin + guard)**  
  **Not Vercel serverless** for these apps. They use:
  - Long-running Node/Express
  - Socket.IO (guard backend)
  - PostgreSQL connections and in-memory state

  Prefer a platform that runs persistent Node processes and supports WebSockets, e.g. **Railway**, **Render**, **Fly.io**, or a **VPS** (e.g. with PM2). Use the health/readiness endpoints (HEALTH.md) for probes.

  **Deploy backends on Railway:** See **RAILWAY_DEPLOY.md** for step-by-step (PostgreSQL, two services, root directories, env vars, and using the generated URLs in Vercel).

### 2.2 CORS

- Set **CORS_ORIGINS** (or equivalent URL vars) on **both** backends to the exact origins of your admin and guard frontends (and mobile app origins if you use Capacitor).
- If you see CORS errors in production, check the one-time warning in backend logs and add the missing origin.

### 2.3 Rate limiting

- Default is **500 requests per 15 minutes per IP** on the admin backend. If AI Agent 24 (or heavy assistant usage) triggers “Too many requests”, set **RATE_LIMIT_MAX** in `backend/.env` to a higher value (e.g. 800 or 1000).
- Auth endpoints have a stricter limit (e.g. 10 attempts per window); adjust **AUTH_RATE_LIMIT_MAX** only if you have a justified need.

### 2.4 Guard UI: “Changed location” / network changes

- When the guard app is used from a different network (e.g. new WiFi or mobile), the saved Server URL / Admin API URL may point to an old IP. If login fails or alerts don’t load, use **“Changed location? Reset URLs”** on the guard login page, then set the Server URL to the current machine IP (e.g. `http://192.168.x.x:4000`). Ensure the guard backend is running and reachable on that IP/port.

### 2.5 Logging and operations

- Production logs are **JSON** (pino). Pipe stdout to your log aggregator (e.g. CloudWatch, Datadog) for search and alerting.
- See **UPGRADE_OPTIONS.md** (Issue #4) for the structured logging implementation.

---

## 3. Common gotchas and fixes

| Issue | Cause | Fix |
|-------|--------|-----|
| `Cannot find module …/backend/src/server.js` | Wrong entry point for admin backend | Use `node server.js` (or `npm start`) from `backend/`, not `node src/server.js`. |
| `Identifier 'crypto' has already been declared` | Duplicate `require('crypto')` in `backend/server.js` | Remove the extra `const crypto = require('crypto');`; keep the one at the top of the file. |
| `Cannot find module 'pino'` | Dependencies not installed after adding pino | Run `npm install` in `backend/` (and in `abe-guard-ai/backend/` if you use pino there). |
| “Too many requests” from AI Agent 24 | Default rate limit exceeded | Increase **RATE_LIMIT_MAX** in `backend/.env` (e.g. 500 → 800). |
| Admin dashboard login not working | Frontend calling wrong API URL | Set correct `REACT_APP_API_URL` (or equivalent) and/or use “Changed location? Reset URLs” on guard; for admin, ensure backend URL and CORS are correct. |
| Guard UI “unable to load alerts” | Guard backend unreachable | Ensure guard backend is running (e.g. port 4000); if IP/URL changed, use “Changed location? Reset URLs” and set Server URL to current host. |

---

## 4. Quick reference

- **Checklist:** PRODUCTION_CHECKLIST.md  
- **Deploy frontends on Vercel:** VERCEL_DEPLOY.md  
- **Deploy backends on Railway:** RAILWAY_DEPLOY.md  
- **Health endpoints:** HEALTH.md  
- **CORS details:** CORS.md  
- **Config and env:** docs/CONFIGURATION_AND_ENV.md, `backend/.env.example`, `abe-guard-ai/backend/.env.example`  
- **Admin backend start:** `backend/README.md` (run `node server.js` from `backend/`)
