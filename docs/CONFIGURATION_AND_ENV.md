# #3 Configuration and env — explanation and how to fix

## What the issue is

Two things make production and onboarding harder than they need to be:

1. **No backend .env examples** — Only the frontends have `.env.example`. The backends use many env vars (`DATABASE_URL`, `JWT_SECRET`, `CORS_ORIGINS`, `PORT`, etc.) but there is no single checklist file. New devs or deployments must infer what to set from code and docs.
2. **Production CORS is easy to misconfigure** — In production, CORS is strict: only origins you list (or that match the built‑in list) are allowed. If you deploy the frontend to a new URL and forget to set `CORS_ORIGINS` (or equivalent) on the backends, browsers will block requests and the app will appear broken with no obvious “missing env” error.

---

## 1. Backend .env examples

**Current state:**  
- `backend/.env` and `abe-guard-ai/backend/.env` exist (or are created by devs) but are gitignored.  
- There is no `backend/.env.example` or `abe-guard-ai/backend/.env.example` that lists required and optional variables.

**Why it’s a problem:**  
- New clones don’t know which keys are required vs optional.  
- Production deployments can miss vars (e.g. `JWT_SECRET`, `DATABASE_URL`, or CORS) and fail at runtime or with confusing CORS errors.

**How to fix:**

- **Done:** **`backend/.env.example`** and **`abe-guard-ai/backend/.env.example`** have been added. They list required and common optional vars with comments and placeholders. Copy to `.env` and fill in real values.
- In README or a “Setup” doc, tell people to copy `.env.example` to `.env` and fill in real values.
- Optionally add a small **startup check** that in production verifies required vars and exits with a clear message (you already do this for `JWT_SECRET` and DB name).

---

## 2. Production CORS

**Current state:**  
- CORS is documented in `CORS.md`: production URLs must be added via `CORS_ORIGINS` (or `GUARD_APP_URL`, `ADMIN_APP_URL`, etc.).
- In production, if none of these are set, only the built‑in list (localhost, capacitor, etc.) is allowed, so a deployed frontend on e.g. `https://app.mycompany.com` will be blocked.

**Why it’s a problem:**  
- Forgetting to set CORS in production causes “CORS error” in the browser with no backend log that says “set CORS_ORIGINS”. It’s easy to misattribute to something else.

**How to fix:**

- **Document clearly** (in `CORS.md` and/or in each backend’s `.env.example`) that in production you **must** set:
  - **Admin backend:** `CORS_ORIGINS` (or `GUARD_APP_URL` / `ADMIN_APP_URL`) to the real frontend origin(s).
  - **Guard backend:** same idea with `CORS_ORIGINS` or `FRONTEND_URL` / `ADMIN_DASHBOARD_URL` / `GUARD_APP_URL`.
- **Optional:** In production, if no custom CORS origin env is set and the request origin is not in the built‑in list, log a **warning** once (e.g. “Production CORS: no CORS_ORIGINS set; request from https://… was blocked. Set CORS_ORIGINS in .env.”) so operators know to add the env.

---

## Summary

| Item | Fix |
|------|-----|
| Backend .env examples | **Done.** `backend/.env.example` and `abe-guard-ai/backend/.env.example` added; document “copy to .env” in setup docs. |
| Production CORS | Documented in CORS.md and in each `.env.example` under “Production CORS”; optionally add a one-time warning when blocking a non-allowed origin in production. |

The optional CORS warning (log when blocking in production) is a nice follow-up if you want faster debugging of CORS issues.
