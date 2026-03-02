# Deploy Backends on Railway

Deploy the **Admin backend** and **Guard backend** as two Railway services. Railway runs Node.js and provides PostgreSQL. After deploy you’ll have public URLs to use in Vercel’s `REACT_APP_API_URL` and related env vars.

---

## 1. Prerequisites

- A [Railway](https://railway.app) account (sign up with GitHub).
- Your repo pushed to GitHub (Railway deploys from Git or CLI).

---

## 2. Create a Railway project and database

1. Go to [railway.app](https://railway.app) and log in.
2. Click **New Project**.
3. Choose **Deploy from GitHub repo** and select your `admin-dashboard` repo (or the repo that contains `backend/` and `abe-guard-ai/backend`).
4. **Add PostgreSQL:** In the project, click **+ New** → **Database** → **PostgreSQL**. Railway will create a DB and expose `DATABASE_URL` as a variable.
5. Copy **`DATABASE_URL`** from the PostgreSQL service (Variables tab or Connect). You’ll use it for both backends. It often looks like:
   ```text
   postgresql://postgres:PASSWORD@HOST:PORT/railway
   ```
   The app expects a database named **`abe_guard`**. If your URL ends with `/railway`, either:
   - In Railway’s PostgreSQL data tab (or with `psql`), create a database named `abe_guard`, then set `DATABASE_URL` to the same URL but with `/abe_guard` at the end (e.g. `.../railway` → `.../abe_guard`), or
   - Run your migrations against the default DB and use that name in `DATABASE_URL`.

---

## 3. Deploy Admin backend (first service)

1. In the same project, click **+ New** → **GitHub Repo** (or **Service** if you already have the repo connected) and select the same repo.
2. Select the new service. Open **Settings** (or **Variables**).
3. Set **Root Directory** (or **Source**):  
   **`backend`**  
   (so Railway runs from the `backend/` folder).
4. **Variables** – add (or use “Raw Editor” and paste; replace placeholders):

   | Variable | Value | Required |
   |----------|--------|----------|
   | `NODE_ENV` | `production` | Yes |
   | `DATABASE_URL` | (paste from PostgreSQL service; see step 2) | Yes |
   | `JWT_SECRET` | At least 16 random characters (same as Guard) | Yes |
   | `CORS_ORIGINS` | `https://admin-dashboard-frontend-flax.vercel.app,https://admin-dashboard-frontend-techworldstarzllcs-projects.vercel.app,https://frontend-guard-ui.vercel.app` | Yes |

   **Optional:** Reference the PostgreSQL `DATABASE_URL` from the DB service (Railway can link services so the variable is shared).

5. Railway sets `PORT` automatically; the app uses `process.env.PORT || 5000`.
6. **Deploy:** Railway will build and deploy. Under **Settings** → **Networking** (or **Deployments**), click **Generate Domain** to get a public URL, e.g. `https://admin-dashboard-backend-production-xxxx.up.railway.app`. **Copy this URL** — this is your **Admin backend URL** for Vercel.

---

## 4. Deploy Guard backend (second service)

1. In the same project, click **+ New** → **GitHub Repo** (or duplicate/clone from repo) and select the same repo again.
2. Select this new service. Open **Settings**.
3. Set **Root Directory**:  
   **`abe-guard-ai/backend`**  
   (so Railway runs from the guard backend folder).
4. **Variables** – add:

   | Variable | Value | Required |
   |----------|--------|----------|
   | `NODE_ENV` | `production` | Yes |
   | `DATABASE_URL` | Same as Admin (same PostgreSQL URL) | Yes |
   | `JWT_SECRET` | **Same value as Admin backend** | Yes |
   | `CORS_ORIGINS` | `https://admin-dashboard-frontend-flax.vercel.app,https://admin-dashboard-frontend-techworldstarzllcs-projects.vercel.app,https://frontend-guard-ui.vercel.app` | Yes |

5. **Generate Domain** for this service. **Copy this URL** — this is your **Guard backend URL** for Vercel.

---

## 5. Database name (optional)

Both backends expect a database named **`abe_guard`** (or `abe-guard`) by default. If your Railway PostgreSQL URL points to a DB with a different name (e.g. `railway`):

- Create a database named `abe_guard` in the same PostgreSQL instance (e.g. via Railway’s PostgreSQL UI or `psql`), and set `DATABASE_URL` to that DB, **or**
- Keep using the default DB name in the URL and ensure your migrations have been run for that DB.

---

## 6. After deploy: use URLs in Vercel

Use the **Admin** and **Guard** Railway URLs in your Vercel frontends:

**Admin Dashboard (Vercel) – Environment Variables:**

| Key | Value |
|-----|--------|
| `REACT_APP_API_URL` | `https://YOUR-ADMIN-RAILWAY-URL.up.railway.app` |
| `REACT_APP_ADMIN_API_URL` | `https://YOUR-ADMIN-RAILWAY-URL.up.railway.app/api/admin` |
| `REACT_APP_GUARD_AI_URL` | `https://YOUR-GUARD-RAILWAY-URL.up.railway.app` |

**Guard UI (Vercel):**

| Key | Value |
|-----|--------|
| `REACT_APP_GUARD_API_URL` | `https://YOUR-GUARD-RAILWAY-URL.up.railway.app` |
| `REACT_APP_ADMIN_API_URL` | `https://YOUR-ADMIN-RAILWAY-URL.up.railway.app` |

Then **Redeploy** both Vercel projects so the new env vars are used.

---

## 7. Quick reference

| Item | Admin backend | Guard backend |
|------|----------------|----------------|
| **Root Directory** | `backend` | `abe-guard-ai/backend` |
| **Start command** | `npm start` → `node server.js` | `npm start` → `node src/server.js` |
| **Required env** | `NODE_ENV`, `DATABASE_URL`, `JWT_SECRET`, `CORS_ORIGINS` | Same |

- **JWT_SECRET:** Must be identical on both backends (e.g. 32+ random characters).
- **CORS_ORIGINS:** Comma-separated list of your Vercel frontend URLs (no trailing slash).
- **Health:** Admin exposes `GET /health` and `GET /health/ready`; you can use these in Railway health checks if needed.

For full production steps (CORS, HTTPS, frontends), see **STEPS_TO_PRODUCTION_AND_RECOMMENDATIONS.md**.
