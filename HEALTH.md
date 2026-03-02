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
