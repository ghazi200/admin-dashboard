# WebSocket Gateway

Single-purpose service: accept Socket.IO client connections and broadcast events from Redis. Core API (and abe-guard-ai) publish to Redis; this service subscribes and emits to clients.

## Env

| Variable | Required | Description |
|----------|----------|-------------|
| `PORT` | No | Default 4001 |
| `REDIS_URL` | Yes* | Redis connection URL (*required for Redis adapter and events) |
| `JWT_SECRET` | Yes | Same as Core API (for socket auth) |
| `FRONTEND_URL` or `CORS_ORIGINS` | No | Allowed origins (comma-separated) |
| `CORE_API_URL` | Yes for messaging | Core API base URL for `POST /api/internal/socket/join-conversation` (conversation:join) |

## Run

```bash
npm install
npm start
```

## Deploy (Railway)

1. Add Redis (Railway plugin or external).
2. New service: root = `websocket-gateway`, start = `node server.js`.
3. Set `REDIS_URL`, `JWT_SECRET`, `CORE_API_URL` (your Core API URL), and `CORS_ORIGINS` or `FRONTEND_URL`.
4. Frontend: set `REACT_APP_WS_GATEWAY_URL` to this service’s public URL.

## Flow

- Clients connect with `auth: { token }` (admin or guard JWT). Gateway verifies and joins rooms (`role:all`, `role:admin`, `guard:${id}`, etc.).
- Core API (and others) publish to Redis channel `realtime:events` with payload: `{ rooms: ["role:all"], type: "shift_filled", payload: {...} }`.
- Gateway subscribes to `realtime:events` and runs `io.to(room).emit(type, payload)` for each room.
