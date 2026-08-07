/**
 * Shared pending-accept helpers for abe-guard-ai (raw SQL; same DB as admin).
 */
function overrideWindowMs() {
  const mins = Number(process.env.ACCEPT_OVERRIDE_MINUTES || 7);
  const clamped = Number.isFinite(mins) ? Math.min(30, Math.max(5, mins)) : 7;
  return clamped * 60 * 1000;
}

function overrideWindowMinutes() {
  return Math.round(overrideWindowMs() / 60000);
}

async function beginPendingAcceptSql(poolOrQuery, { shiftId, guardId, source }) {
  const until = new Date(Date.now() + overrideWindowMs());
  const sql = `
    UPDATE shifts
    SET pending_guard_id = $1::uuid,
        accept_pending_until = $2::timestamptz,
        accepted_at = NOW(),
        accept_source = $3
    WHERE id = $4::uuid
      AND UPPER(TRIM(status::text)) = 'OPEN'
      AND guard_id IS NULL
      AND pending_guard_id IS NULL
    RETURNING *
  `;
  const params = [guardId, until.toISOString(), String(source || "accept").slice(0, 64), shiftId];

  // node-pg pool
  if (typeof poolOrQuery.query === "function" && poolOrQuery.connect) {
    const r = await poolOrQuery.query(sql, params);
    return { row: r.rows?.[0] || null, pendingUntil: until.toISOString() };
  }
  // sequelize.query
  const [rows] = await poolOrQuery.query(sql, { bind: params });
  return { row: rows?.[0] || null, pendingUntil: until.toISOString() };
}

module.exports = {
  beginPendingAcceptSql,
  overrideWindowMinutes,
  overrideWindowMs,
};
