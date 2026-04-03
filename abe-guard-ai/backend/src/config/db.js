require("../loadEnv");

const { Sequelize } = require('sequelize');
const { Pool } = require('pg');

// Single database: prefer same DB as admin-dashboard (abe_guard). Railway Postgres often uses
// database name "postgres" — excluding it caused process.exit before listen → Railway 502.
const connectionString = process.env.DATABASE_URL;
const REQUIRED_DB_NAMES = ["abe_guard", "abe-guard", "railway", "postgres"];

function isAllowedDb(name) {
  if (!name) return false;
  if (String(process.env.SKIP_DB_NAME_CHECK).toLowerCase() === "true") return true;
  const n = String(name).trim();
  const lower = n.toLowerCase();
  if (REQUIRED_DB_NAMES.includes(n) || lower === "railway" || lower === "postgres") return true;
  const extra = process.env.EXTRA_ALLOWED_DB_NAMES;
  if (extra) {
    const allowed = extra.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
    if (allowed.includes(lower)) return true;
  }
  return false;
}

/* ------------------ PostgreSQL Native Pool ------------------ */
const pool = new Pool({
  connectionString,
});

pool.connect()
  .then(() => console.log('✅ PostgreSQL pool connected'))
  .catch(err => console.error('❌ PostgreSQL pool connection error:', err));

/* ------------------ Sequelize ORM ------------------ */
const sequelize = new Sequelize(connectionString, {
  dialect: 'postgres',
  logging: false,
});

sequelize.authenticate()
  .then(async () => {
    const [rows] = await sequelize.query("SELECT current_database() AS db_name").catch(() => [[{ db_name: null }]]);
    const dbName = rows?.[0]?.db_name;
    if (!dbName || !isAllowedDb(dbName)) {
      console.error("❌ ERROR: Database name not in allowlist. abe-guard-ai expects abe_guard / railway / postgres (or set EXTRA_ALLOWED_DB_NAMES).");
      console.error("   Current:", dbName || "(unknown)");
      console.error("   Set DATABASE_URL to postgresql://.../abe_guard (or SKIP_DB_NAME_CHECK=true for emergency only).");
      process.exit(1);
    }
    console.log('✅ Sequelize connected to', dbName);
  })
  .catch(err => {
    console.error('❌ Sequelize connection error:', err);
    process.exit(1);
  });

module.exports = { pool, sequelize };
