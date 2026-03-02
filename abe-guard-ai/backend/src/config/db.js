const path = require('path');
const fs = require('fs');

// Load .env from backend directory (backend/.env)
// __dirname is backend/src/config, so ../.. goes to backend/, then .env is at backend/.env
const envPath = path.resolve(__dirname, '../../.env'); // backend/.env
if (fs.existsSync(envPath)) {
  require('dotenv').config({ path: envPath });
} else {
  // Fallback to default dotenv behavior (looks for .env in current working directory)
  require('dotenv').config();
}

const { Sequelize } = require('sequelize');
const { Pool } = require('pg');

// Single database: use same abe_guard as admin-dashboard (DATABASE_URL in this backend's .env
// should point to postgresql://.../abe_guard). No second database is used.
const connectionString = process.env.DATABASE_URL;
const REQUIRED_DB_NAMES = ['abe_guard', 'abe-guard'];

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
    if (!dbName || !REQUIRED_DB_NAMES.includes(dbName)) {
      console.error('❌ ERROR: Wrong database. abe-guard-ai must use abe_guard (same as admin-dashboard).');
      console.error('   Current:', dbName || '(unknown)');
      console.error('   Set DATABASE_URL in abe-guard-ai/backend/.env to postgresql://.../abe_guard');
      process.exit(1);
    }
    console.log('✅ Sequelize connected to', dbName);
  })
  .catch(err => {
    console.error('❌ Sequelize connection error:', err);
    process.exit(1);
  });

module.exports = { pool, sequelize };
