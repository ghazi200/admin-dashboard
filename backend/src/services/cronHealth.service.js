/**
 * In-memory cron / background-job health for uptime monitors.
 * Survives only while the process is up — enough to detect "jobs not running".
 */

const jobs = new Map();

function touch(name, { ok, error = null, meta = null } = {}) {
  const key = String(name || "unknown");
  const prev = jobs.get(key) || {};
  const now = new Date().toISOString();
  const next = {
    name: key,
    lastAttemptAt: now,
    lastSuccessAt: ok ? now : prev.lastSuccessAt || null,
    lastFailureAt: ok ? prev.lastFailureAt || null : now,
    lastOk: Boolean(ok),
    lastError: ok ? null : String(error || "failed").slice(0, 300),
    meta: meta != null ? meta : prev.meta || null,
    successCount: (prev.successCount || 0) + (ok ? 1 : 0),
    failureCount: (prev.failureCount || 0) + (ok ? 0 : 1),
  };
  jobs.set(key, next);
  return next;
}

function snapshot() {
  const list = Array.from(jobs.values()).sort((a, b) =>
    String(a.name).localeCompare(String(b.name))
  );
  const now = Date.now();
  const staleAfterMs = Math.max(
    5 * 60 * 1000,
    parseInt(process.env.CRON_STALE_AFTER_MS || String(15 * 60 * 1000), 10) ||
      15 * 60 * 1000
  );

  const withStale = list.map((j) => {
    const ref = j.lastSuccessAt || j.lastAttemptAt;
    const ageMs = ref ? now - new Date(ref).getTime() : null;
    const stale = ageMs == null ? true : ageMs > staleAfterMs;
    return { ...j, ageMs, stale };
  });

  const anyFailure = withStale.some((j) => j.lastOk === false);
  const anyStale = withStale.some((j) => j.stale);
  // Only treat as unhealthy if we have seen jobs and they are failing/stale
  const healthy = list.length === 0 ? true : !anyFailure && !anyStale;

  return {
    status: healthy ? "ok" : "degraded",
    staleAfterMs,
    jobs: withStale,
  };
}

module.exports = {
  touch,
  snapshot,
};
