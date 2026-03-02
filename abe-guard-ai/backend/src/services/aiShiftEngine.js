const pool = require('../db');

/**
 * Finds eligible guards for an open shift
 */
async function findEligibleGuards(tenant_id, shift_id) {
  const shiftResult = await pool.query(
    'SELECT shift_date, shift_start, shift_end FROM shifts WHERE id=$1',
    [shift_id]
  );

  const shift = shiftResult.rows[0];

  const guardsResult = await pool.query(`
    SELECT g.*
    FROM guards g
    WHERE g.tenant_id = $1
      AND g.is_active = true
      AND g.weekly_hours < 40
      AND g.id NOT IN (
        SELECT guard_id FROM shifts
        WHERE shift_date = $2
        AND shift_start = $3
        AND guard_id IS NOT NULL
      )
    ORDER BY g.created_at ASC
  `, [
    tenant_id,
    shift.shift_date,
    shift.shift_start
  ]);

  return guardsResult.rows;
}

module.exports = { findEligibleGuards };
