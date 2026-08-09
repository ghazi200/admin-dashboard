#!/usr/bin/env bash
# Local / ops uptime probe for A4 monitoring.
# Usage:
#   ./backend/scripts/check-prod-health.sh
#   ADMIN_BASE=https://your-admin.up.railway.app ./backend/scripts/check-prod-health.sh
set -euo pipefail

ADMIN_BASE="${ADMIN_BASE:-https://admin-dashboard-production-2596.up.railway.app}"
ADMIN_BASE="${ADMIN_BASE%/}"

fail=0

check() {
  local path="$1"
  local expect="${2:-200}"
  local url="$ADMIN_BASE$path"
  local code
  code=$(curl -sS -o /tmp/abe-health.json -w "%{http_code}" --max-time 20 "$url" || echo "000")
  echo "==> $url → HTTP $code (expect $expect)"
  cat /tmp/abe-health.json 2>/dev/null || true
  echo ""
  if [ "$code" != "$expect" ]; then
    echo "FAIL: expected HTTP $expect"
    fail=1
  fi
}

check /health 200
check /health/ready 200
# cron may be 200 (ok/empty) — 503 is fail
code=$(curl -sS -o /tmp/abe-cron.json -w "%{http_code}" --max-time 20 "$ADMIN_BASE/health/cron" || echo "000")
echo "==> $ADMIN_BASE/health/cron → HTTP $code"
cat /tmp/abe-cron.json 2>/dev/null || true
echo ""
if [ "$code" = "503" ]; then
  echo "FAIL: cron health degraded"
  fail=1
elif [ "$code" != "200" ]; then
  echo "WARN: /health/cron not available yet (HTTP $code) — deploy latest backend"
fi

if [ "$fail" -ne 0 ]; then
  exit 1
fi
echo "OK: production health checks passed"
