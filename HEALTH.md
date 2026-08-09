# Health endpoints (liveness & readiness)

Both backends expose two health endpoints for production and load balancers.

---

## Endpoints

| Path | Purpose | When to use |
|------|---------|-------------|
| **GET /health** | **Liveness** — process is running | Restart / restart loop detection. No DB check. |
| **GET /health/ready** | **Readiness** — DB connected | Send traffic only when the instance can serve (e.g. load balancer, Kubernetes readiness probe). |

---

## Behavior

- **GET /health**  
  - Always returns **200** and `{ "status": "OK" }` if the process is up.  
  - Use for liveness probes.

- **GET /health/ready**  
  - Runs `sequelize.authenticate()` (with a 5s timeout).  
  - **200** and `{ "status": "ready", "database": "connected" }` when the DB is reachable.  
  - **503** and `{ "status": "not ready", "database": "disconnected" }` (and optional `error` in non-production) when the DB is down or not yet set (e.g. `app.locals.models` not set).  
  - Use for readiness probes so traffic is not sent to instances that cannot reach the database.

---

## Where they are

| Backend | Liveness | Readiness |
|---------|----------|-----------|
| **Admin (5000)** | `GET http://localhost:5000/health` | `GET http://localhost:5000/health/ready` |
| **Guard (4000)** | `GET http://localhost:4000/health` | `GET http://localhost:4000/health/ready` |

---

## Example: Kubernetes

```yaml
livenessProbe:
  httpGet:
    path: /health
    port: 5000
  initialDelaySeconds: 5
  periodSeconds: 10
readinessProbe:
  httpGet:
    path: /health/ready
    port: 5000
  initialDelaySeconds: 5
  periodSeconds: 5
```

Use the same pattern for the guard backend (port 4000).

---

## A4 monitoring (production)

### Probe URLs (admin API)

| Path | Alert when |
|------|------------|
| `GET /health/ready` | Not **200** (DB down or app not serving) |
| `GET /health/cron` | **503** (background jobs failing or stale) |
| `GET /health` | Not **200** (process dead) |

Production example:

```bash
curl -sS https://admin-dashboard-production-2596.up.railway.app/health/ready
curl -sS https://admin-dashboard-production-2596.up.railway.app/health/cron
./backend/scripts/check-prod-health.sh
```

### What is wired in-repo

1. **GitHub Action** `.github/workflows/production-uptime.yml` — every 15 minutes hits `/health/ready` and `/health/cron`. Enable **Actions → workflow → notifications** (or watch the repo) so failures email you.
2. **In-process ticks** record success/failure for `finalize-pending-accepts` into `/health/cron`.
3. **HTTP cron routes** (`/api/cron/*`) also record into `/health/cron` when called with `CRON_SECRET`.

### Railway ops you must set

1. **`CRON_SECRET`** on the admin Railway service (random long string).  
   Without it, external cron URLs return **503** (`CRON_SECRET is required in production`).
2. Optional external pinger (UptimeRobot / Better Stack) every 5 minutes on `/health/ready` → email/SMS.
3. Optional: schedule  
   `GET /api/cron/finalize-pending-accepts?secret=...`  
   and  
   `GET /api/cron/shift-reminders?secret=...`  
   every 1–5 minutes if the dyno sleeps (in-process intervals already cover a warm process).

Env knobs:

```env
CRON_SECRET=...
CRON_STALE_AFTER_MS=900000   # 15 min — /health/cron goes 503 if no success within this window (after jobs have run)
```
