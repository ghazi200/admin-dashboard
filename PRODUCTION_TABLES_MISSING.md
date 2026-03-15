# Why Tables Are "Missing" in Production (They Existed When You Built)

## What’s going on

**Locally**, everything worked because:

- You had **one** PostgreSQL database (e.g. `abe_guard`).
- You ran **abe-guard-ai** (or its migrations/scripts), which **created** `time_entries`, `overtime_offers`, `emergency_events`, etc.
- You ran **admin-dashboard backend** with the **same** `DATABASE_URL` pointing at that database.
- So the admin backend was querying a DB that already had all those tables.

**In production**, the tables are “missing” because:

- The **admin-dashboard backend** on Railway is using a **different** database than the one that was set up with abe-guard-ai.
- That database (e.g. a new Railway Postgres given only to the admin backend) was **never** run with abe-guard-ai’s migrations or model sync, so it has **no** `time_entries`, `overtime_offers`, or `emergency_events`.
- So the tables aren’t missing from your codebase—they’re missing from the **production database** the deployed admin backend is connected to.

---

## Where these tables come from (in code)

| Table              | Created by |
|--------------------|------------|
| `time_entries`     | **abe-guard-ai** (Sequelize model `TimeEntry`, table created on model sync) |
| `overtime_offers`  | **abe-guard-ai** script: `abe-guard-ai/backend/src/scripts/createOvertimeOffersTable.js` |
| `emergency_events` | **abe-guard-ai** migration: `abe-guard-ai/backend/src/migrations/20260120_000001_create_emergency_tables.js` |

The **admin-dashboard backend** does **not** create these tables; it only **reads/writes** them. It expects to use the **same** database as abe-guard-ai.

---

## How to fix it (choose one)

### Option A – Use the same database in production (recommended)

Make the **admin-dashboard backend** use the **same** `DATABASE_URL` as **abe-guard-ai** in production.

1. If **abe-guard-ai** is deployed on Railway and has its own Postgres:
   - In Railway, open the **abe-guard-ai** service (or the Postgres service that abe-guard-ai uses).
   - Copy the **DATABASE_URL** (or “Postgres” connection URL).
2. In Railway, open the **admin-dashboard backend** service.
   - Set (or update) **DATABASE_URL** to that **exact** URL.
3. Redeploy the admin-dashboard backend.

Then the admin backend will use the same DB as abe-guard-ai. If that DB already has the tables (because abe-guard-ai ran migrations/sync there), the “relation does not exist” errors will stop.

---

### Option B – Create the tables in the current production DB

If you **must** keep the admin backend on a **different** Postgres (e.g. you don’t have abe-guard-ai in production), you have to create the missing tables **in that** database.

1. **Get the DATABASE_URL** of the database the **admin-dashboard backend** uses in production (from Railway Variables).
2. **Run the table-creation logic against that URL** (from your machine or a one-off job):

   - **overtime_offers**  
     From the **admin-dashboard** repo, using the **same** DB URL as production:
     ```bash
     cd backend
     # Set DATABASE_URL to your production admin DB URL (same as Railway)
     DATABASE_URL="postgresql://..." node -e "
     const path = require('path');
     require('dotenv').config({ path: path.join(__dirname, '.env') });
     const { sequelize } = require('./src/models');
     const fs = require('fs');
     const createScript = fs.readFileSync(
       path.join(__dirname, '../abe-guard-ai/backend/src/scripts/createOvertimeOffersTable.js'),
       'utf8'
     );
     // Or run: node ../abe-guard-ai/backend/src/scripts/createOvertimeOffersTable.js
     // after setting DATABASE_URL to the admin backend's production URL
     "
     ```
     Easiest: set `DATABASE_URL` in `.env` (or export it) to the **production admin DB** URL, then run:
     ```bash
     cd abe-guard-ai/backend
     DATABASE_URL="<production-admin-db-url>" node src/scripts/createOvertimeOffersTable.js
     ```
     (Create script path may vary; adjust if your repo layout is different.)

   - **emergency_events**  
     Run the abe-guard-ai migration that creates `emergency_events`, again with `DATABASE_URL` set to the **production admin DB** URL (e.g. run abe-guard-ai migrations with that URL).

   - **time_entries**  
     Created by abe-guard-ai’s Sequelize sync (TimeEntry model). Either run abe-guard-ai’s sync against the production admin DB, or create the table manually from the TimeEntry model definition.

3. After all three tables exist in that database, the admin backend will work without “relation does not exist” for these.

---

## Summary

- The tables **did** exist when you built, in the **local** database that both backends used.
- In production, the admin backend is using a **different** database that never had those tables created.
- Fix: either **use the same DB as abe-guard-ai** (Option A) or **create the same tables in the DB the admin backend uses** (Option B). Option A is simpler if abe-guard-ai is already in production and its DB has the tables.
