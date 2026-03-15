# WebSocket & production audit — why it worked in dev and disconnects in prod

## 1. Project layout (2 backends, 2 frontends)

| Project | Path | Port (dev) | Production | Role |
|--------|------|------------|------------|------|
| **Admin dashboard backend** | `backend/` | 5000 | Railway (admin-dashboard-production-2596) | Login, API, notifications DB, **publishes to Redis** |
| **abe-guard-ai backend** | `abe-guard-ai/backend/` | **4000** | (separate Railway?) | Guard API, **own Socket.IO** (`join_admin`, `io.to("admins")`) |
| **WebSocket gateway** | `websocket-gateway/` | **4001** (from .env.example) | Railway (generous-manifestation-production-dbd9) | **Single Socket.IO** for production; subscribes to **Redis** |
| **Admin dashboard frontend** | `frontend-admin-dashboard/admin-dashboard-frontend/` | 3000 | Vercel | Connects to **one** socket URL |
| **Guard UI frontend** | `frontend-guard-ui/` | 3000/3001 | Vercel | Uses abe-guard-ai API; may use socket for guard events |

So you have **two** Socket.IO servers:

- **abe-guard-ai (4000):** handles `join_admin`, rooms `admins`, `admins:tenant`, `super_admin`, `guards`, etc. Emits callouts, shifts, incidents, etc. **Does not use Redis** — all in-process.
- **websocket-gateway (4001 / Railway):** no `join_admin` listener; **auto-joins** `role:admin`, `role:all` from JWT. Receives events **only via Redis** (`realtime:events`). Used when admin backend publishes (e.g. `notification:new`).

---

## 2. Dev vs prod: different socket target (root cause)

**Development (.env):**

- Admin frontend `.env.example` says:  
  `REACT_APP_SOCKET_URL=http://localhost:4000`
- So in dev the admin dashboard connects to **port 4000** → **abe-guard-ai backend**.
- There, `join_admin` is implemented and the client joins `admins` and gets all events from abe-guard-ai (callouts, shifts, etc.). So “everything was working” in dev.

**Production (frontend code):**

- Admin frontend `src/realtime/socket.js` **hardcodes** production URL when host is not localhost:
  - `WS_GATEWAY_PRODUCTION = "https://generous-manifestation-production-dbd9.up.railway.app"`
- So on Vercel the admin dashboard connects to **websocket-gateway**, **not** abe-guard-ai.
- websocket-gateway:
  - Does **not** listen for `join_admin` (it auto-joins from JWT).
  - Only gets events from **Redis** (admin backend and anyone else who publishes to `realtime:events`).
  - Does **not** receive events that abe-guard-ai emits locally to its own `io.to("admins")` (those never go to Redis).

So:

- **Dev:** one socket to **abe-guard-ai:4000** → full feature set from that server.
- **Prod:** one socket to **websocket-gateway** → only what goes through Redis (e.g. admin backend `notification:new`). Anything that only abe-guard-ai emits (e.g. callouts, shifts from that codebase) never reaches the admin dashboard in prod unless it is also published to Redis.

That’s an **architecture** difference, not just “reconnect logic.” It can feel like “disconnect” or “no events” if you expect the same events as in dev.

---

## 3. What must match for production socket to work

For the admin dashboard on Vercel to stay connected and get events via **websocket-gateway**:

| Check | Where | Notes |
|-------|--------|------|
| **Same JWT_SECRET** | Admin backend (5000) **and** websocket-gateway | Admin login issues JWT with `adminId`, `role`, etc. Gateway verifies with `JWT_SECRET`. If they differ, handshake fails → connect_error / disconnect. |
| **REDIS_URL on admin backend** | `backend/` env (e.g. Railway) | So `emitToRealtime()` actually publishes to Redis. Otherwise `notification:new` etc. never reach the gateway. |
| **REDIS_URL on websocket-gateway** | `websocket-gateway/` env (Railway) | So it subscribes to `realtime:events` and can emit to clients. |
| **CORS** | websocket-gateway `server.js` | Already allows `*.vercel.app` and your admin frontend URLs. |
| **Socket URL in frontend** | Admin frontend | Already points to `generous-manifestation-production-dbd9.up.railway.app` when not localhost. |

Most likely causes of “disconnect” or “no events” in production:

1. **JWT_SECRET** on gateway not equal to admin backend → connection rejected or closed after connect.
2. **REDIS_URL** missing on backend or gateway → no events flow to the gateway, so the socket “works” but feels dead.
3. Expecting **abe-guard-ai** events (e.g. callouts, shifts) on the **same** connection in prod — they won’t be there unless abe-guard-ai also publishes those events to Redis and the gateway re-emits them.

---

## 4. Gateway server options (stability)

In `websocket-gateway/server.js` you have:

```javascript
const io = new Server(server, {
  transports: ["websocket"],   // no polling
  pingInterval: 25000,
  pingTimeout: 60000,
  connectTimeout: 45000,
  ...
});
```

- **transports: ["websocket"]** is fine; client will use WebSocket. If you want a fallback, you could add `"polling"` (client already offers both).
- **pingInterval / pingTimeout** are good for keeping connections alive behind proxies. No change needed unless you see timeout disconnects in logs.

---

## 5. Recommended next steps (no frontend code changes yet)

1. **Verify production env (Railway)**  
   - **Admin dashboard backend:** `JWT_SECRET`, `REDIS_URL` (and that Redis is the same one used below).  
   - **WebSocket gateway:** same `JWT_SECRET`, same `REDIS_URL`, and that it’s the same Redis instance (or at least same `realtime:events` channel).

2. **Confirm who emits what**  
   - Events from **admin backend** (notifications, etc.) → must go through Redis so the gateway can emit them.  
   - Events from **abe-guard-ai** (callouts, shifts, etc.) → today only go to clients connected to **abe-guard-ai:4000**. For production admin dashboard to get them, either:  
     - abe-guard-ai also publishes those event types to Redis (and gateway subscribes), or  
     - Admin frontend in production would need a **second** socket to abe-guard-ai (different URL), which is a bigger change.

3. **Reproduce “disconnect” with logs**  
   - In **websocket-gateway** logs: look for `connect_error`, `Unauthorized`, or `Socket disconnected` right after connect.  
   - If you see `Unauthorized` or auth errors → fix **JWT_SECRET** (and optionally token payload) so gateway accepts the same token the admin backend issues.

4. **Optional: dev alignment with prod**  
   - In dev, run **websocket-gateway** (e.g. port 4001) and point admin frontend to it (`REACT_APP_SOCKET_URL=http://localhost:4001`) with Redis and same JWT_SECRET as admin backend. Then dev and prod use the same path: one socket to the gateway, events via Redis.

---

## 6. Summary

- **“Everything was working before production”** fits with: in dev you were connecting to **abe-guard-ai:4000**, which has `join_admin` and all its events.
- In production the same frontend connects to **websocket-gateway**, which is a different server and only gets events from Redis. So behavior is expected to differ unless env and event flow are correct.
- Before changing reconnect or frontend logic again, fix the **transition**: same **JWT_SECRET** and **REDIS_URL** on both admin backend and websocket-gateway, and decide whether abe-guard-ai events must also flow through Redis for the admin dashboard in production.

No new frontend or backend code changes are recommended until this env/architecture is verified and, if needed, abe-guard-ai → Redis is added for the events you want in prod.
