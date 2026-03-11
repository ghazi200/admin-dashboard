# Root folders and files review

Review of **repo root only** — not the contents of `abe-guard-ai/`, `backend/`, `frontend-admin-dashboard/`, or `frontend-guard-ui/`.

---

## Root directories

| Folder | Purpose |
|--------|---------|
| **api/** | Vercel serverless: proxy to Railway. `[...path].js` = catch-all for `/api/*`; `proxy.js` = optional query-based proxy. |
| **abe-guard-ai/** | Guard/AI backend (port 4000). Not reviewed in depth here. |
| **backend/** | Admin-dashboard backend (port 5000). Not reviewed in depth here. |
| **docs/** | Single file: `CONFIGURATION_AND_ENV.md`. |
| **frontend-admin-dashboard/** | Admin dashboard app (port 3001). Not reviewed in depth here. |
| **frontend-guard-ui/** | Guard UI app (port 3000). Not reviewed in depth here. |
| **node_modules/** | Root-level deps (from root `package.json`). |
| **websocket-gateway/** | WebSocket gateway (Redis-backed). Separate deploy (e.g. Railway). |

---

## Root config files

| File | Purpose |
|------|---------|
| **vercel.json** | Vercel deploy: build from `frontend-admin-dashboard/admin-dashboard-frontend`, output `build/`. Rewrites: `/health` → `/api/health`, `/api/:path*` → API, `/(.*)` → `/index.html`. |
| **package.json** | Root package: name `admin-dashboard-monorepo`, scripts `start` / `install` run from `backend/`. Used for Railway root. |
| **.gitignore** | Ignores `node_modules/`, `.env*`, `build/`, `dist/`, logs, `.DS_Store`, `.idea`, `.vercel`. |
| **.env** | Local env (ignored by git). Do not commit. |

---

## Root scripts (shell)

| File | Purpose |
|------|---------|
| **start-all.sh** | Starts all 4: abe-guard-ai (4000), backend (5000), guard-ui (3000), admin-dashboard frontend (3001). Opens separate terminals (macOS/Linux). |
| **check-services.sh** | Checks ports 4000, 5000, 3000, 3001. **Issue:** “To start” lines use old paths (`~/abe-guard-ai/backend`, `~/admin-dashboard/backend`, etc.); should use `$SCRIPT_DIR` or relative paths. |
| **test-all-services.sh** | Service tests. |
| **test-endpoint.sh** | Curl test for an endpoint. |

---

## Root scripts (Node / other)

| File | Purpose |
|------|---------|
| **CHECK_GUARD_SHIFTS.js** | One-off script (guard shifts). |
| **CREATE_GUARD_TOKEN.js** | One-off (create guard token). |
| **CREATE_GUARD_USER.js** | One-off (create guard user). |
| **CREATE_TEST_INCIDENT.js** | One-off (test incident). |
| **DEBUG_POLICY_QUERY.js** | One-off (policy query debug). |
| **test-announcements.js** | Test announcements. |
| **test-dashboard-update.js** | Test dashboard update. |
| **test-payroll-ai.js** | Test payroll AI. |
| **test-token-compatibility.js** | Test token compatibility. |
| **create_lunch_policy_pdf.py** | Python util (lunch policy PDF). |

---

## Root static / misc

| File | Purpose |
|------|---------|
| **CUSTOM_REPORT_BUILDER_MOCKUP.html** | Static HTML mockup. |
| **PUSH_TO_GITHUB.txt** | Short instructions. |

---

## Root Markdown files

There are **many** `.md` files at root (100+): handoffs, fix plans, guides, test results, etc. They are useful as history and reference but make the root busy.

**Suggestions (optional):**

- Keep at root only: **README_MONOREPO.md**, **QUICK_START.md**, **TROUBLESHOOTING.md**, **PRODUCTION_CHECKLIST.md**, **LOGIN_CREDENTIALS.md**, and a short **README.md** that points to these and to `docs/`.
- Move the rest into **docs/** (e.g. `docs/login/`, `docs/deploy/`, `docs/features/`) if you want a cleaner root. Not required.

---

## Issues and fixes

1. **check-services.sh** – “To start missing services” section uses fixed paths like `~/abe-guard-ai/backend` and `~/admin-dashboard/backend`. These will be wrong for many clones. Prefer the same pattern as **start-all.sh** (script dir + relative paths), e.g.:
   ```bash
   SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
   echo "Terminal 1: cd $SCRIPT_DIR/abe-guard-ai/backend && npm start"
   echo "Terminal 2: cd $SCRIPT_DIR/backend && npm start"
   # etc.
   ```
2. **Root package.json** – Only has `start` and `install` for `backend/`. Fine if Railway runs from root and uses `backend/`. No change needed unless you want root `npm run` scripts for all apps.
3. **api/** – Correct for Vercel: `api/[...path].js` is the catch-all; `api/proxy.js` is optional. No change needed.

---

## Summary

| Item | Status |
|------|--------|
| Root dirs | Clear: api, backend, frontend-admin-dashboard, frontend-guard-ui, abe-guard-ai, docs, websocket-gateway. |
| vercel.json | Correct for proxy + SPA. |
| package.json | Minimal; backend-focused. |
| .gitignore | Good; .env ignored. |
| start-all.sh | Good; uses script dir. |
| check-services.sh | Fix “To start” paths to use script dir. |
| Root .md count | High; optional: move some to docs/. |
| Root .js / .py | One-off and test scripts; fine at root or move to `scripts/` later. |

No need to change abe-guard-ai, admin-dashboard (backend), or guard-ui code for this root-level review.
