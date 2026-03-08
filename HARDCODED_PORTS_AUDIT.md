# Audit: All References to Port 5000 and 4000

This document lists every file in the repo that references `localhost:5000`, `localhost:4000`, or port `5000`/`4000` in a way that could affect runtime behavior. **Fixes applied** are for the admin-dashboard frontend (Vercel) so it never calls localhost in production.

---

## Admin-dashboard frontend (deployed on Vercel) — FIXED

| File | Was | Now |
|------|-----|-----|
| `frontend-admin-dashboard/.../src/api/axiosClient.js` | Used localhost:5000 when hostname localhost; else Railway. | Uses shared `apiOrigin.getBackendOrigin()` (same behavior; no hardcode). |
| `frontend-admin-dashboard/.../src/api/apiOrigin.js` | (new) | **Single source of truth:** `getBackendOrigin()` (5000/Railway), `getGuardAiOrigin()` (4000). |
| `frontend-admin-dashboard/.../src/services/superAdmin.js` | **Hardcoded** `baseURL: "http://localhost:5000/api/super-admin"`. | Uses `getBackendOrigin()` + request-time interceptor; production → Railway. |
| `frontend-admin-dashboard/.../src/components/guard-ui/guardMessaging.service.js` | Returned `""` when not localhost (so relative URL → wrong origin). | Uses `getBackendOrigin()`; production → Railway. |
| `frontend-admin-dashboard/.../src/pages/Login.jsx` | BUILD_API_URL default localhost:5000; runtime override + production fallback already present. | No change (already correct). |
| `frontend-admin-dashboard/.../src/pages/Inspections.jsx` | **Hardcoded** `http://localhost:4000${photo.url}` for photo links. | Uses `getGuardAiOrigin()` (env or localhost only when on localhost). |
| `frontend-admin-dashboard/.../src/pages/Payroll.jsx` | **Hardcoded** `http://localhost:4000${stub.file_url}`. | Uses `getGuardAiOrigin()`. |
| `frontend-admin-dashboard/.../src/pages/Incidents.jsx` | **Hardcoded** `http://localhost:4000${att.url}`. | Uses `getGuardAiOrigin()`. |
| `frontend-admin-dashboard/.../src/api/abeGuardAiClient.js` | `process.env.REACT_APP_GUARD_AI_URL \|\| "http://localhost:4000"` (build-time). | No change; set `REACT_APP_GUARD_AI_URL` in production for abe-guard-ai. |
| `frontend-admin-dashboard/.../src/setupProxy.js` | `target: "http://localhost:5000"` | Dev only; not used in production build. |
| `frontend-admin-dashboard/.../src/context/NotificationContext.jsx` | Error message text only: "server running on http://localhost:5000". | Cosmetic; no request URL. |
| `frontend-admin-dashboard/.../src/components/AuthLayout.jsx` | Subtitle text ":5000". | Cosmetic only. |
| `frontend-admin-dashboard/.../src/components/Layout.jsx` | "Backend: :5000" text. | Cosmetic only. |

---

## Frontend guard-ui (separate app; dev / mobile)

| File | Reference | Note |
|------|-----------|-----|
| `frontend-guard-ui/src/config/apiUrls.js` | Defaults `http://localhost:4000`, `http://localhost:5000` | Used when env not set; for dev/mobile. Set `REACT_APP_GUARD_API_URL` and `REACT_APP_ADMIN_API_URL` for production builds. |
| `frontend-guard-ui/src/setupProxy.js` | `http://localhost:5000`, `http://localhost:4000` | Dev proxy only. |
| `frontend-guard-ui/src/pages/Login.jsx` | Placeholders / defaults 4000, 5000, 10.0.2.2:5000 | UI placeholders and emulator defaults. |
| `frontend-guard-ui/src/pages/ShiftSwapMarketplace.jsx` | Error message "port 5000" | User-facing message only. |
| `frontend-guard-ui/package.json` | `"proxy": "http://localhost:4000"` | Dev only. |

---

## Backend (admin-dashboard)

| File | Reference | Note |
|------|-----------|-----|
| `backend/server.js` | CORS origins localhost:3000, 3001, 3002 | Allowed origins; not a request URL. |
| `backend/src/services/calloutNotificationListener.js` | `ABE_GUARD_AI_URL \|\| "http://localhost:4000"` | Server-side; set env in production. |
| All `backend/src/scripts/*.js` | Various `BASE_URL` / `API_BASE` defaults to localhost:5000 or 4000 | **Test/script only**; not used by deployed frontend. |

---

## abe-guard-ai backend

| File | Reference | Note |
|------|-----------|-----|
| `abe-guard-ai/backend/src/scripts/*.js` | Test scripts with localhost:4000 or 5000 | Scripts only; env override supported. |
| `abe-guard-ai/backend/src/api.js` | `process.env.API_URL \|\| "http://localhost:4000"` | Server-side. |
| `abe-guard-ai/backend/src/scripts/testTenantIsolation.js` | `GUARD_API_URL \|\| "http://localhost:5000"` | Likely typo (guard API is 4000); script only. |

---

## Docs / markdown / examples

All remaining references are in:

- `*.md` (TROUBLESHOOTING.md, LOGIN_*.md, BUILD_MOBILE.md, HEALTH.md, etc.): curl examples, setup instructions.
- `frontend-admin-dashboard/.../BUILD_MOBILE.md`, `frontend-guard-ui/PHONE_LOGIN.md`, etc.: instructions to set env vars.
- `.env.example` files: default values for local dev.

No code path in the **deployed admin-dashboard frontend** now hardcodes `localhost:5000` or `localhost:4000` for API or asset requests; they go through `apiOrigin.js` (admin backend → Railway when not on localhost; guard-ai → env or localhost-only).

---

## Production env vars (reminder)

- **Admin dashboard frontend (Vercel):**  
  `REACT_APP_API_URL`, `REACT_APP_ADMIN_API_URL` → Railway URL.  
  `REACT_APP_GUARD_AI_URL` → abe-guard-ai backend URL (for Inspections/Payroll/Incidents asset links).
- **Backend (Railway):**  
  `CORS_ORIGINS` = Vercel frontend URL.
- **Guard UI (if deployed):**  
  `REACT_APP_GUARD_API_URL`, `REACT_APP_ADMIN_API_URL` for the deployed backends.
