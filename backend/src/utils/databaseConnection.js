/**
 * Database Connection Utility
 * 
 * Ensures all scripts use the correct database connection (abe_guard)
 * and verifies the connection before use
 */

const path = require('path');
const fs = require('fs');
const { Sequelize } = require('sequelize');
const { Pool } = require('pg');

const CORRECT_DB_NAMES = ['abe_guard', 'abe-guard'];
const WRONG_DB_NAMES = ['ghaziabdullah'];

/**
 * Get DATABASE_URL from .env file (reads directly to avoid caching issues)
 */
function getDatabaseUrl() {
  const envPath = path.resolve(__dirname, '../../.env');
  
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    const match = envContent.match(/^DATABASE_URL=(.+)$/m);
    if (match) {
      return match[1].trim();
    }
  }
  
  // Fallback to process.env (but warn if not found)
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }
  
  throw new Error('DATABASE_URL not found in .env file');
}

/**
 * Verify database connection is using correct database
 */
async function verifyDatabase(sequelize) {
  try {
    const [result] = await sequelize.query('SELECT current_database() as db_name');
    const dbName = result[0].db_name;
    
    if (CORRECT_DB_NAMES.includes(dbName)) {
      return { valid: true, dbName };
    } else if (WRONG_DB_NAMES.includes(dbName)) {
      return { valid: false, dbName, error: `Connected to wrong database: ${dbName} (should be abe_guard)` };
    } else {
      return { valid: null, dbName, warning: `Connected to ${dbName} (verify if correct)` };
    }
  } catch (error) {
    return { valid: false, error: error.message };
  }
}

/**
 * Create Sequelize connection with verification
 */
async function createSequelizeConnection(options = {}) {
  const databaseUrl = getDatabaseUrl();
  
  const sequelize = new Sequelize(databaseUrl, {
    dialect: 'postgres',
    logging: options.logging !== undefined ? options.logging : false,
    ...options,
  });
  
  await sequelize.authenticate();
  
  // Verify it's the correct database
  const verification = await verifyDatabase(sequelize);
  
  if (verification.valid === false) {
    await sequelize.close();
    throw new Error(verification.error || `Wrong database: ${verification.dbName}`);
  }
  
  if (verification.warning) {
    console.warn(`⚠️  ${verification.warning}`);
  }
  
  return sequelize;
}

/**
 * Create Pool connection with verification
 */
async function createPoolConnection() {
  const databaseUrl = getDatabaseUrl();
  
  const pool = new Pool({
    connectionString: databaseUrl,
  });
  
  // Verify it's the correct database
  const result = await pool.query('SELECT current_database() as db_name');
  const dbName = result.rows[0].db_name;
  
  if (CORRECT_DB_NAMES.includes(dbName)) {
    return pool;
  } else if (WRONG_DB_NAMES.includes(dbName)) {
    await pool.end();
    throw new Error(`Wrong database: ${dbName} (should be abe_guard)`);
  } else {
    console.warn(`⚠️  Connected to ${dbName} (verify if correct)`);
    return pool;
  }
}

module.exports = {
  getDatabaseUrl,
  verifyDatabase,
  createSequelizeConnection,
  createPoolConnection,
  CORRECT_DB_NAMES,
  WRONG_DB_NAMES,
};
