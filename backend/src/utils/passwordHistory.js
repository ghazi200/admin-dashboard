/**
 * Password history for reuse check (last N passwords per admin).
 * Table: admin_password_history (admin_id, password_hash, created_at)
 */

const HISTORY_LIMIT = 5;

/**
 * Add a password hash to history and prune to last N.
 * @param {Object} sequelize - Sequelize instance
 * @param {string|number} adminId - Admin primary key
 * @param {string} passwordHash - Bcrypt hash
 */
async function addToHistory(sequelize, adminId, passwordHash) {
  if (!sequelize || adminId == null) return;
  try {
    await sequelize.query(
      `INSERT INTO admin_password_history (admin_id, password_hash, created_at) VALUES (:adminId, :hash, CURRENT_TIMESTAMP)`,
      { replacements: { adminId, hash: passwordHash } }
    );
    const [rows] = await sequelize.query(
      `SELECT id FROM admin_password_history WHERE admin_id = :adminId ORDER BY created_at DESC`,
      { replacements: { adminId } }
    );
    const ids = (rows || []).map((r) => r.id);
    if (ids.length > HISTORY_LIMIT) {
      const toDelete = ids.slice(HISTORY_LIMIT);
      for (const id of toDelete) {
        await sequelize.query(`DELETE FROM admin_password_history WHERE id = :id`, {
          replacements: { id },
        });
      }
    }
  } catch (e) {
    console.warn("passwordHistory.addToHistory:", e.message);
  }
}

/**
 * Check if plain password matches current hash or any history hash.
 * @param {Object} sequelize - Sequelize instance
 * @param {string|number} adminId - Admin primary key
 * @param {string} plainPassword - Plain password
 * @param {string} currentHash - Current password hash from Admin
 * @param {Function} bcryptCompare - bcrypt.compare
 * @returns {Promise<boolean>} true if password was reused
 */
async function isPasswordReused(sequelize, adminId, plainPassword, currentHash, bcryptCompare) {
  const matchCurrent = await bcryptCompare(plainPassword, currentHash);
  if (matchCurrent) return true;
  try {
    const [rows] = await sequelize.query(
      `SELECT password_hash FROM admin_password_history WHERE admin_id = :adminId ORDER BY created_at DESC`,
      { replacements: { adminId } }
    );
    for (const row of rows || []) {
      const match = await bcryptCompare(plainPassword, row.password_hash);
      if (match) return true;
    }
  } catch (e) {
    console.warn("passwordHistory.isPasswordReused:", e.message);
  }
  return false;
}

module.exports = { addToHistory, isPasswordReused, HISTORY_LIMIT };
