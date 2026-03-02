const pool = require('../db');

async function acceptShift(shift_id, guard_id, tenant_id) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const shiftCheck = await client.query(
      'SELECT status FROM shifts WHERE id=$1 FOR UPDATE',
      [shift_id]
    );

    if (shiftCheck.rows[0].status !== 'OPEN') {
      throw new Error('Shift already taken');
    }

    await client.query(
      `UPDATE shifts
       SET guard_id=$1, status='CLOSED'
       WHERE id=$2`,
      [guard_id, shift_id]
    );

    await client.query(
      `UPDATE guards
       SET weekly_hours = weekly_hours + 8
       WHERE id=$1`,
      [guard_id]
    );

    await client.query(
      `INSERT INTO ai_decisions
       (tenant_id, shift_id, selected_guard_id, decision_reason)
       VALUES ($1,$2,$3,$4)`,
      [tenant_id, shift_id, guard_id, 'First eligible guard accepted']
    );

    await client.query('COMMIT');
    return { success: true };

  } catch (err) {
    await client.query('ROLLBACK');
    return { success: false, error: err.message };
  } finally {
    client.release();
  }
}

module.exports = { acceptShift };
