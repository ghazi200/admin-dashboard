# Guard-UI Completion Review & Next Move

## Can guard-ui be completed?

**Yes.** The backend is ready and the UI building blocks exist inside the admin app. What’s missing is a **standalone guard app** (its own entry point, guard login, and guard-only screens). Once that app exists, it can be wrapped with Capacitor like the admin dashboard.

---

## What exists today (in this repo)

### 1. Backend (port 5000) — guard APIs

| Area | Endpoint | Auth | Purpose |
|------|----------|------|--------|
| **Login** | `POST /api/guard/login` | — | Body: `{ email, password }`. Returns `{ token, guard: { id, email, name, tenant_id } }`. 401 invalid, 423 locked. |
| **Messages** | `GET/POST/DELETE /api/guard/messages/conversations/*` | Bearer guardToken | List conversations, get/send/delete messages, mark read. |
| **Shift swap** | `POST /api/guards/shifts/swap/request`, `GET .../available`, `POST .../:id/accept`, `DELETE .../:id/cancel` | Bearer guardToken | Request swap, list available, accept, cancel. |
| **Availability** | `GET/PUT /api/guards/availability/preferences` | Bearer guardToken | Get/update availability preferences. |
| **Shift report** | `POST/GET /api/guards/shifts/:id/report` | Bearer guardToken | Submit or get shift notes/report. |
| **History** | `GET /api/guards/shifts/history` | Bearer guardToken | Query params: e.g. `guard_id`, `from`, `to`. |
| **Analytics** | `GET /api/guards/shifts/analytics` | Bearer guardToken | Query: `guard_id`, `period`. |

Guard token: from `/api/guard/login`. JWT payload: `{ guardId, tenant_id, role: "guard" }`. Send as `Authorization: Bearer <token>` on all guard API calls.

### 2. “Guard-ui” in the admin app — reference only

- **Path:** `frontend-admin-dashboard/admin-dashboard-frontend/src/components/guard-ui/`
  - `GuardMessages.jsx` — full messaging UI (conversations list, messages, send, delete, polling).
  - `guardMessaging.service.js` — API client for `/api/guard/messages/*`; uses `localStorage.guardToken` and `REACT_APP_API_URL` or localhost:5000.
  - `AvailabilityPreferences.jsx` — UI for availability prefs.
  - `ShiftSwapMarketplace.jsx` — UI for shift swap.
- **Usage today:** These are used only on the **admin** route `/messages/guard` (MessagesGuard.jsx). An admin is logged in, picks a guard, gets a **guard view token** via `getGuardViewToken(guardId)` (admin API), stores it as `guardToken`, then sees the same messaging UI as a guard would. So the **guard experience is embedded in the admin app for testing**, not as a real guard app with guard login.

### 3. No standalone guard app

- There is **no** separate app where a guard goes to a login page, enters their own email/password, and then sees Messages / Shifts / Swap / etc.
- So “guard-ui” in the sense of a **product** (guard-facing app) is **not** in this repo; only the **backend** and **reusable UI components** are.

---

## What “completing” guard-ui means

1. **Create a standalone guard web app** that:
   - Has its own entry (e.g. a new React app in `frontend-guard-ui/` or its own repo).
   - **Guard login:** single page that calls `POST /api/guard/login`, stores `token` and `guard` (e.g. in `localStorage` or Capacitor Preferences).
   - **After login:** guard-only screens, e.g.:
     - **Messages** — reuse or copy `GuardMessages.jsx` + `guardMessaging.service.js`, with API base URL and guardToken.
     - **My shifts** — list from `GET /api/guards/shifts/history`, optional swap/report from the same APIs.
     - **Availability** (optional) — reuse or copy `AvailabilityPreferences.jsx`.
     - **Shift swap** (optional) — reuse or copy `ShiftSwapMarketplace.jsx`.
   - Uses **only** guard APIs (and only guard token). No admin routes, no admin token.
2. **Add Capacitor** to that guard app (same pattern as admin: `cap init`, `webDir` = build, add ios/android, set `REACT_APP_API_URL` to production backend, CORS already allows Capacitor origins).

---

## Next move (two options)

### Option A — Create guard app in this repo (recommended)

- **Where:** e.g. `frontend-guard-ui/` at repo root (sibling to `frontend-admin-dashboard/`).
- **What:** New React (CRA or Vite) app with:
  - **Login page:** form → `POST /api/guard/login` → store token + guard → redirect to home.
  - **Guard API client:** one axios instance; base URL from `REACT_APP_API_URL`; attach `Authorization: Bearer <guardToken>` from storage.
  - **Screens:** Messages (copy `GuardMessages` + `guardMessaging.service.js` and point to guard API client), My Shifts (calls `shifts/history` and optionally swap/report), and optionally Availability and Swap marketplace.
  - **Router:** e.g. `/login`, `/`, `/messages`, `/shifts` with a simple bottom nav or drawer.
- **Then:** Add Capacitor (same as admin): `capacitor.config.json`, `webDir: "build"`, add ios/android, `build:mobile` script, env for production URL. Backend CORS already allows Capacitor origins.
- **Result:** Guard-ui is “completed” as a standalone web + mobile app in this repo, using the existing backend and existing UI components.

### Option B — Guard app in another repo

- Create the same guard app (login + messages + shifts + optional availability/swap) in a different repo (e.g. under abe-guard-ai or a dedicated guard-ui repo).
- That app still talks to **this** backend (port 5000) at `REACT_APP_API_URL` and uses the same guard APIs and token.
- Add Capacitor there; ensure this backend’s CORS allows that app’s origins (and Capacitor origins) when you deploy.

---

## Summary

| Question | Answer |
|----------|--------|
| Can guard-ui be completed? | Yes. |
| What’s missing? | A **standalone** guard app (entry, guard login, guard-only screens). Backend and UI components exist. |
| Recommended next move | **Option A:** Create `frontend-guard-ui/` in this repo with guard login, Messages (reuse GuardMessages + service), My Shifts (history + optional swap/report), then add Capacitor. |
| Reuse | Backend as-is. Reuse/copy `guard-ui` components and `guardMessaging.service.js`; adapt to a guard-only API client (single base URL + guardToken). |

If you want to proceed with Option A, the concrete steps are: (1) scaffold `frontend-guard-ui` (React app + login + guard client), (2) add Messages and Shifts pages using existing components and APIs, (3) add Capacitor and npm scripts (same as admin dashboard).

---

## Callout and clock in/out (guard-facing)

### Callout

- **In this repo (admin-dashboard backend):** Callouts are **read** by admins (e.g. live callouts, callout risk). This backend **listens** to abe-guard-ai for `callout_started` events and creates notifications/OpEvents. It does **not** expose a guard API for “I want to call out” or “accept/decline an open shift.”
- **Conclusion:** Guard-facing **callout** (submit callout, or accept/decline a callout offer) is **not** implemented in the admin-dashboard backend. It may live in **abe-guard-ai** (port 4000). To have it in guard-ui you would either (1) call abe-guard-ai from the guard app if that backend exposes guard callout endpoints, or (2) add guard callout endpoints to this backend (e.g. `POST /api/guards/callout` to create a callout, plus any “accept open shift” API if needed).

### Clock in / clock out

- **In this repo:** The `time_entries` table stores `clock_in_at` and `clock_out_at`. The **clock report** and **dashboard clock status** use it (admin-only). Guard shift **history** and **analytics** **read** time_entries. There is **no** guard route in this backend for punching in or out (no `POST /api/guards/clock-in` or similar).
- **Conclusion:** Guard-facing **clock in/out** (punch) is **not** implemented in the admin-dashboard backend. To have it in guard-ui you would need to (1) add guard endpoints here (e.g. `POST /api/guards/shifts/:id/clock-in`, `POST /api/guards/shifts/:id/clock-out` that create/update `time_entries` for the authenticated guard), or (2) use abe-guard-ai if it already exposes punch APIs for guards.

### Summary

| Feature        | In admin-dashboard backend (5000)? | In guard-ui when we build it? |
|----------------|------------------------------------|-------------------------------|
| Login          | Yes (`POST /api/guard/login`)      | Yes                           |
| Messages       | Yes                                | Yes                           |
| Shifts (history, swap, report, analytics) | Yes | Yes                           |
| Availability   | Yes                                | Yes                           |
| **Callout**    | No (admin only reads; creation may be in abe-guard-ai) | Only if we add guard callout API here or call abe-guard-ai |
| **Clock in/out** | No (time_entries exist but no guard punch API) | Only if we add guard clock-in/out API here or use abe-guard-ai |
