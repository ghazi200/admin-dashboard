# Guard UI – Review for Running with Admin Dashboard

**Guard UI is the mobile app for guards** (iOS and Android via Capacitor). It is the companion to the admin dashboard: admins use the web admin dashboard; guards use this app for shifts, time clock, messages, and reports.

This doc summarizes how the guard-ui is wired and what you need to bring it online with the admin-dashboard backend.

---

## 1. Mobile (Capacitor)

- **Target:** iOS and Android native apps (Capacitor wraps the React build in a WebView).
- **Scripts:** `npm run build:mobile` (build + `cap sync`), `npm run cap:ios`, `npm run cap:android`.
- **On device:** The app uses full API URLs (no dev proxy). Set `REACT_APP_GUARD_API_URL` and `REACT_APP_ADMIN_API_URL` to your deployed backends (or your machine’s LAN IP when testing with phone and local servers). On Android emulator, the app can use `10.0.2.2` to reach the host.
- **Details:** See **`BUILD_MOBILE.md`** and **`PHONE_LOGIN.md`** in this repo for build, run, and login on device/emulator.

---

## 2. Two-backend design

Guard-ui talks to **two** backends:

| Backend | Env var | Purpose |
|--------|---------|--------|
| **Guard API** (abe-guard-ai) | `REACT_APP_GUARD_API_URL` | Login, list shifts, time clock (clock in/out/break), dashboard, overtime, earnings, paystubs, policy ask, incidents, notifications, alerts |
| **Admin API** (admin-dashboard) | `REACT_APP_ADMIN_API_URL` | Guard shift management (swap, availability, shift report, shift history, analytics), guard messages |

- **Login** today: `guardClient.post("/auth/login", ...)` → Guard API at `REACT_APP_GUARD_API_URL` (e.g. abe-guard-ai).
- **Admin-dashboard** already has guard login at **`POST /api/guard/login`** (same DB as guards). If you want a single backend for auth, you can point Guard API URL at admin and add an alias (see below).

---

## 3. Config and URLs

- **`src/config/apiUrls.js`**  
  - `getGuardApiUrl()`: in dev returns `/guard-api` (proxied). In production uses `localStorage` override, then `REACT_APP_GUARD_API_URL`, then default `http://localhost:4000`.  
  - `getAdminApiUrl()`: same idea for admin; default `http://localhost:5000`.

- **`src/setupProxy.js`** (dev only):  
  - `/api/guard` → admin-dashboard (`REACT_APP_ADMIN_API_URL` or `http://localhost:5000`).  
  - `/guard-api` → Guard API (`REACT_APP_GUARD_API_URL` or `http://localhost:4000`), path rewritten so request goes to Guard backend root.

- **Production:** No proxy. All requests use full URLs from env (or localStorage overrides). Set both env vars to your deployed backends.

---

## 4. Auth and tokens

- **Guard token:** Stored in `localStorage` as `guardToken`. Used by:
  - `guardClient` (Guard API)
  - `shiftManagementClient` (Admin API)
  - `messagesClient` (Admin API)
- **Login response:** Guard API typically returns `{ token, user }`. Admin-dashboard returns `{ token, guard }`. The app now accepts both and passes either as the “user” object so the rest of the UI works.

---

## 5. What admin-dashboard already provides for guards

These are mounted in `server.js` and work with the same JWT/guard token:

- **`POST /api/guard/login`** – Guard login (email/password), returns `{ token, guard }`.
- **`/api/guards/*`** – Shift swap (request, available, accept, cancel), availability preferences, shift report (submit/get), shift history, shift analytics.
- **`/api/guard/messages/*`** – Conversations, messages, read, delete.

So: **login, shift management, and messaging** can all run on admin-dashboard only.

---

## 6. What still requires the Guard API (abe-guard-ai)

If you use only admin-dashboard, these guard-ui features will **not** work until implemented (or proxied) on admin-dashboard:

- **`GET /shifts`** – List shifts for the guard.
- **`GET /shifts/:id/state`** – Shift state.
- **`POST /shifts/:id/clock-in`** – Time clock: clock in (with location).
- **`POST /shifts/:id/clock-out`** – Clock out.
- **`POST /shifts/:id/break-start`** / **`break-end`** – Break.
- **`POST /shifts/:id/running-late`** – Running late.
- **`GET /api/guard/dashboard`** – Guard dashboard.
- **Overtime** – status, offers, accept/decline, request.
- **Earnings / paystubs** – `/api/guard/earnings`, `/api/guard/paystubs/*`.
- **Policy ask** – `/api/guard/policy/ask`.
- **Incidents** – submit (if guard-ui posts to Guard API).
- **Notifications / alerts** – if they come from Guard API.

So: **time clock, dashboard, overtime, earnings, and some notifications** currently expect the Guard API.

---

## 7. Bringing guard-ui online (practical options)

### Option A – Both backends deployed (full guard-ui)

1. Deploy **admin-dashboard** (e.g. Railway) and **abe-guard-ai** (Guard API).
2. In guard-ui repo, add a **`.env`** (from `.env.example`):
   - `REACT_APP_GUARD_API_URL=https://your-guard-api.railway.app` (or your Guard API URL).
   - `REACT_APP_ADMIN_API_URL=https://your-admin-dashboard.railway.app`.
3. Build: `npm run build`.
4. Deploy the build (Vercel, Netlify, or static host).
5. **CORS:** Allow the guard-ui origin on both backends (admin-dashboard and Guard API).

### Option B – Admin-dashboard only (login + shift management + messages)

1. Deploy **admin-dashboard** only.
2. Set guard-ui env to use admin for **both** URLs so login works:
   - `REACT_APP_GUARD_API_URL=https://your-admin-dashboard.railway.app`
   - `REACT_APP_ADMIN_API_URL=https://your-admin-dashboard.railway.app`
3. Add on admin-dashboard an **alias** so guard login works from guard-ui without code changes:
   - Mount **`POST /auth/login`** that calls the same logic as `POST /api/guard/login` (see below).
4. Build and deploy guard-ui.
5. **Result:** Login, shift swap, availability, shift report, history, analytics, and messages work. **Time clock, guard dashboard, overtime, earnings** will 404 until you implement or proxy them on admin-dashboard.

---

## 8. Optional: `/auth/login` alias on admin-dashboard

Guard-ui calls `baseURL + "/auth/login"`. If `REACT_APP_GUARD_API_URL` points to admin, that becomes `https://admin.../auth/login`. Admin currently has only `POST /api/guard/login`. To support that without changing guard-ui:

In **admin-dashboard** `server.js` (before or after the existing `/api/guard` mount), add:

```js
const guardAuthController = require("./src/controllers/guardAuth.Controller");
app.post("/auth/login", guardAuthController.login);
```

Then guard-ui login works when Guard API URL is set to the admin-dashboard URL. Response is `{ token, guard }`; guard-ui now treats `guard` as the user object.

---

## 9. Checklist to run guard-ui with admin-dashboard

- [ ] Copy `.env.example` to `.env` and set:
  - `REACT_APP_GUARD_API_URL` (Guard API or admin URL if using Option B).
  - `REACT_APP_ADMIN_API_URL` (admin-dashboard URL).
- [ ] If using admin for login: add `POST /auth/login` alias on admin (see §7) or change guard-ui to call `POST /api/guard/login` and set Guard API URL to admin.
- [ ] Ensure guards exist in the same DB as admin-dashboard (same `guards` table) and have `email` + `password_hash`.
- [ ] CORS: allow the guard-ui origin (e.g. `https://guards.yourdomain.com`) on admin-dashboard (and on Guard API if used).
- [ ] Build: `npm run build` (from `frontend-guard-ui`).
- [ ] Deploy the `build` folder and configure the host to serve the SPA (e.g. redirect all routes to `index.html`).

---

## 10. Files touched for “admin-only” login compatibility

- **`src/pages/Login.jsx`** – Uses `res?.data?.guard || res?.data?.user` so admin’s `{ token, guard }` is accepted and the guard is stored as the current user.

No other guard-ui code was changed; the rest of the app already uses `guardToken` and the stored user object.
