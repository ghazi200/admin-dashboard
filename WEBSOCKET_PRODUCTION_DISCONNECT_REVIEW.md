# WebSocket / Socket.IO – Why It Worked Locally, Disconnects in Production

## Why local worked

| Local | Production |
|-------|------------|
| Frontend and backend on same machine (localhost:3001 → localhost:5000) | Frontend on Vercel (HTTPS), backend on Railway (HTTPS) |
| No reverse proxy in between | Railway proxy in front of Node; may close idle or long-lived connections |
| No TLS / mixed content | Browser requires WSS/HTTPS; any ws:// or wrong cert breaks |
| Single tab, single process | Multiple pages (Dashboard, Incidents, Analytics, etc.) each call `connectSocket()` – you use a **singleton**, so only one connection per type, but every navigation can re-run effects |
| Short network path | Higher latency; ping/pong can miss if proxy buffers or delays |

## What causes disconnects in production

1. **Proxy / load balancer idle timeout**  
   Railway (and many hosts) close connections that look idle. Socket.IO over **polling** sends periodic GETs; over **WebSocket** a single long-lived connection can be killed after 30–120s idle.  
   **Mitigation:** Use polling-only (already in frontend) so traffic is periodic; increase server `pingInterval`/`pingTimeout` so the server keeps the connection “active” from the proxy’s view.

2. **Ping/pong timeouts**  
   If the client is slow (mobile, high latency) or the proxy delays packets, the server may not get a pong in time and disconnect.  
   **Mitigation:** Increase `pingTimeout` on the server (e.g. 120000 ms).

3. **JWT expiry**  
   Token in `socket.auth` is set at connect time. If the JWT expires (e.g. 1h) and the server validates on each event, or the client reconnects with the same expired token, auth can fail and the server may disconnect.  
   **Mitigation:** Reconnect with a fresh token when the app detects token refresh or before expiry; or use longer-lived tokens for socket auth only.

4. **Backend restarts / deploys**  
   Every Railway deploy restarts the process; all sockets drop.  
   **Mitigation:** Expect reconnects; frontend already has `reconnection: true`.

5. **CORS / cookie / credentials**  
   If the Socket.IO handshake or polling requests don’t send credentials or get blocked by CORS, connection fails or drops.  
   **Mitigation:** Backend already allows Vercel origins and `credentials: true`; ensure `REACT_APP_ADMIN_REALTIME_URL` is the exact Railway URL (https, no trailing slash).

6. **Multiple tabs**  
   Each tab has its own JS context; each tab opens its own socket(s). That’s normal but doubles connections and can hit rate limits.  
   **Mitigation:** Acceptable; singleton is per-tab.

---

## Backend (Railway) – recommended Socket.IO tuning

In `backend/server.js` where `new Server(server, { ... })` is created:

```js
const io = new Server(server, {
  cors: { origin: corsOrigins, credentials: true, methods: ["GET", "POST"] },
  // Longer timeouts for production (proxies, mobile, high latency)
  pingInterval: 25000,   // ping every 25s
  pingTimeout: 120000,  // wait 2 min for pong before disconnect (was 60s)
  connectTimeout: 45000,
  transports: ["websocket", "polling"],
  // Optional: allow HTTP long-polling to stay open longer (helps through strict proxies)
  maxHttpBufferSize: 1e6,
});
```

- **pingTimeout 120000** reduces “disconnect due to missed pong” behind slow or buffering proxies.
- If Railway still drops idle connections, polling-only on the client (already done) is the most reliable.

---

## Frontend – current behavior

- **Guard socket:** Only created when `REACT_APP_GUARD_REALTIME_URL` is set; **polling only** (`transports: ["polling"]`, `upgrade: false`) so no WebSocket upgrade failures.
- **Admin socket:** Created when `REACT_APP_ADMIN_REALTIME_URL` is set (or localhost); also **polling only**.
- **Singleton:** `connectSocket()` / `connectAdminSocket()` reuse the same instance so you don’t get duplicate connections from Dashboard + Incidents + Analytics, etc.

If disconnects continue after deploy:

1. Confirm **production build** includes the latest `socket.js` (polling-only, no WebSocket).
2. Set **REACT_APP_ADMIN_REALTIME_URL** = `https://admin-dashboard-production-2596.up.railway.app` (no path).
3. Leave **REACT_APP_GUARD_REALTIME_URL** unset if abe-guard-ai isn’t deployed; avoids guard socket errors and unnecessary reconnects.
4. On Railway, check **logs** for “disconnect” reasons (e.g. `ping timeout`, `transport close`).

---

## Summary

| Layer | Change |
|-------|--------|
| **Frontend** | Polling-only, singleton, guard socket only when env set → fewer WebSocket/proxy issues. |
| **Backend** | Increase `pingTimeout` (e.g. 120s); keep CORS allowing Vercel origins. |
| **Deploy** | Redeploy frontend so new socket code is live; set env vars and redeploy backend if you change pingTimeout. |

If you want WebSocket again later (lower latency), re-enable `transports: ["polling", "websocket"]` and `upgrade: true` only after confirming Railway (or your proxy) supports long-lived WebSocket and doesn’t close them early.
