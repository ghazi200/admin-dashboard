#!/usr/bin/env bash
# Mac: open psql using the same DATABASE_URL as admin + abe-guard-ai (one shared Postgres).
#
# Usage:
#   ./scripts/mac-db-psql.sh
#   ./scripts/mac-db-psql.sh -c "SELECT 1"
#
# Reads DATABASE_URL from (first hit):
#   1) Environment variable DATABASE_URL — only if it looks like postgresql://... (otherwise ignored so a bad export does not win over .env)
#   2) backend/.env
#   3) abe-guard-ai/backend/.env
#
# Requires: psql (brew install libpq && brew link --force libpq)

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

read_database_url() {
  python3 <<'PY'
import os, pathlib

def from_file(p):
    if not p.is_file():
        return None
    for raw in p.read_text(encoding="utf-8", errors="replace").splitlines():
        line = raw.split("#", 1)[0].strip()
        if not line.startswith("DATABASE_URL="):
            continue
        v = line[len("DATABASE_URL=") :].strip()
        if (v.startswith('"') and v.endswith('"')) or (v.startswith("'") and v.endswith("'")):
            v = v[1:-1]
        return v.strip() or None
    return None

root = pathlib.Path(os.environ["REPO_ROOT"])
for rel in ("backend/.env", "abe-guard-ai/backend/.env"):
    u = from_file(root / rel)
    if u:
        print(u)
        raise SystemExit(0)
raise SystemExit(1)
PY
}

is_valid_postgres_url() {
  [[ -n "${1:-}" ]] && [[ "${1}" =~ ^postgres(ql)?:// ]]
}

if ! is_valid_postgres_url "${DATABASE_URL:-}"; then
  if [[ -n "${DATABASE_URL:-}" ]]; then
    echo "mac-db-psql: ignoring invalid DATABASE_URL (expected postgresql://...). Reading backend/.env instead." >&2
  fi
  export REPO_ROOT="$ROOT"
  DATABASE_URL="$(read_database_url)" || {
    echo "Could not find DATABASE_URL. Add postgresql://... to backend/.env or run: export DATABASE_URL='postgresql://...'"
    exit 1
  }
  export DATABASE_URL
fi

exec psql "$DATABASE_URL" "$@"
