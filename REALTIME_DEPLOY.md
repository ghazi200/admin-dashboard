# Realtime (WebSocket Gateway + Redis) — Deploy Steps

## Architecture

- **Frontend (Vercel)** → connects to **WebSocket Gateway** (single URL).
- **Core API (Railway)** → publishes events to **Redis** (no Socket.IO in process).
- **WebSocket Gateway (Railway)** → subscribes to Redis, emits to connected clients.
- **Redis** → Railway plugin or external (e.g. Upstash).

## 1. Redis

- **Railway:** Add Redis plugin to your project, copy `REDIS_URL`.
- **Or:** Create Redis elsewhere and set `REDIS_URL` in both Core API and Gateway.

## 2. Core API (existing backend)

- In Railway variables for the **admin-dashboard backend** service, set:
  - `REDIS_URL` = your Redis connection URL.
- Redeploy the backend. It will use `realtime.service` to publish to Redis (no Socket.IO server).

## 3. WebSocket Gateway (new service)

- In the same (or new) Railway project, add a **new service**:
  - **Root directory:** `websocket-gateway` (or point to the folder that contains `server.js` and `package.json`).
  - **Build:** `npm install`
  - **Start:** `node server.js`
- **Variables:**
  - `REDIS_URL` = same as Core API.
  - `JWT_SECRET` = same as Core API.
  - `CORE_API_URL` = your Core API public URL (e.g. `https://admin-dashboard-production-xxxx.up.railway.app`).
  - `CORS_ORIGINS` or `FRONTEND_URL` = your Vercel frontend URL(s), comma-separated (e.g. `https://your-app.vercel.app`).
- Deploy and note the Gateway’s public URL (e.g. `https://websocket-gateway-xxxx.up.railway.app`).

## 4. Frontend (Vercel)

- In Vercel → Project → Settings → Environment Variables, add:
  - `REACT_APP_WS_GATEWAY_URL` = Gateway public URL (e.g. `https://websocket-gateway-xxxx.up.railway.app`).
- Redeploy the frontend so the new env is in the build.

## 5. Optional: keep Core API awake

- Use UptimeRobot (or similar) to hit Core API `GET /health` every 5 minutes so the process doesn’t sleep.
- Optionally ping the Gateway `GET /health` as well.

## Quick check

1. Core API and Gateway both have `REDIS_URL` and Gateway has `JWT_SECRET` and `CORE_API_URL`.
2. Frontend has `REACT_APP_WS_GATEWAY_URL` and was redeployed.
3. Open the app, log in, open DevTools → Network: you should see a request to the Gateway (e.g. `socket.io` or polling) and no connection errors.
