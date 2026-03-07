# WebSocket / Realtime Connections Review — Admin Dashboard

## 1. Frontend: Two socket connections

The admin dashboard uses **two** Socket.IO clients (see `frontend-admin-dashboard/admin-dashboard-frontend/src/realtime/socket.js`):

| Socket | Purpose | Default URL | Env var | When it connects |
|--------|--------|-------------|---------|-------------------|
| **Guard socket** (`connectSocket()`) | abe-guard-ai: incidents, inspections, callouts, shifts, clock in/out | *(none)* | `REACT_APP_GUARD_REALTIME_URL` | **Only when this env is set.** If unset, no connection. |
| **Admin socket** (`connectAdminSocket()`) | Admin backend (Railway): schedule, guards, notifications, messaging | `http://localhost:5000` (localhost only) | `REACT_APP_ADMIN_REALTIME_URL` | When on localhost (no env) or when env is set. |

---

## 2. Environment variables (realtime)

| Variable | Used by | Purpose |
|----------|--------|--------|
| `REACT_APP_GUARD_REALTIME_URL` | `socket.js` (guard socket) | Base URL of abe-guard-ai Socket.IO server (e.g. `http://localhost:4000` or `https://guard-api.yourdomain.com`). **If unset, guard socket is never created.** |
| `REACT_APP_ADMIN_REALTIME_URL` | `socket.js` (admin socket) | Base URL of admin-dashboard Socket.IO server (e.g. `https://admin-dashboard-production-2596.up.railway.app`). If unset, admin socket uses `http://localhost:5000` only when the app is on localhost. |

**Other related (REST, not sockets):**

- `REACT_APP_API_URL` — Admin REST API base (axios, proxy).
- `REACT_APP_ADMIN_API_URL` — Full admin API path (e.g. login).
- `REACT_APP_GUARD_AI_URL` — abe-guard-ai REST base (e.g. guard features, not Socket.IO).

---

## 3. Where each socket is used

### Guard socket (`connectSocket()`)

Used only when `REACT_APP_GUARD_REALTIME_URL` is set. Pages that call it:

| Page | Events listened |
|------|------------------|
| **Dashboard** | (uses both guard + admin socket; guard for callouts/refresh) |
| **Incidents** | `incidents:new`, `incidents:updated` |
| **Inspections** | `inspection:request:created`, `inspection:submitted`, `inspection:status_changed` |
| **Command Center** | `incidents:new`, `incidents:updated`, `callout_started`, `guard_clocked_in`, `guard_clocked_out` |
| **Analytics** | `callout:created`, `callout:filled`, `shift:created`, `shift:filled`, `shift:closed`, `guard:availability_changed` |
| **Schedule** | (connects, no specific events listed in grep) |
| **SuperAdminDashboard** | `shift_created`, `shift_updated`, `callout_started`, `guard_clocked_in`, `guard_clocked_out`, `incidents:new`, `incidents:updated` |
| **NotificationContext** | (connects for notifications) |

### Admin socket (`connectAdminSocket()`)

Used for admin-backend events (same server as REST API). Pages that call it:

| Page | Events listened |
|------|------------------|
| **Dashboard** | `guard_clocked_in`, `guard_clocked_out` (and general admin feed) |

### Report page

- **Reports (ReportBuilder)** — **No socket.** No `connectSocket()` or `connectAdminSocket()`. No realtime; data is from REST (templates, runs, scheduled).

### Inspections page

- **Inspections** — Uses **guard socket only** (`connectSocket()`). Listens for:
  - `inspection:request:created`
  - `inspection:submitted`
  - `inspection:status_changed`  
  These events are expected from **abe-guard-ai** (guard app), not from the admin backend. So for Inspections realtime to work, `REACT_APP_GUARD_REALTIME_URL` must be set and abe-guard-ai must emit those events.

---

## 4. Rooms and events (backend — admin dashboard server)

Admin backend (`backend/server.js`) runs one Socket.IO server. All connected clients (admins/guards) are authenticated via JWT in `handshake.auth.token`.

### Rooms joined on connection

| Room | Who joins | Where |
|------|------------|--------|
| `role:all` | Every connected socket (admin or guard) | `server.js`: `io.on("connection", ...) { socket.join("role:all"); }` |

No `join_admin` or `admins` room is used on the **admin backend**. The frontend’s guard socket emits `join_admin` to the **abe-guard-ai** server (port 4000), not to the admin backend.

### Messaging rooms (messagingSocket.service.js)

| Room pattern | Who joins | Purpose |
|--------------|-----------|--------|
| `admin:<participantId>` | Admin sockets (by messaging UUID) | Receive messages for that admin |
| `guard:<participantId>` | Guard sockets (by messaging UUID) | Receive messages for that guard |
| `conversation:<conversationId>` | Participants of that conversation | Typing, read receipts, message:new (via conversation:join) |

### Events emitted by admin backend (to rooms)

| Event | Room(s) | Source |
|-------|---------|--------|
| `guard:availability_updated` | `role:all` | adminGuards.controller |
| `guard:status_updated` | `role:all` | adminGuards.controller |
| `schedule_updated` | `role:all` | adminSchedule.controller |
| `shift_created` | `role:all` | adminShifts.controller |
| `shift_filled` | `role:all` | adminShifts.controller |
| `shift_updated` | `role:all` | adminShifts.controller |
| `shift_optimized` | `role:all` | shiftOptimization.controller |
| `notification:new` | `role:all` | notify.js, calloutNotificationListener |
| `email_scheduler_settings_updated` | `role:all` | emailSchedulerSettings.controller |
| `emergency:resolved` | `role:all` | adminDashboard.controllers |
| `action:backup_requested` | `role:all` | actionExecution.service |
| `action:callout_triggered` | `role:all` | actionExecution.service |
| `shifts_rebalanced` | `tenant:<tenantId>` | fairnessRebalancing.controller |
| `schedule_generated` | `tenant:<tenantId>` | scheduleGeneration.controller |
| `overtime_offer` | `guard:<guardId>` | overtimeOffers.controller |
| `overtime_request_approved` | `guard:<guardId>` | overtimeOffers.controller |
| `overtime_request_denied` | `guard:<guardId>` | overtimeOffers.controller |
| `overtime_offer_cancelled` | `guard:<guardId>` | overtimeOffers.controller |
| `inspection:request` | `guard:<guardId>` | actionExecution.service |
| `message:new` | `admin:<id>` / `guard:<id>` | adminMessages.routes, guardMessages.routes |
| `message:read` | sender room | messagingSocket.service |
| `typing:indicator` | `conversation:<id>` (to others) | messagingSocket.service |
| `notification:new` (admin/supervisor) | `role:admin`, `role:supervisor` | actionExecution.service |

Note: Frontend admin clients only join `role:all` (and messaging rooms). There is no `role:admin` or `role:supervisor` join in `server.js`; those emits would only reach sockets that joined those rooms if something else added them (currently no such join in the code reviewed).

---

## 5. abe-guard-ai (guard socket server)

The **guard socket** connects to the URL in `REACT_APP_GUARD_REALTIME_URL` (abe-guard-ai). The frontend:

- Emits `join_admin` on connect and reconnect (so abe-guard-ai can put the client in an “admins” room).
- Listens for events listed in section 3 (incidents, inspections, callouts, shifts, clock, etc.).

The admin **backend** also connects to abe-guard-ai as a **client** (`calloutNotificationListener.js`), using `process.env.ABE_GUARD_AI_URL` (default `http://localhost:4000`), and emits `join_admin` there. It listens for `callout_started` and then emits `notification:new` to `role:all` on the admin server.

---

## 6. Checklist: Reports and Inspections

### Reports page

- **Socket:** None. No realtime; all data via REST (report templates, runs, scheduled reports).
- **Env:** No socket env needed for Reports. Only REST: `REACT_APP_API_URL` / `REACT_APP_ADMIN_API_URL`.

### Inspections page

- **Socket:** Guard socket only (`connectSocket()`).
- **Events:** `inspection:request:created`, `inspection:submitted`, `inspection:status_changed`.
- **Env:** For realtime to work, set `REACT_APP_GUARD_REALTIME_URL` to the abe-guard-ai Socket.IO base URL. If unset, Inspections still works; it just won’t update in real time when inspections are created/submitted/updated.

---

## 7. Recommended production env (Vercel)

| Variable | Recommended | Note |
|----------|-------------|------|
| `REACT_APP_GUARD_REALTIME_URL` | Unset (or your abe-guard-ai URL) | Unset = no guard socket, no ws errors. Set only if abe-guard-ai is deployed and you want incidents/inspections/callouts realtime. |
| `REACT_APP_ADMIN_REALTIME_URL` | `https://admin-dashboard-production-2596.up.railway.app` | So Dashboard (and any admin listeners) get schedule/guard/notification updates in real time. |

---

## 8. Summary

| Item | Detail |
|------|--------|
| **Guard socket** | Connects only if `REACT_APP_GUARD_REALTIME_URL` is set. Used by Incidents, Inspections, Command Center, Analytics, Schedule, SuperAdminDashboard, NotificationContext. Emits `join_admin` to abe-guard-ai. |
| **Admin socket** | Connects when on localhost (default `http://localhost:5000`) or when `REACT_APP_ADMIN_REALTIME_URL` is set. Used by Dashboard for clock events and admin feed. |
| **Reports page** | No sockets; REST only. |
| **Inspections page** | Guard socket only; listens for inspection events from abe-guard-ai. |
| **Admin backend rooms** | All clients: `role:all`. Messaging: `admin:<id>`, `guard:<id>`, `conversation:<id>`. Some features: `tenant:<tenantId>`, `guard:<guardId>`. |
| **Admin backend** | Does not use an `admins` room; frontend’s `join_admin` is sent to abe-guard-ai, not to the admin backend. |
