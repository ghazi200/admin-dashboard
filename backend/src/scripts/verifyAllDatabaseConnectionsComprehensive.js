/**
 * Comprehensive Database Connection Verification
 *
 * Verifies database connections for BOTH backends use abe_guard:
 * - backend/.env (admin-dashboard) and its connections
 * - abe-guard-ai/backend/.env (guard backend) and its connection
 * Fails if any point to WRONG_DB_NAMES (e.g. ghaziabdullah).
 */

const path = require('path');
const fs = require('fs');
const { Sequelize } = require('sequelize');
const { Pool } = require('pg');

const CORRECT_DB_NAMES = ['abe_guard', 'abe-guard'];
const WRONG_DB_NAMES = ['ghaziabdullah'];

async function verifyConnection(name, getConnection, getDbName) {
  try {
    const connection = await getConnection();
    const dbName = await getDbName(connection);
    
    if (CORRECT_DB_NAMES.includes(dbName)) {
      console.log(`   ✅ ${name}: Connected to CORRECT database (${dbName})`);
      return true;
    } else if (WRONG_DB_NAMES.includes(dbName)) {
      console.log(`   ❌ ${name}: Connected to WRONG database (${dbName})`);
      return false;
    } else {
      console.log(`   ⚠️  ${name}: Connected to ${dbName} (verify if correct)`);
      return null;
    }
  } catch (error) {
    console.log(`   ❌ ${name}: Error - ${error.message}`);
    return false;
  }
}

async function main() {
  console.log('\n🔍 Comprehensive Database Connection Verification\n');
  console.log('Checking all database connections to ensure they use abe_guard...\n');

  const envPath = path.resolve(__dirname, '../../.env');
  let issues = [];
  let correct = 0;
  let wrong = 0;

  // 1. Check backend/.env (admin-dashboard)
  console.log('1. Checking backend/.env (admin-dashboard):');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    
    // Check DATABASE_URL
    const dbUrlMatch = envContent.match(/^DATABASE_URL=(.+)$/m);
    if (dbUrlMatch) {
      const dbUrl = dbUrlMatch[1].trim();
      try {
        const url = new URL(dbUrl);
        const dbName = url.pathname.slice(1);
        if (CORRECT_DB_NAMES.includes(dbName)) {
          console.log(`   ✅ DATABASE_URL points to correct database: ${dbName}`);
          correct++;
        } else if (WRONG_DB_NAMES.includes(dbName)) {
          console.log(`   ❌ DATABASE_URL points to WRONG database: ${dbName}`);
          issues.push('DATABASE_URL in .env points to wrong database');
          wrong++;
        } else {
          console.log(`   ⚠️  DATABASE_URL points to: ${dbName} (verify if correct)`);
        }
      } catch (e) {
        console.log(`   ⚠️  Could not parse DATABASE_URL`);
      }
    } else {
      console.log(`   ❌ DATABASE_URL not found in .env`);
      issues.push('DATABASE_URL missing from .env');
    }

    // Check DB_NAME
    const dbNameMatch = envContent.match(/^DB_NAME=(.+)$/m);
    if (dbNameMatch) {
      const dbName = dbNameMatch[1].trim();
      if (CORRECT_DB_NAMES.includes(dbName)) {
        console.log(`   ✅ DB_NAME is correct: ${dbName}`);
      } else if (WRONG_DB_NAMES.includes(dbName)) {
        console.log(`   ❌ DB_NAME is WRONG: ${dbName} (should be abe_guard)`);
        issues.push(`DB_NAME in .env is set to ${dbName} instead of abe_guard`);
        wrong++;
      } else {
        console.log(`   ⚠️  DB_NAME is: ${dbName} (verify if correct)`);
      }
    }
  } else {
    console.log(`   ❌ .env file not found at: ${envPath}`);
    issues.push('.env file not found');
  }

  console.log('');

  // 2. Test models/index.js connection
  console.log('2. Testing models/index.js connection:');
  try {
    delete require.cache[require.resolve('../models')];
    delete require.cache[require.resolve('dotenv')];
    require('dotenv').config({ path: envPath, override: true });
    
    const { sequelize } = require('../models');
    const isCorrect = await verifyConnection(
      'models/index.js',
      () => sequelize.authenticate().then(() => sequelize),
      async (seq) => {
        const [result] = await seq.query('SELECT current_database() as db_name');
        return result[0].db_name;
      }
    );
    
    if (isCorrect) correct++;
    else if (isCorrect === false) wrong++;
    
    await sequelize.close();
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
    issues.push(`models/index.js connection error: ${error.message}`);
  }

  console.log('');

  // 3. Test config/db.js connection
  console.log('3. Testing config/db.js connection:');
  try {
    delete require.cache[require.resolve('../config/db')];
    delete require.cache[require.resolve('dotenv')];
    require('dotenv').config({ path: envPath, override: true });
    
    const { sequelize } = require('../config/db');
    const isCorrect = await verifyConnection(
      'config/db.js',
      () => sequelize.authenticate().then(() => sequelize),
      async (seq) => {
        const [result] = await seq.query('SELECT current_database() as db_name');
        return result[0].db_name;
      }
    );
    
    if (isCorrect) correct++;
    else if (isCorrect === false) wrong++;
    
    await sequelize.close();
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
    issues.push(`config/db.js connection error: ${error.message}`);
  }

  console.log('');

  // 4. Test direct DATABASE_URL connection
  console.log('4. Testing direct DATABASE_URL connection:');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    const match = envContent.match(/^DATABASE_URL=(.+)$/m);
    if (match) {
      const databaseUrl = match[1].trim();
      try {
        const sequelize = new Sequelize(databaseUrl, {
          dialect: 'postgres',
          logging: false,
        });
        
        const isCorrect = await verifyConnection(
          'Direct DATABASE_URL',
          () => sequelize.authenticate().then(() => sequelize),
          async (seq) => {
            const [result] = await seq.query('SELECT current_database() as db_name');
            return result[0].db_name;
          }
        );
        
        if (isCorrect) correct++;
        else if (isCorrect === false) wrong++;
        
        await sequelize.close();
      } catch (error) {
        console.log(`   ❌ Error: ${error.message}`);
        issues.push(`Direct DATABASE_URL connection error: ${error.message}`);
      }
    }
  }

  console.log('');

  // 5. Check abe-guard-ai/backend/.env and its connection
  const abeGuardEnvPath = path.resolve(__dirname, '../../../abe-guard-ai/backend/.env');
  console.log('5. Checking abe-guard-ai/backend/.env:');
  if (fs.existsSync(abeGuardEnvPath)) {
    const envContent = fs.readFileSync(abeGuardEnvPath, 'utf8');

    const dbUrlMatch = envContent.match(/^DATABASE_URL=(.+)$/m);
    if (dbUrlMatch) {
      const dbUrl = dbUrlMatch[1].trim();
      try {
        const url = new URL(dbUrl);
        const dbNameFromUrl = url.pathname.replace(/^\//, '').split('?')[0];
        if (CORRECT_DB_NAMES.includes(dbNameFromUrl)) {
          console.log(`   ✅ DATABASE_URL points to correct database: ${dbNameFromUrl}`);
          correct++;
        } else if (WRONG_DB_NAMES.includes(dbNameFromUrl)) {
          console.log(`   ❌ DATABASE_URL points to WRONG database: ${dbNameFromUrl}`);
          issues.push('DATABASE_URL in abe-guard-ai/backend/.env points to wrong database');
          wrong++;
        } else {
          console.log(`   ⚠️  DATABASE_URL points to: ${dbNameFromUrl} (verify if correct)`);
        }

        // Test actual connection
        const sequelize = new Sequelize(dbUrl, { dialect: 'postgres', logging: false });
        const isCorrect = await verifyConnection(
          'abe-guard-ai DATABASE_URL (live connection)',
          () => sequelize.authenticate().then(() => sequelize),
          async (seq) => {
            const [result] = await seq.query('SELECT current_database() as db_name');
            return result[0].db_name;
          }
        );
        if (isCorrect) correct++;
        else if (isCorrect === false) wrong++;
        await sequelize.close();
      } catch (e) {
        console.log(`   ❌ Could not parse or connect via DATABASE_URL: ${e.message}`);
        issues.push(`abe-guard-ai/backend/.env DATABASE_URL: ${e.message}`);
      }
    } else {
      console.log(`   ❌ DATABASE_URL not found in abe-guard-ai/backend/.env`);
      issues.push('DATABASE_URL missing from abe-guard-ai/backend/.env');
    }

    const dbNameMatch = envContent.match(/^DB_NAME=(.+)$/m);
    if (dbNameMatch) {
      const dbName = dbNameMatch[1].trim();
      if (CORRECT_DB_NAMES.includes(dbName)) {
        console.log(`   ✅ DB_NAME is correct: ${dbName}`);
      } else if (WRONG_DB_NAMES.includes(dbName)) {
        console.log(`   ❌ DB_NAME is WRONG: ${dbName} (should be abe_guard)`);
        issues.push(`DB_NAME in abe-guard-ai/backend/.env is set to ${dbName} instead of abe_guard`);
        wrong++;
      } else {
        console.log(`   ⚠️  DB_NAME is: ${dbName} (verify if correct)`);
      }
    }
  } else {
    console.log(`   ⚠️  .env not found at: ${abeGuardEnvPath}`);
    console.log('   (Optional if guard backend is in another repo or not used.)');
  }

  console.log('');

  // Summary
  console.log('═══════════════════════════════════════════════════════');
  console.log('📊 SUMMARY:');
  console.log(`   ✅ Correct connections: ${correct}`);
  console.log(`   ❌ Wrong connections: ${wrong}`);
  console.log(`   ⚠️  Issues found: ${issues.length}`);
  console.log('═══════════════════════════════════════════════════════\n');

  if (issues.length > 0) {
    console.log('❌ ISSUES FOUND:\n');
    issues.forEach((issue, i) => {
      console.log(`   ${i + 1}. ${issue}`);
    });
    console.log('\n⚠️  Please fix these issues before continuing.\n');
    process.exit(1);
  } else if (wrong > 0) {
    console.log('❌ Some connections are using the wrong database!\n');
    process.exit(1);
  } else {
    console.log('✅ All database connections are using the correct database (abe_guard)!\n');
    process.exit(0);
  }
}

main().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
