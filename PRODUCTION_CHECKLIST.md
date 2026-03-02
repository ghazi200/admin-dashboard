# Next steps for production

Use this checklist when deploying the admin-dashboard monorepo to a production environment.

---

## 1. Environment variables

**Both backends** (copy from `.env.example` to `.env` on the server, then set real values):

| Variable | Required in prod? | Notes |
|----------|-------------------|--------|
| `NODE_ENV` | Yes | Set to `production` |
| `DATABASE_URL` | Yes | PostgreSQL URL ending with `/abe_guard` (same DB for both backends) |
| `JWT_SECRET` | Yes | At least 16 characters; **must** be the same in both backends |
| `CORS_ORIGINS` | Yes | Comma-separated list of your frontend origins (e.g. `https://admin.mycompany.com,https://guard.mycompany.com`) |
| `PORT` | Optional | Defaults: admin 5000, guard 4000 |
| `LOG_LEVEL` | Optional | `info` (default) or `debug` / `warn` / `error` |

- **Admin backend:** `backend/.env.example` → `backend/.env`
- **Guard backend:** `abe-guard-ai/backend/.env.example` → `abe-guard-ai/backend/.env`

You can also set `GUARD_APP_URL` and `ADMIN_APP_URL` instead of (or in addition to) `CORS_ORIGINS` on the admin backend; guard backend can use `FRONTEND_URL`, `ADMIN_DASHBOARD_URL`, `GUARD_APP_URL`. See `CORS.md` and each `.env.example`.

---

## 2. CORS

In production, **only origins you list are allowed**. If you deploy the frontend to e.g. `https://app.mycompany.com`, you must add that origin on **both** backends (via `CORS_ORIGINS` or the URL-specific vars above). Otherwise the browser will block requests with CORS errors. The backends log a one-time warning when they block an origin so you can fix this quickly.

---

## 3. Frontend build

Build the frontends with **production API URLs** (no localhost):

- **Admin dashboard:** set `REACT_APP_API_URL` and any other API/socket URLs to your deployed backend URLs, then `npm run build`.
- **Guard UI:** set `REACT_APP_GUARD_API_URL` and `REACT_APP_ADMIN_API_URL` to your deployed backend URLs, then `npm run build`.

Deploy the built static files (e.g. to S3, Netlify, or your web server). Ensure the same URLs are allowed in CORS (step 2).

---

## 4. Run backends in production

- Set `NODE_ENV=production` in the environment (or in `.env`).
- Start the **admin** backend (entry point is `server.js` in backend root): `cd backend && node server.js` or `npm start` (or use a process manager like PM2).
- Start the **guard** backend (entry point is `src/server.js`): `cd abe-guard-ai/backend && node src/server.js` or `npm start`.

Both backends already:

- Require `JWT_SECRET` (and exit with a clear error if missing in production).
- Use helmet and rate limiting.
- Use structured JSON logging (pino); in production logs are JSON for aggregation (e.g. CloudWatch, Datadog).

---

## 5. HTTPS and reverse proxy (recommended)

- Put both backends behind a reverse proxy (e.g. Nginx, Caddy) and terminate TLS there, or use a hosted platform that provides HTTPS.
- Ensure the frontend is served over HTTPS (or the same scheme as your API) to avoid mixed-content issues.

---

## 6. Optional follow-ups

- **Log aggregation:** Production logs are JSON; pipe stdout to your log service (e.g. CloudWatch Logs, Datadog) for search and alerting.
- **Health checks:** Use `GET /health` (liveness) and `GET /health/ready` (readiness, includes DB) for load balancers or Kubernetes. See `HEALTH.md`.
- **Mobile (Capacitor):** If you ship the guard or admin app as a mobile app, build with production API URLs and add the app’s origin(s) to CORS (e.g. `capacitor://localhost` for default Capacitor). See `frontend-guard-ui/BUILD_MOBILE.md` and `CORS.md`.

---

**Summary:** The immediate next step for production is: set `NODE_ENV=production`, configure `DATABASE_URL` and `JWT_SECRET` and **CORS_ORIGINS** (or equivalent) on both backends, build the frontends with production API URLs, then run the backends behind HTTPS. Use this checklist and the `.env.example` files so nothing is missed.
