# Capacitor Hybrid: Admin Dashboard + Guard-UI — Pre-Implementation Review

This document reviews the codebase (admin-dashboard and references to abe-guard-ai and guard-ui) so nothing is overlooked before adding Capacitor for:
1. **Admin dashboard** — Capacitor wrapper around the existing React web app.
2. **Guard-ui** — Capacitor wrapper (guard-ui is a separate app; this repo contains reference components and the backend guard APIs).

---

## 1. Current Architecture Summary

### 1.1 What Lives in This Repo (admin-dashboard)

| Piece | Path | Purpose |
|-------|------|--------|
| **Admin frontend** | `frontend-admin-dashboard/admin-dashboard-frontend/` | React (CRA) SPA. Entry: `src/index.js` → `App.js`. Uses React Router, TanStack Query, Axios, Tailwind. |
| **Admin backend** | `backend/` | Node/Express on **port 5000**. Serves `/api/admin/*`, `/api/guard/*`, `/api/guards/*`. Same DB (abe_guard). |
| **Guard-ui components** | `frontend-admin-dashboard/.../src/components/guard-ui/` | **Reference** components for guard messaging/availability/shift-swap. Not a standalone app; meant to be copied into a **separate guard-ui app** (see README_MESSAGES.md). |

### 1.2 What Is External (Not in This Repo)

| Piece | Referenced As | Purpose |
|-------|----------------|--------|
| **abe-guard-ai** | Backend **port 4000** | Second backend. Admin frontend calls it via `abeGuardAiClient` (REACT_APP_GUARD_AI_URL). Used for: Supervisor/ask, schedule, reputation, incidents, inspections, announcements. Admin backend connects to it via Socket.IO for callout_started (env: ABE_GUARD_AI_URL). |
| **guard-ui** | Separate app (e.g. guard frontend) | Standalone app for guards (login, shifts, messages, etc.). Uses **admin-dashboard backend** at 5000: `/api/guard/login`, `/api/guard/messages/*`, `/api/guards/*` (shift swap, availability, report, history, analytics). Not present in this workspace; may live in abe-guard-ai repo or elsewhere. |

### 1.3 Two Backends, Two Tokens

- **Admin dashboard frontend** talks to:
  - **Port 5000** (this backend): `axiosClient` → `/api/admin/*`; token: `localStorage.adminToken`.
  - **Port 4000** (abe-guard-ai): `abeGuardAiClient` → supervisor, reputation, incidents, inspections, announcements; same `adminToken`.
- **Guard app (guard-ui)** would talk to:
  - **Port 5000** only: `/api/guard/*`, `/api/guards/*`; token: `localStorage.guardToken` (from `/api/guard/login`).

---

## 2. Admin Dashboard Frontend — Details for Capacitor

### 2.1 Entry and Build

- **Entry:** `src/index.js` (createRoot, QueryClientProvider, App). Not `main.jsx` (main.jsx has duplicate/legacy content).
- **Build:** `npm run build` → `build/` (static files). Capacitor will point to this output (or to a deployed URL).
- **Router:** `App.js` uses `BrowserRouter`; in Capacitor you typically use the same or `HashRouter` so deep links work with file:// or single-domain loading.

### 2.2 Environment Variables (Must Work in Capacitor Build)

| Variable | Used In | Purpose |
|----------|---------|--------|
| `REACT_APP_API_URL` | axiosClient.js | Base URL for admin backend (5000). **Critical:** In Capacitor app, this must be your **production/deployed** backend URL (e.g. `https://api.yourdomain.com`), not localhost. |
| `REACT_APP_GUARD_AI_URL` | abeGuardAiClient.js | abe-guard-ai backend (4000). Same: use production URL in app. |
| `REACT_APP_GOOGLE_MAPS_API_KEY` | GeographicDashboard.jsx, SitesMap.jsx | Google Maps JS API. Required for map page. For Capacitor, ensure key allows your app’s bundle ID / origin. |
| `REACT_APP_SESSION_TIMEOUT_MINUTES` | useSessionTimeout.js | Optional. |
| `REACT_APP_ADMIN_API_URL` | Login.jsx | Fallback for login API URL. |
| `REACT_APP_GUARD_REALTIME_URL` / `REACT_APP_ADMIN_REALTIME_URL` | realtime/socket.js | Socket.IO URLs (4000 / 5000). Use production URLs in app. |

### 2.3 Browser / DOM Assumptions (To Adjust or Keep)

- **Storage:** `localStorage` (adminToken, adminUser, adminInfo). Works in WebView; for production you may switch to Capacitor Preferences or a secure store.
- **Redirects:** `window.location.href = "/login"` and similar. Prefer React Router `navigate()` where possible so the app stays in the WebView.
- **Dialogs:** `window.confirm`, `window.prompt` in many places (Guards, Shifts, Messages, Staff, etc.). Consider Capacitor Dialog or in-app modals for a consistent mobile experience.
- **Maps:** Google Maps loaded via dynamic script and `window.google`. Works in WebView; test on device for touch and viewport.
- **File download:** `document.createElement("a")` + `window.URL.createObjectURL` in ReportBuilder, CommandCenter. On mobile you may need to open in browser or use Capacitor Filesystem/Share.
- **Realtime:** Socket.IO in `realtime/socket.js` (adminToken). Works in WebView; ensure production Socket URLs and CORS.

### 2.4 Proxy and Base URL

- **Dev:** `setupProxy.js` forwards `/api` → `http://localhost:5000`. Capacitor builds do **not** use the dev server; the app must use **absolute** backend URLs (via REACT_APP_*).
- **axiosClient:** When `backendOrigin` is set (from REACT_APP_API_URL or localhost check), it builds full URLs. For Capacitor, set `REACT_APP_API_URL` to your backend so all `/api/admin` requests go to the right host.
- **abeGuardAiClient:** Uses `REACT_APP_GUARD_AI_URL`; no proxy in Capacitor, so this must be set for production.

### 2.5 CORS and Backend

- Backend (server.js) CORS allows `localhost:3000, 3001, 3002`. For Capacitor you must allow your app’s origin: e.g. `capacitor://localhost` (iOS) and `http://localhost` (Android) for Capacitor’s default scheme, or your custom scheme. **Action:** Add these origins to CORS when you deploy for mobile.

---

## 3. Guard-UI and Guard APIs — Details for Guard Capacitor App

### 3.1 Where Is Guard-UI?

- **Not in this repo.** The folder `src/components/guard-ui/` is a set of **reference** components (GuardMessages, AvailabilityPreferences, ShiftSwapMarketplace, guardMessaging.service.js) intended to be **copied into** a separate guard-ui application.
- To wrap **guard-ui** with Capacitor, you need the **actual guard-ui app** (its own repo or inside abe-guard-ai). This review cannot inspect that codebase; the checklist below assumes you have (or will create) a guard web app that uses the APIs below.

### 3.2 Guard API Surface (Admin-Dashboard Backend, Port 5000)

All guard-facing endpoints live on **this** backend (5000). A guard Capacitor app must point to this backend (production URL).

| Area | Base Path | Auth | Notes |
|------|-----------|------|--------|
| **Auth** | `/api/guard/login` | — | Returns JWT; store as guardToken. |
| **Messages** | `/api/guard/messages` | Bearer guardToken | Conversations, messages, send, delete, mark read. See guardMessages.routes.js. |
| **Shift swap** | `/api/guards/shifts/swap/*` | Bearer guardToken | Request, available, accept, cancel. |
| **Availability** | `/api/guards/availability/preferences` | Bearer guardToken | GET/PUT. |
| **Shift report** | `/api/guards/shifts/:id/report` | Bearer guardToken | POST/GET. |
| **Shift history** | `/api/guards/shifts/history` | Bearer guardToken | GET with query params. |
| **Shift analytics** | `/api/guards/shifts/analytics` | Bearer guardToken | GET. |

Guard-ui (and thus the guard Capacitor app) must set its API base URL to this backend (e.g. REACT_APP_API_URL or equivalent) and send `Authorization: Bearer <guardToken>` on every request.

### 3.3 Guard-UI Capacitor Checklist (When You Have the Guard App)

- Same as admin: env vars for backend URL; no localhost in production build.
- Token storage: guardToken (localStorage or Capacitor Preferences / secure store).
- CORS: backend must allow the guard app’s Capacitor origin(s).
- If guard-ui uses abe-guard-ai (e.g. for features beyond this backend), configure that URL too.

---

## 4. abe-guard-ai — What This Repo Assumes

- **URL:** `ABE_GUARD_AI_URL` (backend, default `http://localhost:4000`); `REACT_APP_GUARD_AI_URL` (frontend).
- **Admin backend** connects to abe-guard-ai over Socket.IO for `callout_started` (calloutNotificationListener.js).
- **Admin frontend** uses abe-guard-ai REST API for: supervisor ask/schedule, reputation, incidents, inspections, announcements (see api.js and abeGuardAiClient.js).
- **Not in this workspace:** You need abe-guard-ai’s codebase (and, if applicable, guard-ui’s) elsewhere. For Capacitor you only need to know the **production URLs** for 5000 and 4000 and to allow mobile origins in CORS on both backends.

---

## 5. Capacitor Implementation Checklist (Nothing Overlooked)

### 5.1 Admin Dashboard — Capacitor Wrapper

- [ ] Install Capacitor in `frontend-admin-dashboard/admin-dashboard-frontend` (e.g. `npm install @capacitor/core @capacitor/cli`, then `npx cap init`).
- [ ] Configure `capacitor.config.ts`: set `webDir` to `build`; set `server.url` if you want to load from a deployed URL instead of bundled files.
- [ ] Add platforms: `npx cap add ios`, `npx cap add android`.
- [ ] **Build:** Run `npm run build`; ensure `REACT_APP_API_URL`, `REACT_APP_GUARD_AI_URL`, and (if used) `REACT_APP_GOOGLE_MAPS_API_KEY` and Socket URLs are set for **production** in the build env.
- [ ] **Entry:** Ensure the app loads with a single origin (no proxy). Use `HashRouter` if you have issues with deep links when serving from file:// or a single URL.
- [ ] **Backend CORS:** Add Capacitor origins (`capacitor://localhost`, `http://localhost`, and any custom scheme) to admin backend (5000) and, if the app hits 4000 from the device, to abe-guard-ai.
- [ ] **Optional:** Replace `localStorage` with Capacitor Preferences (or secure store) for adminToken; replace `window.confirm`/`window.prompt` with Capacitor Dialog or in-app modals; test file downloads and maps on device.
- [ ] **Icons and splash:** Add app icon and splash screen in Capacitor project (and in `index.html` / manifest if you add PWA manifest).
- [ ] **Google Maps:** If you use Maps in the app, confirm API key restrictions allow the Capacitor app (iOS bundle ID, Android package name, or HTTP referrers as applicable).

### 5.2 Guard-UI — Capacitor Wrapper

- [ ] **Locate or create** the guard-ui web app (separate from admin-dashboard). If it doesn’t exist, build a minimal guard web app that uses the guard API surface above, then wrap it.
- [ ] In that project: Install Capacitor, init, add ios/android, set `webDir` to the guard app’s build output.
- [ ] Set guard app’s API base URL to the **same** backend (5000) via env (e.g. REACT_APP_API_URL or equivalent). Build with production URL for Capacitor.
- [ ] Ensure guard login stores `guardToken` and all guard API calls send `Authorization: Bearer <guardToken>`.
- [ ] Add guard app’s Capacitor origins to backend (5000) CORS.
- [ ] Optional: Capacitor Preferences or secure store for guardToken; replace any confirm/prompt; test on device.

### 5.3 Backend and abe-guard-ai (No Code Changes Required for “Wrapping”)

- [ ] Admin backend (5000): CORS updated for admin Capacitor app origins.
- [ ] abe-guard-ai (4000): If admin or guard app calls it from the device, CORS there too for the same origins.
- [ ] Both backends must be reachable over HTTPS from phones (same as for web in production).

---

## 6. Risks and Gotchas

1. **Two backends:** Admin app hits 5000 and 4000. Both URLs must be correct in the built app; no proxy in Capacitor.
2. **Two entry points:** Confirm the app entry is `index.js` (App + QueryClientProvider). main.jsx appears to mix Dashboard and App and may be unused.
3. **Guard-ui not in repo:** Guard Capacitor work depends on having the guard-ui app. If it’s inside abe-guard-ai, you need that repo and its build setup.
4. **Maps and downloads:** Test Google Maps and any blob-download flows on real devices; they may need small tweaks for touch and for opening files.
5. **Socket.IO:** Realtime works in WebView; use production Socket URLs and ensure no mixed content (HTTPS backends when app is served over HTTPS or capacitor://).

---

## 7. Suggested Order of Work

1. **Admin dashboard Capacitor (this repo)**  
   Init Capacitor in admin frontend → production env build → add iOS/Android → CORS for Capacitor origins → run on simulator/device and verify login, dashboard, and one flow that uses abe-guard-ai (e.g. Supervisor).

2. **Guard-ui Capacitor (separate codebase)**  
   Once guard-ui app is available: same steps (Cap init, build with production API URL, CORS for guard app origins, test login and messages/shifts on device).

3. **Polish**  
   Storage, dialogs, maps, downloads, icons/splash as needed.

This review is complete for the admin-dashboard repo and for the guard API surface and abe-guard-ai references. No implementation was done; use this document to avoid overlooking env, CORS, two-backend, or guard-ui location issues when you start implementation.
