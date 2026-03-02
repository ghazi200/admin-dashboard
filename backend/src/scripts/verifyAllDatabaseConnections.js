/**
 * Script to verify all database connections are using the correct abe_guard database
 */

const path = require('path');
const fs = require('fs');
const { Sequelize } = require('sequelize');
const { Pool } = require('pg');

async function verifyConnections() {
  console.log('\n🔍 Verifying all database connections...\n');

  // 1. Check .env file
  const envPath = path.resolve(__dirname, '../../.env');
  console.log('1. Checking .env file:');
  console.log(`   Path: ${envPath}`);
  console.log(`   Exists: ${fs.existsSync(envPath) ? '✅' : '❌'}`);
  
  let databaseUrl = null;
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    const match = envContent.match(/^DATABASE_URL=(.+)$/m);
    if (match) {
      databaseUrl = match[1].trim();
      const url = new URL(databaseUrl);
      console.log(`   DATABASE_URL: ✅ Set`);
      console.log(`   Database: ${url.pathname.slice(1)}`);
      if (url.pathname.slice(1) === 'abe_guard') {
        console.log(`   ✅ CORRECT DATABASE (abe_guard)\n`);
      } else {
        console.log(`   ⚠️  WRONG DATABASE (should be abe_guard)\n`);
      }
    } else {
      console.log(`   DATABASE_URL: ❌ Not found\n`);
    }
  } else {
    console.log(`   ❌ .env file not found\n`);
  }

  // 2. Test models/index.js connection
  console.log('2. Testing models/index.js connection:');
  try {
    // Load .env first
    if (fs.existsSync(envPath)) {
      require('dotenv').config({ path: envPath });
    }
    
    const { sequelize } = require('../models');
    await sequelize.authenticate();
    const [dbInfo] = await sequelize.query('SELECT current_database() as db_name');
    const dbName = dbInfo[0]?.db_name;
    console.log(`   Connected to: ${dbName}`);
    if (dbName === 'abe_guard') {
      console.log(`   ✅ CORRECT DATABASE\n`);
    } else {
      console.log(`   ⚠️  WRONG DATABASE (should be abe_guard)\n`);
    }
    await sequelize.close();
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}\n`);
  }

  // 3. Test src/config/db.js connection
  console.log('3. Testing src/config/db.js connection:');
  try {
    // Reload .env
    delete require.cache[require.resolve('dotenv')];
    if (fs.existsSync(envPath)) {
      require('dotenv').config({ path: envPath });
    }
    
    const { sequelize } = require('../config/db');
    await sequelize.authenticate();
    const [dbInfo] = await sequelize.query('SELECT current_database() as db_name');
    const dbName = dbInfo[0]?.db_name;
    console.log(`   Connected to: ${dbName}`);
    if (dbName === 'abe_guard') {
      console.log(`   ✅ CORRECT DATABASE\n`);
    } else {
      console.log(`   ⚠️  WRONG DATABASE (should be abe_guard)\n`);
    }
    await sequelize.close();
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}\n`);
  }

  // 4. Test direct Pool connection
  console.log('4. Testing direct Pool connection:');
  if (databaseUrl) {
    try {
      const pool = new Pool({ connectionString: databaseUrl });
      const result = await pool.query('SELECT current_database() as db_name');
      const dbName = result.rows[0]?.db_name;
      console.log(`   Connected to: ${dbName}`);
      if (dbName === 'abe_guard') {
        console.log(`   ✅ CORRECT DATABASE\n`);
      } else {
        console.log(`   ⚠️  WRONG DATABASE (should be abe_guard)\n`);
      }
      await pool.end();
    } catch (error) {
      console.log(`   ❌ Error: ${error.message}\n`);
    }
  } else {
    console.log(`   ⚠️  Skipped (no DATABASE_URL)\n`);
  }

  console.log('💡 Summary:');
  console.log('   - All connections should point to: abe_guard');
  console.log('   - If any show "ghaziabdullah", that connection needs to be fixed');
  console.log('   - Restart the backend server after fixing connections\n');
}

if (require.main === module) {
  verifyConnections().catch(error => {
    console.error('❌ Error:', error);
    process.exit(1);
  });
}

module.exports = { verifyConnections };
