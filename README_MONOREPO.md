# Full Stack in This Repo

This repository contains **everything** needed to run the full ABE Guard system. All three parts live in one repo so they work together.

---

## What’s in the repo

| Folder | What it is | Port |
|--------|------------|------|
| **abe-guard-ai/** | Guard/AI backend (auth, shifts, clock in/out, callouts, running late, overtime, etc.) | **4000** |
| **backend/** | Admin-dashboard backend (admin API, guard messages, shift swap, availability, reports) | **5000** |
| **frontend-guard-ui/** | Guard app (login, timeclock, callouts, messages, shifts, swap, etc.) | **3000** |
| **frontend-admin-dashboard/** | Admin app (dashboard, guards, shifts, messages, command center, etc.) | **3001** |

---

## How they work together

- **Guard UI** (3000) → logs in and calls **abe-guard-ai** (4000) for clock in/out, callouts, running late, shifts, payroll, etc.
- **Guard UI** (3000) → uses **admin-dashboard backend** (5000) for messages and shift management (swap, availability, history) via proxy `/api/guard` → 5000.
- **Admin Dashboard** (3001) → talks to **admin-dashboard backend** (5000) for all admin features; backend can listen to abe-guard-ai for callout/clock events.

---

## Quick start (all from this repo)

1. **Install dependencies** in each app (first time only):
   ```bash
   cd abe-guard-ai/backend && npm install && cd ../..
   cd backend && npm install && cd ..
   cd frontend-guard-ui && npm install && cd ..
   cd frontend-admin-dashboard/admin-dashboard-frontend && npm install && cd ../..
   ```

2. **Start all four services** (opens 4 terminals):
   ```bash
   ./start-all.sh
   ```

3. **Open in browser:**
   - Guard app: http://localhost:3000  
   - Admin dashboard: http://localhost:3001  

---

## Start services manually (4 terminals)

```bash
# Terminal 1 – abe-guard-ai (4000)
cd abe-guard-ai/backend && npm start

# Terminal 2 – admin-dashboard backend (5000)
cd backend && npm start

# Terminal 3 – guard UI (3000)
cd frontend-guard-ui && npm start

# Terminal 4 – admin dashboard frontend (3001)
cd frontend-admin-dashboard/admin-dashboard-frontend && npm start
```

---

## Environment

- **abe-guard-ai/backend** – uses its own `.env` (DB, JWT, etc.). See `abe-guard-ai/backend` for details.
- **backend** – uses repo root `.env` or `backend/.env` (DB, JWT, CORS, etc.).
- **frontend-guard-ui** – expects abe-guard-ai at `http://localhost:4000` and admin backend at `http://localhost:5000` (dev proxy for `/api/guard` is in `frontend-guard-ui/setupProxy.js`).

For production, set `REACT_APP_GUARD_API_URL` and `REACT_APP_ADMIN_API_URL` in guard-ui and build; ensure both backends allow CORS for your frontend origins.

---

## Summary

| Question | Answer |
|----------|--------|
| Where is abe-guard-ai? | In this repo: `abe-guard-ai/` |
| Where is guard-ui? | In this repo: `frontend-guard-ui/` |
| Where is admin dashboard? | In this repo: `backend/` + `frontend-admin-dashboard/` |
| How do I run everything? | Run `./start-all.sh` from the repo root (or start the 4 services manually as above). |
