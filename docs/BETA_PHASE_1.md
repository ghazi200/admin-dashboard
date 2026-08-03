# Beta Phase 1 — Internal tester checklist & APK distribution

Phase 1 is a **closed internal beta**: 5–10 trusted testers (guards + 1–2 admins) on **production backends**. Phase 0 security must be complete first (`docs/BETA_PHASE_0.md`).

---

## Before you invite anyone

### Production backends (Railway)

Confirm on the **admin backend** service:

| Variable | Value |
|----------|--------|
| `NODE_ENV` | `production` (lowercase) |
| `DATABASE_URL` | `${{ Postgres.DATABASE_URL }}` |
| `JWT_SECRET` | 32+ random characters |
| `CORS_ORIGINS` | Your Vercel admin URL(s) |
| `CRON_SECRET` | Random secret |

Quick smoke tests:

```bash
curl -s https://admin-dashboard-production-2596.up.railway.app/health/ready
# expect: {"status":"ready","database":"connected"}

curl -s -o /dev/null -w "%{http_code}\n" -X POST \
  https://admin-dashboard-production-2596.up.railway.app/api/dev/seed-admin
# expect: 404

curl -s -o /dev/null -w "%{http_code}\n" -X POST \
  https://admin-dashboard-production-2596.up.railway.app/api/admin/register \
  -H "Content-Type: application/json" \
  -d '{"email":"x@test.com","password":"Xk9!mQ2zLp4#","name":"Test"}'
# expect: 403
```

### Admin web (Vercel)

- [ ] `REACT_APP_API_URL` points at production Railway (`…/api/admin`)
- [ ] Login works in **incognito** (no pre-filled passwords)
- [ ] You can create a guard and assign a shift for test week

### Test accounts

Create **real guard accounts** in admin (do not share `bob@abe.com` in production — dev seed is off).

| Role | How to create | Give tester |
|------|----------------|-------------|
| Guard | Admin → Guards → Add guard | Email + temp password |
| Admin | Existing super admin / DB user | Email + password (+ MFA if enabled) |

Document tenant name and who owns password resets.

**Set login password** (admin UI does not set passwords — run once per guard):

```bash
cd backend
# DATABASE_URL is read from backend/.env (never paste it in the terminal)
node src/scripts/setGuardPassword.js tester@yourcompany.com 'YourTempPassword!'
```

---

## Package the guard APK (Android)

App id: `com.abe.guardui` · Version: **1.0.3** (versionCode **4**)

### Option A — Debug APK (fastest for internal beta)

Good for 5–10 testers you trust. They must allow **Install unknown apps** for Chrome/Drive/email.

**1. Production API URLs**

```bash
cd frontend-guard-ui
cp .env.production.example .env.production   # skip if you already have this file
```

Edit `.env.production`:

```env
REACT_APP_GUARD_API_URL=https://admin-dashboard-production-2596.up.railway.app
REACT_APP_ADMIN_API_URL=https://admin-dashboard-production-2596.up.railway.app
```

(No trailing slash.)

**2. Confirm production Capacitor config**

`capacitor.config.json` should **not** enable WebView debug or `http` scheme (see `docs/BETA_PHASE_0.md`). Do **not** use `capacitor.config.dev.json` for beta APKs.

**3. Build web + sync + APK**

```bash
cd frontend-guard-ui
npm run build:mobile

export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
cd android
./gradlew assembleDebug
```

**4. APK location**

```
frontend-guard-ui/android/app/build/outputs/apk/debug/app-debug.apk
```

**Helper script (same steps):**

```bash
chmod +x frontend-guard-ui/scripts/build-beta-apk.sh
./frontend-guard-ui/scripts/build-beta-apk.sh
```

**5. Share the APK**

- Google Drive / Dropbox link, or
- Email (if small enough), or
- Play Console **Internal testing** (Option B below)

Tell testers: uninstall any old Guard UI first, then install `app-debug.apk`.

---

### Option B — Signed release APK / AAB (Play Internal track)

Use when you want Play Store install flow or more than ~10 testers.

**1. Create a keystore (once)**

```bash
keytool -genkey -v -keystore ~/guard-ui-beta.keystore -alias guardui \
  -keyalg RSA -keysize 2048 -validity 10000
```

Store the keystore password somewhere safe (1Password, etc.). **Do not commit the keystore.**

**2. Add signing config**

In Android Studio: **Build → Generate Signed Bundle / APK → APK**

- Key store path: `~/guard-ui-beta.keystore`
- Build variant: **release**
- Finish

Or from terminal after `npm run build:mobile`:

```bash
cd frontend-guard-ui/android
./gradlew assembleRelease
# Requires signing config in android/app/build.gradle or keystore.properties
```

Release output (when signed):

```
android/app/build/outputs/apk/release/app-release.apk
```

**3. Play Console Internal testing**

- Create app listing (draft is fine for internal)
- Upload **AAB** (preferred) or APK to **Internal testing**
- Add tester Google accounts by email
- Testers install via Play Store link

See `frontend-guard-ui/BUILD_MOBILE.md` for icon/splash and store checklist.

---

## Tester instructions (copy/paste to email/Slack)

```
Guard UI — Internal Beta (v1.0.3)

Install:
1. Uninstall any old "Guard UI" app.
2. Install the attached APK (or use the Play Internal link).
3. Open the app — do NOT expect a Settings panel on login.

Sign in:
- Email: [provided by admin]
- Password: [provided by admin]

Please test this week and report issues using the template below.

Production admin dashboard (admins only): [your Vercel URL]
```

---

## Guard app — tester checklist

Each guard tester should complete **once**, then spot-check during the week.

### Login & home

- [ ] Fresh install opens to login (no dev Settings / server URL fields)
- [ ] Sign in with assigned email/password
- [ ] Home loads without long freeze
- [ ] Current shift (if assigned) shows correct date/time/location

### Time clock

- [ ] **Clock in** on an assigned shift
- [ ] Overtime panel loads or stays hidden (no red error banner)
- [ ] **Start break** → break timer appears
- [ ] **End break**
- [ ] **Clock out**
- [ ] Status text updates (Clocked in → On break → Clocked out)

### Shifts

- [ ] **Shifts** tab lists upcoming shifts
- [ ] Shift detail / history readable
- [ ] Accept shift (if offered) works

### Messages

- [ ] **Messages** opens
- [ ] Send a test message to admin (or reply to broadcast)
- [ ] Unread badge updates (if applicable)

### Other (if used)

- [ ] Availability preferences save
- [ ] Incident report submits
- [ ] Ask Policy / AI page loads (if enabled for tenant)
- [ ] Shift swap marketplace (if enabled)

**Skip callouts in Phase 1** — Phase 2 only (`docs/BETA_PHASE_2.md`).

### Device notes (ask tester to report)

- Phone model + Android version
- Wi‑Fi vs cellular
- Any “App isn’t responding” or blank screen

---

## Admin web — tester checklist

- [ ] Login (incognito) with real admin account
- [ ] Dashboard loads
- [ ] **Guards** — view list, open guard profile
- [ ] **Schedule** — view/create shift, assign guard
- [ ] **Messages** — send message to guard tester
- [ ] Confirm guard’s clock-in appears (time clock / dashboard)
- [ ] **Overtime** — view offers (if used)

---

## Bug report template

Ask testers to send:

```
Device: [e.g. Pixel 7, Android 14]
App version: 1.0.3
Network: Wi‑Fi / LTE
Account email: [guard or admin email]

What I tried:
1.
2.

What I expected:

What happened:

Screenshot or screen recording: [attach]
Time (with timezone):
```

Track issues in a spreadsheet or GitHub Issues with labels: `beta`, `blocker`, `guard-app`, `admin-web`.

---

## What to fix first (priority)

| Priority | Examples |
|----------|----------|
| **P0 Blocker** | Cannot login, cannot clock in/out, app crash on launch |
| **P1 Major** | Messages not sending, wrong shift shown, overtime errors |
| **P2 Minor** | UI alignment, wording, slow load |
| **P3 Nice** | Theming, extra polish |

Aim to clear **P0** before adding more testers.

---

## Optional: error reporting

Before widening beta, consider:

- **Sentry** (React + Node) for crash/stack traces
- Railway logs for API 5xx
- A shared `#beta-feedback` Slack channel

---

## Phase 2 — next (AI callout)

When Phase 1 blockers are cleared:

1. Deploy **Guard AI** service (`abe-guard-ai/backend`) on Railway
2. Set **`ABE_GUARD_AI_URL`** on the admin backend
3. Run the 2-guard callout smoke test in **`docs/BETA_PHASE_2.md`**

See also: `frontend-guard-ui/BUILD_MOBILE.md`, `docs/BETA_PHASE_0.md`.
