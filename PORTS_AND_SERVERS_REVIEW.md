# Ports and Servers — Why They Run on Those Ports (Review, No Changes)

This document explains **where** each port is configured and **why** the system uses this layout. No code or config was changed.

---

## Summary: The Four Services and Their Ports

| Service | Port | Purpose |
|--------|------|--------|
| **abe-guard-ai backend** | **4000** | Main guard/supervisor API, policy, tenants, incidents, inspections, announcements, reputation. Other services depend on it. |
| **admin-dashboard backend** | **5000** | Admin-only API: login, dashboard, guards, shifts, geographic (map/sites/route/analytics), messages, overtime, etc. |
| **guard-ui** | **3000** | Guard-facing React app (default CRA port). Guards log in and manage shifts/callouts here. |
| **admin-dashboard frontend** | **3000 or 3001** | Admin React app. Uses **3001** when running alongside guard-ui so both can run at once. |

---

## 1. Port 4000 — abe-guard-ai Backend

- **Where it’s defined:** In the **abe-guard-ai** repo (outside admin-dashboard), e.g. `abe-guard-ai/backend` with `PORT=4000` or equivalent.
- **Why 4000:**
  - Keeps it separate from the admin-dashboard backend (5000) so **two different backends** can run on the same machine.
  - Admin-dashboard frontend calls it for: policy/assistant, supervisor, reputation, incidents, inspections, announcements, tenants/sites (abe-guard-ai API). See `src/api/abeGuardAiClient.js`: `baseURL: process.env.REACT_APP_GUARD_AI_URL || "http://localhost:4000"`.
- **Docs:** `start-all.sh` and `QUICK_START.md` say “abe-guard-ai (port 4000)” and start it first because other services depend on it.

---

## 2. Port 5000 — admin-dashboard Backend

- **Where it’s defined:**
  - **`backend/server.js`** — `const PORT = process.env.PORT || 5000;` and header comment: `Port: 5000`.
  - **`backend/.env`** — `PORT=5000` so it’s explicit in env.
  - **`backend/package.json`** — `"start": "node server.js"` (no port in script; server reads `process.env.PORT`).
- **Why 5000:**
  - Standard choice for a “second” backend to avoid clashing with abe-guard-ai (4000) and with frontend dev servers (3000/3001).
  - Single place for all **admin** APIs: auth, dashboard, guards, shifts, users, geographic (sites, route-optimize, analytics), messages, overtime, reports, etc.
- **Who uses it:**
  - Admin-dashboard frontend uses **axiosClient** → when on localhost, `getBackendOrigin()` returns `http://localhost:5000` (see `src/api/axiosClient.js`).
  - Frontend **proxy**: `setupProxy.js` and `package.json` `"proxy": "http://localhost:5000"` so `/api` can be forwarded to 5000 when the frontend is on another port.
- **CORS / Socket.IO:** Backend allows origins `3000`, `3001`, `3002` so both guard-ui and admin frontend (and an alternate port) can call it and use sockets.

---

## 3. Port 3000 — guard-ui (and default for admin frontend)

- **Where it’s defined:**
  - **guard-ui** is a separate app (e.g. `guard-ui/guard-ui`). Create React App defaults to port **3000** unless overridden (e.g. `PORT=3000` in `.env` or `react-scripts start`).
  - **admin-dashboard frontend** also uses CRA; by default it would use 3000 if started alone.
- **Why 3000:**
  - CRA default. guard-ui is the “main” guard app, so it keeps 3000 when only one frontend is running.
  - Backend CORS and Socket.IO explicitly allow `http://localhost:3000` so guard-ui can talk to the admin-dashboard backend when needed (e.g. messaging).
- **Docs:** `start-all.sh` and `QUICK_START.md` say “guard-ui (port 3000)” and “Guard UI: http://localhost:3000”.

---

## 4. Port 3001 — admin-dashboard Frontend (when both UIs run)

- **Where it’s defined:**
  - **`start-all.sh`** and **`QUICK_START.md`** tell you to start the admin-dashboard frontend in a separate terminal; CRA will use 3000 by default unless port 3000 is already in use. To **guarantee** admin dashboard on 3001, you’d set `PORT=3001` in the admin frontend’s `.env` (not present in the repo by default; the script just opens a new terminal so the second `npm start` often gets 3001 because 3000 is taken by guard-ui).
  - **Backend** allows `http://localhost:3001` (and 3002) in CORS and Socket.IO so the admin app can call the admin backend and use real-time features.
- **Why 3001:**
  - So **guard-ui** and **admin-dashboard frontend** can run **at the same time**: guard-ui on 3000, admin on 3001. Avoiding port conflict is the reason.
  - App.js comment says “Runs on: http://localhost:3000” for the admin dashboard when it’s the only app; in the full stack, docs say Admin Dashboard is on 3001.

---

## 5. How the frontend knows which backend port

- **Admin API (dashboard, guards, geographic, etc.):**  
  `src/api/axiosClient.js` — on localhost, `getBackendOrigin()` returns `http://localhost:5000` unless `REACT_APP_API_URL` is set. So the admin frontend expects the **admin-dashboard backend** on **5000**.
- **abe-guard-ai API (policy, incidents, etc.):**  
  `src/api/abeGuardAiClient.js` — `REACT_APP_GUARD_AI_URL || "http://localhost:4000"`. So the admin frontend expects the **abe-guard-ai backend** on **4000**.

If the process listening on **5000** is **abe-guard-ai** instead of **admin-dashboard**, then admin-only routes (e.g. `/api/admin/geographic/*`) are not defined there and you get **404**. The ports are tied to **which app** is running, not just “any backend.”

---

## 6. Layout sidebar “Backend: :5000”

- **Where:** `frontend-admin-dashboard/admin-dashboard-frontend/src/components/Layout.jsx` — shows “Backend: :5000” in the sidebar.
- **Why:** Informs admins which backend port the app is talking to for admin API (dashboard, guards, map, etc.). No code changes; this is documentation in the UI.

---

## 7. File reference summary (no edits)

| Port | File(s) |
|------|--------|
| 5000 | `backend/server.js` (PORT, listen, CORS, Socket.IO), `backend/.env` (PORT=5000), `frontend-admin-dashboard/admin-dashboard-frontend/src/api/axiosClient.js`, `setupProxy.js`, `package.json` proxy, `Layout.jsx` label, `App.js` / `AuthLayout` subtitle, `api.js` comments, `GeographicDashboard.jsx` 404 message |
| 4000 | `frontend-admin-dashboard/admin-dashboard-frontend/src/api/abeGuardAiClient.js`, `api.js` comments (Supervisor, Reputation, Incidents, Inspections, Announcements on port 4000) |
| 3000 | `backend/server.js` CORS/Socket origins, `App.js` “Runs on: http://localhost:3000”, `start-all.sh`, `QUICK_START.md` (Guard UI) |
| 3001 | `backend/server.js` CORS/Socket origins, `start-all.sh`, `QUICK_START.md` (Admin Dashboard), `.env.example` optional override |
| 3002 | `backend/server.js` CORS/Socket origins (alternative admin frontend port) |

---

**Conclusion:** Ports are split so that (1) two backends (abe-guard-ai and admin-dashboard) can run side by side (4000 vs 5000), and (2) two frontends (guard-ui and admin-dashboard) can run side by side (3000 vs 3001). The admin-dashboard frontend is hard-wired to use **5000** for admin API and **4000** for abe-guard-ai API; changing which process listens on 5000 (e.g. running abe-guard-ai on 5000) will cause 404s for admin-only routes. This review did not change any of that behavior or config.
