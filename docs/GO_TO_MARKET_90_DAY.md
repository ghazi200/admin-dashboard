# ABE Guard — 90-Day Go-to-Market Plan (copy/paste)

ICP (next 90 days): contract security / site ops (multi-site, callout pain).
Not yet: hospitals / PHI-heavy medical (see Medical gate at the end).

Related docs in repo:
- docs/BETA_PHASE_0.md — production hardening
- docs/BETA_PHASE_1.md — internal tester + APK
- docs/BETA_PHASE_2.md — AI callout smoke
- docs/Sales_AI_Platform_Value_Summary.md — cold outreach copy
- docs/CONFIGURATION_AND_ENV.md — env inventory

------------------------------------------------------------
SNAPSHOT — WHERE THE PRODUCT STANDS
------------------------------------------------------------

SHIPPED
- Admin API + dashboard (Railway + Vercel)
- Guard Android Capacitor beta APK (frontend-guard-ui/; Play Internal still manual)
- Shifts / clock / messages (Phase 1)
- Callouts + AI rank + email/SMS/voice (Phase 2; ContactPreferences wired)
- Pending-accept override window (admin/supervisor confirm)
- Shift swaps hardened (atomic claim; approve requires acceptor)
- Contact prefs email/SMS/phone/in-app (Guards form + outbound honors them)
- MFA for admins (mfa.service.js, Account Security UI)
- Multi-tenant filter (needs CI leak tests)

GAPS
- Guard password in admin UI — script only: backend/src/scripts/setGuardPassword.js
- Bulk import / invite email — manual create only
- Unified audit export — fragments only (approved_by, OpEvents)
- DPA / MSA / billing (Stripe) — tenant plan fields exist; no payments
- SOC2 / HIPAA / BAA — aspirational only

------------------------------------------------------------
SUCCESS CRITERIA (END OF DAY 90)
------------------------------------------------------------

1. One security pilot signed (paid or LOI) on production backends.
2. Onboarding for that pilot needs no SSH/DB scripts for day-to-day ops.
3. Measurable pilot metric: time-to-fill callout (and/or missed posts) vs baseline.
4. Security questionnaire survivable: tenant isolation + MFA + consent + audit export (even CSV).
5. Decision gate: renew / expand security OR start medical compliance track.

------------------------------------------------------------
PHASE A — WEEKS 1–2: CLOSE BETA BLOCKERS
------------------------------------------------------------

Goal: Finish Phase 0–2 so a stranger can run ops without you in the terminal.

A1. Complete beta checklists (ops)
[ ] Re-run BETA_PHASE_0 smoke (/health/ready, dev routes 404, register 403)
[ ] Run BETA_PHASE_1 with 5–10 real guards (not bob@abe.com)
[ ] Run BETA_PHASE_2: callout → rank → notify → accept → pending override
[ ] Confirm contact prefs: create guard with SMS off → callout skips SMS (pref_disabled in logs)

Verify in prod:
- backend/src/services/guardCalloutOutbound.service.js (honors prefs)
- frontend-admin-dashboard/admin-dashboard-frontend/src/pages/Guards.jsx (prefs UI)

A2. Guard password in admin UI (P0 product gap)
Today: node backend/src/scripts/setGuardPassword.js email 'temp'

Build:
[ ] POST /api/admin/guards/:id/set-password (admin JWT, guards:write, temp password or generate + copy once)
[ ] Optional later: POST /api/admin/guards/:id/reset-password email link
[ ] Guards page: “Set password” action next to Edit

Touch these files:
- backend/src/controllers/adminGuards.controller.js
- backend/src/routes/adminGuards.routes.js
- frontend-admin-dashboard/admin-dashboard-frontend/src/pages/Guards.jsx
- frontend-admin-dashboard/admin-dashboard-frontend/src/services/api.js
- Reference: backend/src/scripts/setGuardPassword.js

A3. Play Internal (or MDM) path
[ ] Follow Phase 1 Option B; stop relying only on Drive sideload for the pilot
[ ] Bump versionCode / versionName in frontend-guard-ui/android/app/build.gradle each pilot build
[ ] Keep frontend-guard-ui/scripts/build-beta-apk.sh for hotfix sideloads

A4. Monitoring minimum
[ ] Uptime check on /health/ready (Railway + external ping)
[ ] Alert on cron failures (CRON_SECRET jobs in backend/server.js)
[ ] Optional: Sentry for Guard APK + admin API
Exists: HEALTH.md, /health, /health/ready
Gap: no backup/restore runbook; no status page

------------------------------------------------------------
PHASE B — WEEKS 2–4: COMPANY-SAFE BASELINE
------------------------------------------------------------

Goal: Pass a basic security questionnaire without hand-waving.

B1. Tenant isolation CI
Exists: backend/src/utils/tenantFilter.js, backend/src/scripts/testTenantIsolation.js

Build:
[x] Promote isolation scripts into automated tests (CI on PR) — `.github/workflows/tenant-isolation.yml`
[x] Cover: shift swaps, pending accepts, contact prefs, callout rankings, messages
[x] Fail CI on cross-tenant read/write — `npm run test:tenant-isolation`

Hot paths:
- adminShiftSwap.controller.js
- shiftAcceptPending.service.js
- guardCalloutOutbound.service.js
- guardMessages.routes.js

B2. Unified audit log + CSV export
Exists (fragments):
- Swap approved_by — backend/src/models/ShiftSwap.js
- Command Center actions — CommandCenterAction.js
- Ops feed — OpEvent.js
- Availability logs — availability_logs
- Consent fields — guards.communications_consent, consent_at, consent_source

Build:
[ ] audit_events table (or extend OpEvent with actor, action, entity, before/after)
[ ] Emit on: pending-accept confirm/reject/reassign, swap approve/reject, callout trigger, schedule create/update/delete, guard create/password set, consent change
[ ] Admin UI: Audit page + GET /api/admin/audit/export?from=&to= CSV

Why: client disputes / “who filled that post?”

B3. MFA policy for pilot admins
Exists: backend/src/services/mfa.service.js, AccountSecurity.jsx, login MFA challenge
[x] Require MFA for all admins on pilot tenant — `MFA_REQUIRED` / `MFA_REQUIRED_TENANT_IDS` + API/UI gate
[x] Document setup in onboarding packet — `docs/MFA_ONBOARDING.md`


B4. Legal pack (security SMB)
Exists: backend/public/legal/messaging-consent.html + consent on Guards form
[ ] Privacy policy + Terms of Service (company site or /legal/*)
[ ] MSA + DPA drafts under docs/legal/ (lawyer review before send)
[ ] Twilio/A2P messaging consent ops note (link consent URL in outbound SMS if required)
Missing: DPA, MSA, BAA, full privacy/ToS

B5. Backup / restore drill
[ ] Document Railway Postgres backup + restore in docs/RUNBOOK_BACKUP.md
[ ] Run one restore to a scratch DB; record RPO/RTO targets

------------------------------------------------------------
PHASE C — WEEKS 3–6: LAND AND RUN ONE SECURITY PILOT
------------------------------------------------------------

Goal: White-glove one logo; measure outcomes.

C1. Onboarding productization
- Create tenant — EXISTS (SuperAdmin.jsx, superAdmin.controller.js)
- Create tenant admin — EXISTS (password at create); GAP = invite email + magic link
- Create guards — EXISTS (Guards UI + contact prefs); GAP = bulk CSV import
- Set passwords — GAP (script only → build A2 admin UI)
- Sites — PARTIAL; bulk site import if multi-site pilot
- Week-1 shifts — EXISTS (Schedule UI); optional onboarding wizard later

Build order:
1. Set guard password in UI (A2)
2. POST /api/admin/guards/import CSV (name, email, phone, consent, contact prefs)
3. One-page internal “Pilot day-0 checklist” (this doc + Phase 1)

C2. Sales sandbox / demo tenant
Exists: seedAdmin.js, seedGuardBob.js, seedTestShiftsForGuardUi.js, devSeed.routes.js (prod-disabled)
[ ] docs/DEMO_TENANT.md — scrubbed persona tenant, sample callout script (10 min)
[ ] backend/src/scripts/resetDemoTenant.js (idempotent) for sales demos
[ ] Use Sales_AI_Platform_Value_Summary.md for outreach; demo = live product not slides

C3. Pilot contract + metrics
[ ] 30–60 day pilot MSA (from B4)
[ ] Instrument: callout created → first accept → finalize time
[ ] Sources: callout rows, pending-accept fields on shifts, outboundNotify / logs

C4. Support package for pilot
Missing today: status page, on-call runbook
[ ] docs/RUNBOOK_P0.md — app down, Twilio down, bad ranking, password reset, Railway rollback
[ ] Shared Slack/SMS with pilot ops lead; P0 target e.g. under 1h business hours
[ ] Optional: simple status page (Instatus/Better Stack)

------------------------------------------------------------
PHASE D — WEEKS 6–10: HARDEN FROM PILOT PAIN + PACKAGE TO EXPAND
------------------------------------------------------------

Goal: Fix only what blocks renewal; package for the next security buyer.

D1. Feedback → roadmap filter (ship only if it blocks renewal or sales)
- Geofence / GPS clock → time punch controllers
- Offline clock → Capacitor + sync queue (greenfield)
- Supervisor roles → permissions / requireAccess
- Client weekly PDF → reportExport.service.js, reportBuilder.service.js, Command Center
- Payroll CSV for ADP-like import → abe-guard-ai payroll routes + reportExport (no ADP connector yet)

D2. Reporting pack (client-facing)
Exists: coverage KPI, PDF export, AI briefings (Command Center)
[ ] One “Client weekly coverage” preset (coverage %, late clocks, open posts, OT)
[ ] Export + email to client contact (or download + attach)

D3. Commercial basics
Exists: Tenant plan/limits (Tenant.js, Super Admin / Owner UI, PRICING_STRATEGY.md)
Missing: Stripe, invoices, self-serve upgrade
[ ] Decide: invoice manually for pilot #1–3 OR Stripe Checkout
[ ] Document pricing + pass-through SMS/voice minutes in PRICING_STRATEGY.md

D4. SSO (only if a named deal requires it)
Missing: SAML/OIDC
[ ] Prefer Google/Microsoft OIDC first
[ ] Placeholder area: adminAuth.Controller.js / JWT issuance

------------------------------------------------------------
PHASE E — WEEKS 10–12: CASE STUDY + MEDICAL GATE
------------------------------------------------------------

E1. Case study + references
[ ] One-pager: baseline vs pilot metrics, quote from ops lead
[ ] Ask for reference call
[ ] Update sales email with real numbers

E2. Medical gate — do NOT start unless security renews
Missing in repo today:
- BAA + subprocessor list
- HIPAA mode (disable AI free-text / OpenAI if PHI)
- Retention / deletion APIs
- SOC 2 evidence collection (mention only in UPGRADE_OPTIONS.md)
- Full credential / clearance before assign (reputation/readiness is partial only)

Wedge if you proceed later: facility security / sitter staffing — NOT EMR.
Keep PHI out of callout notes and AI prompts.

------------------------------------------------------------
90-DAY CALENDAR (SUMMARY)
------------------------------------------------------------

Weeks 1–2
Focus: Phase 0–2 green; set-password UI; Play Internal
Exit: tester week without scripts

Weeks 2–4
Focus: Isolation CI; audit CSV; MFA required; legal drafts; backup drill
Exit: questionnaire pack ready

Weeks 3–6
Focus: Demo tenant; land pilot; bulk import; runbooks
Exit: pilot live on prod

Weeks 6–10
Focus: Pilot fixes only; client report preset; pricing decision
Exit: renewal conversation started

Weeks 10–12
Focus: Case study; expand security OR open medical track
Exit: go / no-go medical

------------------------------------------------------------
REPO GAP BACKLOG (CHECK OFF WHEN MERGED)
------------------------------------------------------------

P0 — blocks pilot ops
[ ] 1. Admin set/reset guard password UI + API (adminGuards.*, Guards.jsx; retire day-to-day setGuardPassword.js)
[ ] 2. Play Internal (or MDM) distribution + one published track build
[ ] 3. Pilot runbook docs/RUNBOOK_P0.md + backup docs/RUNBOOK_BACKUP.md
[ ] 4. Verify prod deploy: contact prefs + callout outbound + pending accept + swaps (post-a635590)

P1 — blocks “company-safe” sale
[x] 5. Tenant isolation tests in CI
[x] 6. Unified audit_events + admin CSV export
[x] 7. MFA required for pilot tenant admins
[ ] 8. Privacy / ToS / MSA / DPA drafts under docs/legal/
[ ] 9. Guard CSV import

P2 — accelerates second deal
[ ] 10. Demo tenant reset script + docs/DEMO_TENANT.md
[ ] 11. Client weekly coverage report preset
[ ] 12. Invite-admin email flow
[ ] 13. Manual invoicing playbook or Stripe MVP
[ ] 14. Optional Sentry

P3 — later / deal-triggered
[ ] 15. SSO (OIDC)
[ ] 16. Named payroll export (ADP-shaped CSV)
[ ] 17. iOS TestFlight
[ ] 18. Status page
[ ] 19. HIPAA/BAA/SOC2 program (medical gate)
[ ] 20. Guard self-serve contact prefs in Guard app (admin form exists today)

------------------------------------------------------------
EXPLICIT NON-GOALS (NEXT 90 DAYS)
------------------------------------------------------------

- Broad new AI features before pilot renewal
- Hospital EMR integrations
- Public consumer App Store push before pilot metrics are clean
- Rebuilding multi-backend topology unless onboarding is blocked (prefer one Guard API URL via admin proxy — see Phase 2)

------------------------------------------------------------
WEEKLY OPERATING RHYTHM
------------------------------------------------------------

Mon — Pick top 3 from P0/P1 backlog; ship or unblock
Wed — Pilot / tester bug triage (P0 same day)
Fri — Update this checklist; demo env smoke; metrics snapshot

Owner: product/eng lead.
Sales uses Sales doc + demo tenant only after Phase A exit check is green.
