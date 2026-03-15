# Railway: Use Same Postgres + Create Missing Tables

You have:
- **Redis:** `redis://...@redis.railway.internal:6379`
- **Postgres:** `postgresql://...@postgres.railway.internal:5432/railway`

Use the **same** Postgres for both admin-dashboard backend and abe-guard-ai so the tables exist in one place.

---

## 1. Set DATABASE_URL on both backends

In **Railway** → each service (admin-dashboard backend, abe-guard-ai if deployed):

- **Variables** → set **DATABASE_URL** = your Postgres URL  
  (the one ending in `/railway` — use the value from your Postgres service, e.g. from Railway’s “Connect” or “Variables”.)

So:
- **admin-dashboard backend** → `DATABASE_URL` = Postgres URL
- **abe-guard-ai** (if you deploy it) → same `DATABASE_URL`

Use the **internal** URL (`postgres.railway.internal`) for services on Railway so they talk inside the network.

---

## 2. Create missing tables in that Postgres

The database name is `railway`. The tables `time_entries`, `overtime_offers`, `emergency_events` are created by **abe-guard-ai** (migrations/scripts), not by the admin backend. You have two options.

### Option A – Deploy abe-guard-ai and run migrations (best if you use it)

1. Deploy **abe-guard-ai** on Railway.
2. Set its **DATABASE_URL** to the **same** Postgres URL.
3. On startup (or via a release command), run its migrations so it creates `time_entries`, `overtime_offers`, `emergency_events` in the `railway` database.
4. Keep **admin-dashboard backend** `DATABASE_URL` pointing at the same Postgres.

Then both backends use the same DB and the tables exist.

### Option B – Run table-creation scripts once against `railway`

If abe-guard-ai is not deployed, you must create the tables in the `railway` DB yourself.

**Important:** `postgres.railway.internal` is only reachable from **inside** Railway. So:

- You **cannot** run scripts from your laptop using the internal URL.
- Either:
  - Use Railway’s **public** Postgres URL (if your Postgres service has “Connect” / “Public URL”) and run the scripts from your machine once; or
  - Add a **one-off job** or **run** in Railway that uses the internal URL and executes the create scripts.

**Scripts to run (against the `railway` database):**

1. **overtime_offers**  
   From abe-guard-ai:  
   `abe-guard-ai/backend/src/scripts/createOvertimeOffersTable.js`  
   (Run with `DATABASE_URL` set to your Postgres URL; the script expects DB name `abe_guard` or `abe-guard` — you may need to temporarily point it at `railway` or change the script to accept `railway`.)

2. **emergency_events**  
   Run the abe-guard-ai migration:  
   `abe-guard-ai/backend/src/migrations/20260120_000001_create_emergency_tables.js`  
   (e.g. via Sequelize CLI or a small node script that runs the migration with the same `DATABASE_URL`.)

3. **time_entries**  
   Created by abe-guard-ai’s Sequelize sync (TimeEntry model). Run abe-guard-ai’s sync against the `railway` DB, or create the table manually from the TimeEntry model definition.

If you use a **public** Postgres URL from Railway:

```bash
cd abe-guard-ai/backend
DATABASE_URL="postgresql://postgres:PASSWORD@HOST:PORT/railway" node src/scripts/createOvertimeOffersTable.js
```

(Replace with your real public URL; the script may need a small change if it checks for DB name `abe_guard`.)

---

## 3. Redis

Set **REDIS_URL** (or **REDIS_PRIVATE_URL**) on any service that needs Redis (e.g. websocket gateway, or backend that uses Redis) to your Redis URL.  
Use the internal URL for services on Railway.

---

## Summary

| Goal | Action |
|------|--------|
| Same DB for both backends | Set **DATABASE_URL** on admin backend and abe-guard-ai to the same Postgres URL (`.../railway`). |
| Tables exist in that DB | Deploy abe-guard-ai and run migrations (Option A), or run the create scripts once against `railway` (Option B). |
| Redis | Set **REDIS_URL** on services that need it. |

**Security:** Do not commit real credentials. Use Railway Variables only. Rotate the password you shared if it was ever in chat or code.
