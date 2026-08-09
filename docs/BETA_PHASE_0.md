# Beta Phase 0 — Security hardening checklist

**Status: COMPLETE** (verified production smoke — 2026-08-09)

Phase 0 prepares the stack for a **closed internal beta**. Code changes in this phase lock down dev endpoints and production builds; you still need to configure Railway/Vercel and run smoke tests.

---

## Code changes (this repo)

| Item | Status |
|------|--------|
| `/api/dev/*` disabled when `NODE_ENV=production` | Done |
| `POST /api/dev/seed-guard-bob` dev-only | Done |
| `POST /api/admin/register` blocked in production unless `ALLOW_ADMIN_REGISTER=true` | Done |
| Strict CORS in production (Capacitor/localhost still allowed) | Done |
| `CRON_SECRET` required in production for cron endpoint | Done |
| `/api/admin/login-debug` dev-only | Done |
| JWT secret no longer logged on register | Done |
| Guard app: test routes dev-only | Done |
| Guard app: `/shifts/swap` requires login | Done |
| Guard app: Settings/dev token hidden in production builds | Done |
| Capacitor production config (no WebView debug, `https` scheme) | Done |
| Admin login: no pre-filled test credentials | Done |
| Android `versionCode` 4 / `1.0.3` | Done |

---

## Railway — admin backend (`backend/`)

Set these variables on the **admin** service:

| Variable | Value |
|----------|--------|
| `NODE_ENV` | `production` (lowercase — `Production` also works after deploy) |
| `DATABASE_URL` | `${{ Postgres.DATABASE_URL }}` |
| `JWT_SECRET` | 32+ random characters (same as guard backend if split) |
| `CORS_ORIGINS` | Your Vercel admin URL, guard web URL if any |
| `CRON_SECRET` | Random secret for scheduled jobs |
| `REDIS_URL` | `${{ Redis.REDIS_URL }}` (if using realtime) |

**Do not set** (leave unset for beta):

- `ALLOW_ADMIN_REGISTER` — registration stays off
- `CORS_ALLOW_ALL` — do not enable in production

Redeploy after saving variables.

---

## Vercel — admin dashboard

| Variable | Example |
|----------|---------|
| `REACT_APP_API_URL` | `https://YOUR-RAILWAY-APP.up.railway.app/api/admin` |
| `REACT_APP_ADMIN_API_URL` | same as above if unified |
| `REACT_APP_GUARD_AI_URL` | Guard AI backend URL if used |
| `REACT_APP_WS_GATEWAY_URL` | WebSocket gateway URL if used |

Redeploy after env changes.

---

## Guard mobile app — production build

1. Copy env template:
   ```bash
   cd frontend-guard-ui
   cp .env.production.example .env.production
   ```
2. Set `REACT_APP_GUARD_API_URL` and `REACT_APP_ADMIN_API_URL` to your deployed backends.
3. Build and sync:
   ```bash
   npm run build:mobile
   ```
4. Open `frontend-guard-ui/android` in Android Studio → Run.

**Local Android debugging** (emulator + `http://10.0.2.2`):

```bash
cp capacitor.config.dev.json capacitor.config.json
npm run build:mobile
# restore production config before beta APK:
git checkout capacitor.config.json
```

---

## Smoke tests (before inviting testers)

### Backend

```bash
curl -s https://YOUR-BACKEND/health/ready
curl -s -o /dev/null -w "%{http_code}" -X POST https://YOUR-BACKEND/api/dev/seed-admin
# expect 404

curl -s -o /dev/null -w "%{http_code}" -X POST https://YOUR-BACKEND/api/admin/register \
  -H "Content-Type: application/json" -d '{"email":"x@test.com","password":"test123456"}'
# expect 403
```

**Production results (2026-08-09) against `admin-dashboard-production-2596.up.railway.app`:**

| Check | Result |
|-------|--------|
| `GET /health/ready` | Pass — `{"status":"ready","database":"connected"}` |
| `POST /api/dev/seed-admin` | Pass — **404** |
| `POST /api/admin/register` | Pass — **403** Registration is disabled |
| CORS for Vercel admin origin | Pass — allow-origin matches frontend |
| Admin login + `/me` + dashboard + list guards | Pass |

### Admin web

- [x] Login in incognito (no pre-filled password)
- [x] Dashboard loads
- [x] Create guard, assign shift (write path verified; assign used in prior Phase 1/2 ops)

### Guard Android

- [x] Fresh install (Phase 1 APK path exercised)
- [x] Email/password sign in (no Settings panel visible)
- [x] Home, shifts, time clock, messages (Phase 1 checklist)

---

## Phase 1 (next)

See **`docs/BETA_PHASE_1.md`** for the internal tester checklist and APK packaging steps.

For the full security-pilot roadmap (onboarding gaps, audit, legal, 90-day backlog), see **`docs/GO_TO_MARKET_90_DAY.md`**.

After Phase 0 passes smoke tests:

1. Invite 5–10 internal testers
2. Distribute debug APK or Play Internal track
3. Track crashes and fix top blockers
4. Consider Sentry/error reporting
