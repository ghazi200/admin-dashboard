# Realtime Architecture Review — Preparation for WebSocket Gateway + Redis

**Purpose:** Review all realtime/socket code so we can implement the professional architecture (WebSocket Gateway + Redis) without changing anything yet.

---

## 1. Current Architecture (As-Is)

```
Vercel (Frontend)
       │
       │ HTTP (REST) + would-be WebSocket
       ▼
Railway: single Node process
       ├── Express (API, auth, DB, cron)
       ├── Socket.IO server (same process)
       └── socket.io-client → abe-guard-ai (localhost:4000)
```

- **Frontend:** `src/realtime/socket.js` is a **stub** — `connectSocket()` and `connectAdminSocket()` always return `null`. No `socket.io-client` import. So the app never opens a socket today; Dashboard uses 45s polling when socket is null.
- **Backend:** One HTTP server + one Socket.IO server in `backend/server.js`. Same process runs Express, Socket.IO, and a **client** connection to abe-guard-ai (port 4000) in `calloutNotificationListener.js`.

---

## 2. Backend: Where Socket.IO Is Used

### 2.1 Server setup (`backend/server.js`)

- `http.createServer(app)` + `new Server(server, { cors, pingInterval: 20000, pingTimeout: 120000, transports: ["polling", "websocket"] })`.
- Auth middleware: `io.use((socket, next) => { ... jwt.verify(token), socket.admin or socket.guard })`.
- `app.set("io", io)` so controllers get `req.app.get("io")`.
- Initialization order: `initSocketEventInterceptor(io, models)`, `initCalloutNotificationListener(app)`, `initMessagingSocketHandlers(io, models)`.

### 2.2 Event interceptor (`backend/src/services/socketEventInterceptor.js`)

- Wraps `io.emit` and `io.to(room).emit` to log events to OpEvents (Command Center feed).
- **Events intercepted:**  
  `incidents:new`, `incidents:updated`, `callout_started`, `callout:new`, `inspection:request`, `inspection:submitted`, `inspection:request:created`, `guard_clocked_in`, `guard_clocked_out`, `guard_lunch_started`, `guard_lunch_ended`, `shift_filled`, `shift:created`.

### 2.3 Callout listener — client to abe-guard-ai (`backend/src/services/calloutNotificationListener.js`)

- **Connects out** to `ABE_GUARD_AI_URL` (default `http://localhost:4000`) with `socket.io-client`.
- Listens: `callout_started`, `callout_response`, `shift_filled`, `incidents:new`, `incidents:updated`.
- On `callout_started`: creates Notification, then **emits to admin clients** via `io.to("role:all").emit("notification:new", notification)`.
- Creates OpEvents for callouts, shift_filled, incidents (with some payload bugs: e.g. `tenantId`/`calloutId` used in callout_started handler where not defined — fix when implementing).

### 2.4 Messaging socket (`backend/src/services/messagingSocket.service.js`)

- `io.on("connection", ...)`: joins rooms `admin:uuid` / `guard:uuid`, `conversation:${id}`.
- Events: `conversation:join`, `message:send`, `typing:start`, `typing:stop`, `message:read`.
- Emits: `message:new`, `message:read`, `typing:indicator`, `error` (per-socket or to room).

### 2.5 Controllers / services that emit (all use `req.app.get("io")` or `app.locals.io`)

| File | Room(s) | Event(s) |
|------|--------|----------|
| `emailSchedulerSettings.controller.js` | `role:all` | `email_scheduler_settings_updated` |
| `adminMessages.routes.js` | `conversation:*` | `message:new` |
| `adminSchedule.controller.js` | `role:all` | `schedule_updated` |
| `adminShifts.controller.js` | `role:all` | `shift_created`, `shift_filled`, `shift_updated` |
| `guardNotification.js` | `guard:${guardId}` | `guard:notification:new` |
| `fairnessRebalancing.controller.js` | `tenant:${tenantId}` | `shifts_rebalanced` |
| `actionExecution.service.js` | `role:all`, `role:admin`, `role:supervisor`, `guard:${id}` | `action:backup_requested`, `notification:new`, `action:callout_triggered`, `inspection:request` |
| `calloutNotificationListener.js` | `role:all` | `notification:new` |
| `notify.js` | `role:all` | `notification:new` |
| `scheduleGeneration.controller.js` | `tenant:${tenantId}` | `schedule_generated` |
| `adminGuards.controller.js` | `role:all` | `guard:availability_updated`, `guard:status_updated` |
| `shiftOptimization.controller.js` | `role:all` | `shift_optimized` |
| `messagingSocket.service.js` | conversation rooms, sender room | `message:read`, `typing:indicator` |
| `overtimeOffers.controller.js` | `guard:${guardId}` | `overtime_offer`, `overtime_request_approved`, `overtime_request_denied`, `overtime_offer_cancelled` |
| `adminDashboard.controllers.js` | `role:all` | `emergency:resolved` |
| `guardMessages.routes.js` | conversation room | `message:new` |

**Rooms in use:** `role:all`, `role:admin`, `role:supervisor`, `tenant:${tenantId}`, `guard:${guardId}`, `conversation:${conversationId}`, and user rooms like `admin:uuid` / `guard:uuid` for messaging.

---

## 3. Frontend: Where Sockets Would Be Used (Currently Stubbed)

### 3.1 Socket module (`frontend-admin-dashboard/.../src/realtime/socket.js`)

- Stub only: `connectSocket()`, `connectAdminSocket()` return `null`; no `socket.io-client`.
- When re-enabled: will need **two** endpoints in the new architecture:
  - **Guard realtime (abe-guard-ai):** callouts, shift_filled, guard_clocked_*, incidents, etc. — may stay on abe-guard-ai or move to Gateway (see below).
  - **Admin dashboard realtime (current backend):** schedule_updated, guard:availability_updated, notifications, messaging, etc. — will be served by the **WebSocket Gateway**.

### 3.2 Pages and events they expect (from admin/guard sockets)

| Page/Context | Socket | Events listened |
|--------------|--------|------------------|
| **Dashboard.jsx** | Guard (`s`) | `callout_started`, `shift_filled`, `callout_response`, `callout_update`, `guard_running_late`, `guard_clocked_in`, `guard_clocked_out`, `guard_lunch_started`, `guard_lunch_ended`, `incidents:new`, `incidents:updated`, `emergency:sos`, `emergency:resolved` |
| **Dashboard.jsx** | Admin (`adminS`) | `guard_clocked_out`, `guard_clocked_in`, `guard:availability_updated`, `guard:status_updated` |
| **Schedule.jsx** | Guard | `shift_filled`, `callout_response`, `callout_started`, `callout_update`, `shift_created`, `shift_updated`, `schedule_updated` |
| **CommandCenter.jsx** | Guard | `incidents:new`, `incidents:updated`, `callout_started`, `guard_clocked_in`, `guard_clocked_out` |
| **Incidents.jsx** | Guard | `incidents:new`, `incidents:updated` |
| **SuperAdminDashboard.jsx** | Guard | `shift_created`, `shift_updated`, `callout_started`, `guard_clocked_in`, `guard_clocked_out`, `incidents:new`, `incidents:updated` |
| **Analytics.jsx** | Guard | `callout:created`, `callout:filled`, `shift:created`, `shift:filled`, `shift:closed`, `guard:availability_changed` |
| **NotificationContext.jsx** | Guard | `notification:new` |

Note: Some events are today emitted by the **admin backend** (e.g. `guard:availability_updated`, `schedule_updated`, `notification:new`), others originate from **abe-guard-ai** and are either re-emitted by the backend (after calloutNotificationListener) or would need to flow via Redis in the new design.

---

## 4. External System: abe-guard-ai

- **URL:** `process.env.ABE_GUARD_AI_URL` (default `http://localhost:4000`).
- Admin backend connects **as a client** to abe-guard-ai in `calloutNotificationListener.js` and subscribes to callout/incident/shift events, then:
  - Writes to DB (notifications, OpEvents),
  - Emits to admin Socket.IO clients via `io.to("role:all").emit(...)`.

In the Gateway + Redis design, abe-guard-ai could:
- Publish the same events to Redis (e.g. `callout_started`, `shift_filled`, `incidents:new`), and
- The **WebSocket Gateway** subscribes to Redis and emits to connected clients, so the admin backend no longer needs to run a Socket.IO server or a socket.io-client to abe-guard-ai for that purpose (optional: keep listener only for creating notifications/OpEvents in Core API, or move that into a small worker that subscribes to Redis).

---

## 5. Dependencies (Backend)

- **Current:** `socket.io`, `socket.io-client` (no Redis).
- **For Gateway + Redis:**  
  - **Core API:** add `redis` (or `ioredis`) to publish events; **remove** Socket.IO server from this process (or keep a tiny stub if something still expects `app.get("io")` until migrated).  
  - **New WebSocket Gateway service:** `express`, `http`, `socket.io`, `@socket.io/redis-adapter`, `redis` (or `ioredis`), and JWT for auth if you keep token-based socket auth.

---

## 6. Event List for Redis (Canonical)

Events to be **published** from Core API (and optionally abe-guard-ai) and **subscribed** by the WebSocket Gateway, then emitted to clients (same event names or mapped):

**From Core API (today’s io.to().emit):**

- `schedule_updated`, `schedule_generated`, `shift_created`, `shift_filled`, `shift_updated`, `shift_optimized`, `shifts_rebalanced`
- `guard:availability_updated`, `guard:status_updated`, `guard:notification:new`
- `notification:new`, `email_scheduler_settings_updated`
- `emergency:resolved`, `action:backup_requested`, `action:callout_triggered`, `inspection:request`
- `overtime_offer`, `overtime_request_approved`, `overtime_request_denied`, `overtime_offer_cancelled`
- `message:new`, `message:read`, `typing:indicator` (messaging — room-based)

**From abe-guard-ai (today received by calloutNotificationListener):**

- `callout_started`, `callout_response`, `shift_filled`, `incidents:new`, `incidents:updated`
- (Plus any guard_clocked_in/out, guard_running_late, emergency:sos if abe-guard-ai emits them.)

**Redis channel design (example):**

- One channel, e.g. `events`, with JSON payload: `{ type: "shift_filled", room: "role:all", payload: { ... } }`, or
- One channel per event type, or
- One channel per room; Gateway subscribes to all and emits to the right Socket.IO room.

---

## 7. What to Build When You Implement (No Changes Yet — Checklist)

1. **Redis instance** (e.g. Railway Redis plugin); get `REDIS_URL`.
2. **WebSocket Gateway (new repo or folder):**
   - Express + HTTP server + Socket.IO.
   - Redis adapter: `createAdapter(pubClient, subClient)` so multiple Gateway instances can share state.
   - Same JWT auth as current backend (handshake.auth.token).
   - Subscribe to Redis channel(s); on message, parse and call `io.to(room).emit(eventType, payload)`.
   - Expose only this service to the frontend for WebSockets (single URL).
3. **Core API (current backend):**
   - Add Redis publisher client; on every place that currently does `req.app.get("io")` / `io.to(...).emit(...)`, replace with `publisher.publish("events", JSON.stringify({ type, room, payload }))` (or your chosen channel schema).
   - Remove Socket.IO server from this process (or keep a minimal one that only forwards to Redis if you do a phased migration).
   - Keep `calloutNotificationListener` logic either: (a) as-is but have it also publish to Redis for realtime, or (b) replace with Redis subscription from abe-guard-ai and have Core API only consume Redis for creating notifications/OpEvents.
4. **abe-guard-ai (if you control it):**
   - Option A: Publish same events to Redis; Gateway subscribes; Core API can optionally also subscribe to create notifications/OpEvents.
   - Option B: Keep admin backend as client of abe-guard-ai; backend publishes to Redis after receiving events (current flow, plus Redis publish).
5. **Frontend:**
   - Restore real socket module: connect to **one** WebSocket URL (the Gateway), with optional second connection to abe-guard-ai only if you keep guard-specific socket there.
   - Env: e.g. `REACT_APP_WS_GATEWAY_URL=https://your-gateway.up.railway.app`.
   - Same events as today; Gateway will emit by room so current listeners (Dashboard, Schedule, etc.) keep working.

---

## 8. Files to Touch When You Implement (Reference Only)

- **Backend:**  
  `server.js` (remove or reduce Socket.IO, add Redis publisher),  
  `calloutNotificationListener.js` (publish to Redis or subscribe from Redis),  
  `socketEventInterceptor.js` (run in Core API on Redis consume or keep in Gateway),  
  `messagingSocket.service.js` (move to Gateway or replicate via Redis),  
  All controllers listed in §2.5 (replace `io.to().emit` with Redis publish).
- **New:**  
  `websocket-gateway/` (or separate repo): server, Redis adapter, Redis subscribe, JWT auth, room-based emit.
- **Frontend:**  
  `src/realtime/socket.js` (restore client, single Gateway URL),  
  env for `REACT_APP_WS_GATEWAY_URL`.

---

**No code was changed.** This document is for preparation only. When you’re ready to implement the WebSocket Gateway + Redis architecture, use this as the map.
