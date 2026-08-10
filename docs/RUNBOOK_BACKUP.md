# Backup & restore runbook (B5)

**Service:** Railway Postgres (shared by admin API + abe-guard-ai)  
**Last restore drill:** 2026-08-09 (logical dump → local scratch DB)  
**Owner:** Platform / on-call admin

---

## Targets (pilot)

| Metric | Target | Notes |
|--------|--------|--------|
| **RPO** (max acceptable data loss) | **≤ 24 hours** | Align with Railway daily volume backups; tighten if PITR enabled |
| **RTO** (max time to recover service) | **≤ 4 hours** | Includes decide → restore → verify → point apps at DB |
| **Offsite logical dump** | Weekly (recommended) | `pg_dump` to encrypted storage outside Railway |

These are **targets for the security pilot**, not contractual SLAs unless written into an MSA.

---

## Layers of protection

### 1. Railway volume backups (primary)

1. Open [Railway Dashboard](https://railway.app) → project → **Postgres** service (not the Node app).  
2. Open the **Backups** tab.  
3. Confirm a **schedule** exists (Daily recommended for pilot).  
4. Optionally create a **manual backup** before risky migrations.

**Restore (volume snapshot):**

1. Backups tab → select snapshot by date → **Restore**.  
2. Review **staged changes** (new volume mounted; previous volume retained unmounted).  
3. Click **Deploy** only after confirming you intend to roll the live DB back.  
4. Redeploy / restart admin + abe-guard-ai if they do not reconnect automatically.  
5. Smoke-test: `/health/ready`, admin login, one guard login, one shift list.

Official guide: [Back Up and Restore Postgres](https://docs.railway.com/guides/postgres-backups-restores)

### 2. Point-in-time recovery (PITR) — enable before you need it

PITR restores to a **timestamp** (e.g. minute before a bad migration), not only snapshot times.

1. Postgres service uses official Railway image **pinned** to a major version (e.g. `postgres-ssl:17`), not `:latest`.  
2. Volume attached.  
3. Account feature flag for PITR if required: https://railway.com/account/feature-flags  
4. Backups tab → **Enable PITR**.  
5. Restore creates a **new** Postgres service (`…-restored-YYYYMMDD-…`); copy data or re-point `DATABASE_URL` carefully.

Docs: [Point-in-Time Recovery](https://docs.railway.com/volumes/point-in-time-recovery)

### 3. Logical dumps (`pg_dump`) — offsite / drills

Use for: migration to another host, verifying restore works, holding a copy outside Railway.

```bash
# From a machine with network access to Railway Postgres proxy
export DATABASE_URL='postgresql://…'   # Railway Postgres → Connect → public URL
pg_dump "$DATABASE_URL" --format=custom --no-owner --no-acl -f abe_guard_$(date +%Y%m%d).dump
```

Restore into an empty database:

```bash
createdb abe_guard_restore_scratch
pg_restore --no-owner --no-acl -d abe_guard_restore_scratch abe_guard_YYYYMMDD.dump
```

Re-runnable helper (local scratch only — never overwrites production):

```bash
cd backend && ./scripts/backup-restore-drill.sh
```

Requires: `DATABASE_URL` in `backend/.env`, local Postgres, `pg_dump` / `pg_restore` on `PATH`.

---

## Incident decision tree

| Situation | Prefer |
|-----------|--------|
| Accidental `DELETE` / bad migration in the last hours | **PITR** to timestamp before incident (if enabled), or latest volume backup |
| Need yesterday’s full DB state | Volume backup restore |
| Moving region / provider / forensic copy | Logical `pg_dump` |
| Entire Railway project deleted | Only offsite logical dumps survive — keep weekly dumps |

**Never** restore a dump over production without a fresh backup and a written go/no-go.

---

## Post-restore checklist

- [ ] `GET /health` and `/health/ready` on admin API  
- [ ] Admin login + list Guards / Shifts  
- [ ] Guard app login (one tester)  
- [ ] Confirm `DATABASE_URL` on **both** Railway services still points at the intended DB  
- [ ] Twilio / cron still healthy (`/health/cron` if used)  
- [ ] Note restore time and any data gap in `#ops` / incident log  

---

## Restore drill record

| Field | Value |
|-------|--------|
| **Date** | 2026-08-09 |
| **Method** | Logical `pg_dump` (custom format) from Railway public proxy → restore into local Postgres scratch DB `abe_guard_restore_drill` |
| **Dump duration** | ~16 seconds |
| **Restore duration** | ~1 second |
| **Total drill time** | ~18 seconds (small pilot dataset; production growth will increase times) |
| **Dump size** | ~128 KB |
| **Verified counts** | tenants=1, Admins=3, guards=3, shifts=5, callouts=20 |
| **Production touched?** | No (read-only dump; restore only to local scratch) |
| **Operator** | Automated agent session / platform |
| **Follow-ups** | Confirm Railway **daily** volume backup schedule on Postgres service; enable **PITR** when plan/image allows; schedule weekly encrypted offsite dump |

### Cleanup after drill

```bash
dropdb -h localhost -U "$USER" abe_guard_restore_drill
rm -f /tmp/abe_guard_restore_drill_*.dump
```

---

## Security notes

- Treat dump files as **production secrets** (PII: names, emails, phones).  
- Do not commit dumps to git. Store offsite dumps encrypted (e.g. age/gpg + restricted bucket).  
- Rotate DB credentials if a dump is leaked.  
- Prefer Railway private networking for app↔DB; use public proxy only for ops dumps from trusted machines.

---

## Questionnaire answers (copy/paste)

- **Backups:** Railway managed Postgres volume backups (scheduled) + optional PITR + periodic logical dumps.  
- **RPO:** 24 hours (pilot target).  
- **RTO:** 4 hours (pilot target).  
- **Last tested restore:** 2026-08-09 — logical restore to scratch DB verified with table counts (see this runbook).
