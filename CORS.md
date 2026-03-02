# CORS configuration

Both backends are configured to allow the guard app and admin app origins, including **Capacitor** (mobile) and optional **production URLs** via env.

---

## What’s allowed by default

| Backend | Origins allowed |
|--------|------------------|
| **admin-dashboard (5000)** | localhost:3000, 3001, 3002; capacitor://localhost; http/https localhost |
| **abe-guard-ai (4000)** | Same localhost + 127.0.0.1, capacitor://localhost, http/https localhost; FRONTEND_URL, ADMIN_DASHBOARD_URL, GUARD_APP_URL from env |

Socket.IO on the admin-dashboard backend uses the same origin list as the HTTP CORS middleware.

---

## Production: add your app URLs

**You must set these in production** (in each backend’s `.env` or environment) so the backends allow your deployed or Capacitor app. If you don’t, browsers will block requests with CORS errors. See each backend’s `.env.example` for the exact variable names.

**admin-dashboard backend (5000)** — in `backend/.env` or environment:

- `CORS_ORIGINS` — comma-separated list, e.g. `https://guard.mycompany.com,https://admin.mycompany.com`
- or `GUARD_APP_URL` and/or `ADMIN_APP_URL` — single URLs (each can be added as an allowed origin)

**abe-guard-ai backend (4000)** — in `abe-guard-ai/backend/.env` or environment:

- `CORS_ORIGINS` — comma-separated list, e.g. `https://guard.mycompany.com`
- or `GUARD_APP_URL`, `FRONTEND_URL`, `ADMIN_DASHBOARD_URL` — single URLs

Example (admin-dashboard backend):

```bash
export CORS_ORIGINS="https://guard.mycompany.com,https://admin.mycompany.com"
# or
export GUARD_APP_URL="https://guard.mycompany.com"
export ADMIN_APP_URL="https://admin.mycompany.com"
```

Capacitor apps often use `capacitor://localhost` or `https://localhost`; those are already allowed. If you use a custom scheme, add it to `CORS_ORIGINS`.
