/**
 * Script to sync admin-dashboard to use the same abe-guard database
 * 
 * Usage:
 *   node syncToAbeGuardDatabase.js <DATABASE_URL>
 * 
 * Example:
 *   node syncToAbeGuardDatabase.js "postgresql://user:pass@host:5432/abe-guard"
 * 
 * Or set DATABASE_URL environment variable:
 *   DATABASE_URL="postgresql://..." node syncToAbeGuardDatabase.js
 */

const fs = require('fs');
const path = require('path');

const adminDashboardEnvPath = path.resolve(__dirname, '../../../.env');

async function syncDatabase() {
  console.log('\n🔧 Syncing admin-dashboard to use abe-guard database\n');
  
  // Get DATABASE_URL from command line argument or environment variable
  const args = process.argv.slice(2);
  let databaseUrl = args[0] || process.env.DATABASE_URL;
  
  if (!databaseUrl) {
    console.log('❌ DATABASE_URL not provided\n');
    console.log('Usage:');
    console.log('  node syncToAbeGuardDatabase.js "postgresql://user:pass@host:port/abe-guard"');
    console.log('  OR');
    console.log('  DATABASE_URL="postgresql://..." node syncToAbeGuardDatabase.js\n');
    console.log('Please get the DATABASE_URL from abe-guard-ai/backend/.env\n');
    process.exit(1);
  }
  
  databaseUrl = databaseUrl.trim();
  
  // Validate URL format
  try {
    const url = new URL(databaseUrl);
    const dbName = url.pathname.slice(1);
    
    console.log(`📊 Database URL points to: ${dbName}`);
    
    if (dbName !== 'abe-guard' && !dbName.includes('abe-guard')) {
      console.log(`⚠️  WARNING: Database name is "${dbName}", not "abe-guard"`);
      console.log('   Make sure this is the correct database!\n');
    } else {
      console.log('✅ Database name is correct (abe-guard)\n');
    }
  } catch (error) {
    console.log(`❌ Invalid DATABASE_URL format: ${error.message}`);
    console.log('   Expected format: postgresql://username:password@host:port/database\n');
    process.exit(1);
  }
  
  // Read or create .env file
  let envContent = '';
  if (fs.existsSync(adminDashboardEnvPath)) {
    envContent = fs.readFileSync(adminDashboardEnvPath, 'utf8');
    console.log('✅ Found existing .env file\n');
  } else {
    console.log('⚠️  .env file not found. Will create a new one.\n');
  }
  
  // Update or add DATABASE_URL
  let updated = false;
  if (envContent.includes('DATABASE_URL=')) {
    // Replace existing
    const lines = envContent.split('\n');
    const updatedLines = lines.map(line => {
      if (line.startsWith('DATABASE_URL=')) {
        updated = true;
        return `DATABASE_URL=${databaseUrl}`;
      }
      return line;
    });
    envContent = updatedLines.join('\n');
    
    if (updated) {
      console.log('✅ Updated existing DATABASE_URL in .env file');
    } else {
      console.log('ℹ️  DATABASE_URL already matches');
    }
  } else {
    // Add new
    if (!envContent.endsWith('\n') && envContent.length > 0) {
      envContent += '\n';
    }
    envContent += '\n# DATABASE_URL - Same database as abe-guard-ai (abe-guard)\n';
    envContent += `DATABASE_URL=${databaseUrl}\n`;
    updated = true;
    console.log('✅ Added DATABASE_URL to .env file');
  }
  
  // Write .env file
  if (updated) {
    fs.writeFileSync(adminDashboardEnvPath, envContent, 'utf8');
    console.log('✅ .env file saved successfully\n');
  }
  
  // Verify connection
  console.log('🔍 Verifying database connection...\n');
  try {
    // Reload .env
    delete require.cache[require.resolve('dotenv')];
    require('dotenv').config({ path: adminDashboardEnvPath });
    
    const { sequelize } = require('../models');
    await sequelize.authenticate();
    
    const [dbInfo] = await sequelize.query('SELECT current_database() as db_name');
    const dbName = dbInfo[0]?.db_name;
    
    console.log(`📊 Connected to database: ${dbName}`);
    
    if (dbName === 'abe-guard' || dbName.includes('abe-guard')) {
      console.log('✅ SUCCESS: Connected to abe-guard database!\n');
      
      const [shiftCount] = await sequelize.query('SELECT COUNT(*) as count FROM shifts');
      const count = parseInt(shiftCount[0]?.count || 0);
      console.log(`📋 Shifts in database: ${count}`);
      
      if (count > 0) {
        console.log('✅ Database has shifts data - everything is working!\n');
      } else {
        console.log('ℹ️  Database is empty or shifts table has no data\n');
      }
      
      await sequelize.close();
      console.log('💡 IMPORTANT: Restart the admin-dashboard backend server for changes to take effect.\n');
    } else {
      console.log(`⚠️  Connected to "${dbName}" instead of "abe-guard"`);
      console.log('   Please verify your DATABASE_URL is correct.\n');
      await sequelize.close();
    }
  } catch (error) {
    console.error('❌ Connection failed:', error.message);
    console.error('\n⚠️  Please check:');
    console.error('   1. DATABASE_URL is correct');
    console.error('   2. Database server is running');
    console.error('   3. Database "abe-guard" exists\n');
    process.exit(1);
  }
}

if (require.main === module) {
  syncDatabase().catch(error => {
    console.error('❌ Error:', error);
    process.exit(1);
  });
}

module.exports = { syncDatabase };
