#!/usr/bin/env bash
# B5 — Logical dump of DATABASE_URL → restore into local scratch DB (never production).
# Usage: cd backend && ./scripts/backup-restore-drill.sh
set -euo pipefail

export PATH="/Applications/Postgres.app/Contents/Versions/latest/bin:/usr/local/bin:/opt/homebrew/bin:$PATH"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if ! command -v pg_dump >/dev/null || ! command -v pg_restore >/dev/null; then
  echo "pg_dump/pg_restore not found. Install Postgres client tools."
  exit 1
fi

eval "$(node -e "
require('dotenv').config({ path: require('path').join('$ROOT', '.env') });
const u = process.env.DATABASE_URL;
if (!u) { console.error('DATABASE_URL missing in backend/.env'); process.exit(2); }
console.log('export DATABASE_URL=' + JSON.stringify(u));
")"

LOCAL_HOST="${PGHOST:-localhost}"
LOCAL_USER="${PGUSER:-$(whoami)}"
SCRATCH_DB="${SCRATCH_DB:-abe_guard_restore_drill}"
DUMP="${DUMP_PATH:-/tmp/abe_guard_restore_drill_$(date +%Y%m%d_%H%M%S).dump}"

echo "→ Dumping Railway/source DB (read-only)…"
T0=$(date +%s)
pg_dump "$DATABASE_URL" --format=custom --no-owner --no-acl -f "$DUMP"
T1=$(date +%s)
echo "  dump: $((T1 - T0))s  size: $(du -h "$DUMP" | awk '{print $1}')  file: $DUMP"

echo "→ Recreating local scratch DB: $SCRATCH_DB"
dropdb --if-exists -h "$LOCAL_HOST" -U "$LOCAL_USER" "$SCRATCH_DB" 2>/dev/null || true
createdb -h "$LOCAL_HOST" -U "$LOCAL_USER" "$SCRATCH_DB"

echo "→ Restoring into scratch…"
T2=$(date +%s)
set +e
pg_restore --no-owner --no-acl -h "$LOCAL_HOST" -U "$LOCAL_USER" -d "$SCRATCH_DB" "$DUMP"
RC=$?
set -e
T3=$(date +%s)
echo "  restore: $((T3 - T2))s (pg_restore exit=$RC; non-zero may be warnings)"

echo "→ Spot-check counts:"
psql -h "$LOCAL_HOST" -U "$LOCAL_USER" -d "$SCRATCH_DB" -c "
SELECT 'guards' AS tbl, COUNT(*)::text AS n FROM guards
UNION ALL SELECT 'shifts', COUNT(*)::text FROM shifts
UNION ALL SELECT 'Admins', COUNT(*)::text FROM \"Admins\"
UNION ALL SELECT 'tenants', COUNT(*)::text FROM tenants
ORDER BY 1;
"

echo ""
echo "Drill OK. Total ~$(( $(date +%s) - T0 ))s"
echo "Cleanup: dropdb -h $LOCAL_HOST -U $LOCAL_USER $SCRATCH_DB; rm -f \"$DUMP\""
