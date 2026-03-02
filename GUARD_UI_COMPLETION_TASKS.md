# Guard-UI Completion: What Needs to Be Done

After reviewing the **standalone guard-ui** app (`guard-ui/guard-ui`), this document lists what remains to **complete the task** (production-ready guard app, optionally mobile).

---

## Current state (guard-ui/guard-ui)

| Area | Status | Backend |
|------|--------|--------|
| Login | ✅ Implemented | abe-guard-ai (4000) |
| Call out | ✅ Callouts.jsx + triggerCallout | 4000 |
| Running late | ✅ RunningLateDropdown + runningLate | 4000 |
| Respond to callout (accept/decline) | ✅ Callouts.jsx | 4000 |
| Clock in / Clock out / Break | ✅ TimeClock.jsx | 4000 |
| Messages | ✅ Messages.jsx (proxy to 5000) | admin-dashboard (5000) |
| Shift swap, availability, shift report, history, analytics | ✅ Uses shiftManagement.api.js | admin-dashboard (5000) |
| Shifts list, accept shift | ✅ guardApi listShifts, acceptShift | 4000 |
| Overtime, payroll, dashboard, announcements, incidents, emergency, policy, alerts | ✅ guardApi | 4000 |
| **Capacitor (mobile build)** | ❌ Not added | — |
| **Production API URLs** | ❌ Hardcoded localhost | — |
| **Token compatibility (4000 vs 5000)** | ⚠️ Needs verification | — |

---

## Tasks to complete

### 1. Token compatibility (4000 vs 5000)

- Guard **logs in to 4000** (abe-guard-ai). The same token is used for:
  - **5000** (admin-dashboard): messages (`/api/guard/messages`), shift swap, availability, shift report, history, analytics.
- If 5000’s guard routes use a different JWT secret or guard identity, calls to 5000 will return 401.
- **Do:** Confirm whether 4000 and 5000 share the same JWT secret and guard id (e.g. same DB or synced users). If not, either:
  - Have guard-ui log in to **both** (e.g. 4000 for app, 5000 for messages/shift management and store a second token), or
  - Add guard auth on 5000 that accepts 4000’s token (e.g. validation against abe-guard-ai), or
  - Move messages + shift management to 4000 so one backend serves the guard app.

### 2. Environment / production API URLs

- **guardClient** (axiosClients.js): `baseURL: "http://localhost:4000"` is hardcoded.
- **shiftManagement.api.js**: `baseURL: "http://localhost:5000/api"` is hardcoded.
- **Payroll.jsx**: uses `http://localhost:4000` for pay stub file URLs.
- **Do:**
  - Add env vars, e.g. `REACT_APP_GUARD_API_URL` (4000) and `REACT_APP_ADMIN_API_URL` (5000).
  - Use them in `axiosClients.js`, `shiftManagement.api.js`, and any direct `localhost:4000` links (e.g. Payroll).
  - Document in README or `.env.example` (and use production URLs for Capacitor build).

### 3. Add Capacitor for mobile (iOS/Android)

- guard-ui has **no** Capacitor yet (`package.json` has no `@capacitor/*`).
- **Do:**
  - Install Capacitor: `npm install @capacitor/core @capacitor/cli @capacitor/ios @capacitor/android`
  - `npx cap init` with app name and bundle id; set `webDir` to `build`.
  - Add platforms: `npx cap add ios`, `npx cap add android`.
  - Add npm scripts, e.g. `build:mobile`, `cap:sync`, `cap:open:ios`, `cap:open:android`.
  - Build with production API URLs before sync (e.g. `REACT_APP_GUARD_API_URL=... npm run build` then `npx cap sync`).
  - Ensure **both** backends (4000 and 5000) allow CORS for the Capacitor app origin(s) in production (e.g. `capacitor://localhost`, `https://your-app-domain.com` if using a hosted web app).

### 4. Documentation

- **Do:**
  - Add a short README or `BUILD_MOBILE.md` in guard-ui describing:
    - Required env vars (`REACT_APP_GUARD_API_URL`, `REACT_APP_ADMIN_API_URL`).
    - Dev setup: start abe-guard-ai (4000), admin-dashboard backend (5000), proxy for `/api/guard` → 5000.
    - Mobile: build with production URLs, `cap sync`, open Xcode/Android Studio.
  - Optionally add a “Guard-UI completion” section in the admin-dashboard repo README that points to guard-ui and to this task list.

### 5. Optional: Move guard-ui into admin-dashboard repo

- If the goal is “everything in one repo” (as in GUARD_UI_COMPLETION_REVIEW Option A):
  - **Do:** Clone or copy `guard-ui/guard-ui` into this repo as e.g. `frontend-guard-ui/`, adjust paths and docs so it’s clear that the guard app lives here and still talks to 4000 + 5000.
- If guard-ui stays in a separate repo/project, skip this and keep the completion tasks above in the guard-ui project (or link to this doc).

---

## Summary checklist

| # | Task | Priority |
|---|------|----------|
| 1 | Verify token compatibility for 4000 + 5000; fix if guards get 401 on messages/shift APIs | High |
| 2 | Add REACT_APP_GUARD_API_URL and REACT_APP_ADMIN_API_URL; use in guardClient, shiftManagement, Payroll | High |
| 3 | Add Capacitor (init, ios/android, scripts, build with prod URLs, CORS on both backends) | High (if mobile required) |
| 4 | Add README/BUILD_MOBILE.md for guard-ui with env and run/mobile steps | Medium |
| 5 | Optionally move guard-ui into this repo as frontend-guard-ui | Low / optional |

---

## Quick reference: guard-ui backends

| Backend | Port | Used for |
|---------|------|----------|
| abe-guard-ai | 4000 | Login, shifts list, clock in/out, break, callout, running late, respond to callout, accept shift, overtime, payroll, dashboard, announcements, incidents, emergency, policy, alerts |
| admin-dashboard | 5000 | Messages (/api/guard/messages), shift swap, availability, shift report, shift history, shift analytics (/api/guards/...) |

Messaging uses the dev proxy `/api/guard` → 5000; in production, guard-ui must call 5000 at `REACT_APP_ADMIN_API_URL` for those paths.
