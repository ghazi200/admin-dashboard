# Beta Phase 2 — AI callout & shift replacement

**Status: COMPLETE** (production API smoke PASS — 2026-08-09; caller **Seth** → ranked **Ghazi**, accept → pending override → admin confirm)

Run **after Phase 1** passes (`docs/BETA_PHASE_1.md`). Phase 1 covers login, clock, break, messages. Phase 2 adds **callout → AI ranking → notify replacements → accept → shift reassigned**.

---

## Architecture (two Railway services)

```
Guard app (APK)
    │
    ▼
Admin backend (unified Railway)     ← login, clock, messages, overtime
    │
    │  POST /callouts/trigger  (proxy)
    ▼
Guard AI backend (abe-guard-ai)       ← ranking, callout rows, SMS, accept/fill
    │
    ▼
Same PostgreSQL (shared DATABASE_URL)
```

The guard APK can keep pointing at **one URL** (admin backend). Callouts are proxied when `ABE_GUARD_AI_URL` is set on the admin service.

---

## Pre-flight checklist (do before Phase 2 test)

### Railway — Guard AI service (`abe-guard-ai/backend`)

Create a **second** service in the same Railway project:

| Setting | Value |
|---------|--------|
| Root directory | `abe-guard-ai/backend` |
| Start | `npm start` → `node src/server.js` |

**Variables** (see `abe-guard-ai/backend/RAILWAY_VARIABLES.txt`):

| Variable | Value |
|----------|--------|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | `${{ Postgres.DATABASE_URL }}` (same Postgres as admin) |
| `JWT_SECRET` | **Same as admin backend** |
| `CORS_ORIGINS` | Your Vercel admin + guard web URLs |
| `OPENAI_API_KEY` | OpenAI key (optional — without it, rule-based ranking) |
| `TWILIO_ACCOUNT_SID` | For SMS (optional) |
| `TWILIO_AUTH_TOKEN` | For SMS (optional) |
| `TWILIO_FROM_NUMBER` | For SMS (optional) |
| `REDIS_URL` | `${{ Redis.REDIS_URL }}` if using realtime gateway |

Generate a **public domain** → e.g. `https://guard-ai-xxxx.up.railway.app`

Health check:

```bash
curl -s https://YOUR-GUARD-AI-URL/health
```

---

### Railway — Admin backend (callout + email/SMS)

On the **admin** service (`backend/`):

| Variable | Value |
|----------|--------|
| `ABE_GUARD_AI_URL` | `https://YOUR-GUARD-AI-URL.up.railway.app` (no trailing slash) |
| `SMTP_HOST` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM` | Email ranked replacements (e.g. Ghazi) |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` | SMS + voice |
| `TWILIO_MESSAGING_SERVICE_SID` or `TWILIO_PHONE_NUMBER` | SMS From / Messaging Service |
| `TWILIO_PHONE_NUMBER` | **Required for voice** (From number on the call) |
| `PUBLIC_BASE_URL` | Public `https://…` admin URL (Twilio fetches `/twilio/voice`) |
| `CALLOUT_OUTBOUND_CALL=true` | Enable live voice offers (press 1 accept / 2 decline) |
| `CALLOUT_OUTBOUND_EMAIL=false` / `CALLOUT_OUTBOUND_SMS=false` | Pause email/SMS while not testing |
| `CALLOUT_MAX_GUARDS_NOTIFY` | Optional cap (e.g. `10`) |

In-app callout alerts come from Guard AI. **Email / SMS / voice** are sent by the admin backend after ranking.

Voice flow: ranked guard is called → hears location/time → **press 1** to accept (fills shift) or **2** to decline.

**Verify proxy is wired** (expect **401** without token — not **501**):

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST \
  https://admin-dashboard-production-2596.up.railway.app/callouts/trigger \
  -H "Content-Type: application/json" \
  -d '{"shiftId":"00000000-0000-0000-0000-000000000001"}'
# 401 = route + proxy config OK
# 501 = ABE_GUARD_AI_URL missing
# 502 = guard AI URL wrong or service down
```

**Automated production results (2026-08-09):**

| Check | Result |
|-------|--------|
| Proxy without token | Pass — **401** (not 501/502) |
| Guard A (Seth) callout trigger | Pass — rankings=2, shift → OPEN |
| Outbound notify | Pass — inApp=2, called=1 (email/SMS paused or pref-gated) |
| Admin live callouts | Pass |
| Guard B (Ghazi) `/callouts/mine` | Pass — offer visible |
| Guard B respond `ACCEPTED` | Pass — `pendingAccept: true` |
| Admin confirm pending accept | Pass — shift assigned / finalized |
| Cleanup smoke shift | Pass |

---

### Test data (minimum)

| Item | Requirement |
|------|-------------|
| Guards | **At least 2** active guards with passwords |
| Phones | Phone numbers on replacement guards (for SMS) |
| Shift | Today’s shift assigned to **Guard A** (caller) |
| Passwords | Set via `backend/src/scripts/setGuardPassword.js` |

**Create guard:** Admin → **Guards** (name, email, phone, Active ✓)

**Set password** (uses `backend/.env` — do not paste URL in terminal):

```bash
cd backend
node src/scripts/setGuardPassword.js guard-a@yourcompany.com 'TempPass123!'
node src/scripts/setGuardPassword.js guard-b@yourcompany.com 'TempPass123!'
```

**Assign shift:** Admin → **Shifts** → date, times, location → assign Guard A

---

## Phase 2 smoke test (you run this)

### Running late (quick)

1. Guard A logs in with an assigned shift
2. Home → **Running Late** (or Callouts page) with reason / minutes
3. **Expected:** success (`ok: true`); admin may see late event if UI/realtime enabled

### Step 1 — Guard A callout (caller)

1. Guard A logs into APK
2. Open assigned shift on **Home**
3. Select callout reason (sick / emergency / personal)
4. Tap **Callout** (or use **Callouts** tab)

**Expected:**

- Success message (not 501/502)
- Shift becomes unassigned / OPEN in admin

### Step 2 — Guard B notified (replacement)

1. Guard B logs in (second phone or emulator)
2. Open **Callouts** tab
3. See offer with rank / reason
4. Tap **Accept**

**Expected:**

- Shift assigned to Guard B
- Admin dashboard shows shift filled (if realtime connected)

### Step 3 — SMS (if Twilio configured)

- Replacement guards receive SMS with shift time + “Open Guard app”
- Check Railway logs on guard AI service if SMS skipped

---

## Error guide

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| **501** Callouts not configured | `ABE_GUARD_AI_URL` missing on admin | Add variable, redeploy |
| **502** Proxy failed | Guard AI down or wrong URL | Check guard AI deploy + URL |
| **404** Shift not found | Guard AI uses different DB | Same `DATABASE_URL` on both services |
| **401** on login for Guard B | Password not set | Run `setGuardPassword.js` |
| No replacements listed | Only one guard in system | Add Guard B, C |
| No SMS | Twilio not set or no phone | Add Twilio vars + guard phone |
| Ranking says “rules” not AI | No `OPENAI_API_KEY` | Add key on guard AI service |

---

## Admin dashboard during callout

- [x] Command center / schedule shows shift **OPEN** — smoke verified
- [x] Callout rankings visible (if UI enabled for tenant) — rankings returned in trigger response
- [x] Shift **filled** after accept — via pending-accept confirm
- [x] Realtime updates (requires WebSocket gateway + Redis) — live-callouts endpoint Pass (socket optional)

---

## Local dev reference (optional)

If testing callouts locally before Railway:

**`backend/.env`:**

```env
ABE_GUARD_AI_URL=http://localhost:4000
```

**`abe-guard-ai/backend/.env`:** same `DATABASE_URL` and `JWT_SECRET` as admin.

Run guard AI: `cd abe-guard-ai/backend && npm start` (port 4000)

---

## After Phase 2 passes

- Include callout in tester checklist for wider beta
- Consider native HTTP for callout routes in guard app (same pattern as clock-in/overtime)
- Document Twilio sender number for production SMS compliance
- Add callout metrics to admin reporting

See also: `RAILWAY_DEPLOY.md`, `docs/BETA_PHASE_0.md`, `docs/BETA_PHASE_1.md`.
