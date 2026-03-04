/**
 * One-off script: Drop ContactPreferences table so sequelize.sync() can recreate it
 * with guardId as UUID (matching guards.id) and a valid foreign key.
 *
 * Use this when you see: foreign key constraint "ContactPreferences_guardId_fkey" cannot be implemented
 *
 * Run from project root: npm run drop-contact-preferences --prefix backend
 * Or from backend dir:  npm run drop-contact-preferences   or   node scripts/drop-contact-preferences-table.js
 * Requires: DATABASE_URL or DB_* in backend/.env (or env)
 */

const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const { sequelize } = require("../src/models");

async function main() {
  const tableName = "ContactPreferences";
  try {
    await sequelize.authenticate();
    await sequelize.query(`DROP TABLE IF EXISTS "${tableName}" CASCADE;`);
    console.log(`✅ Dropped table "${tableName}" (if it existed). Next server start will recreate it with guardId UUID (no FK).`);
  } catch (err) {
    console.error("❌ Error:", err.message);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

main();
