/**
 * Script to set up admin-dashboard to use the same abe-guard database
 * This script will:
 * 1. Check current database connection
 * 2. Guide you to add DATABASE_URL to .env
 * 3. Verify the connection to abe-guard database
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const adminDashboardEnvPath = path.resolve(__dirname, '../../../.env');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function askQuestion(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

async function main() {
  console.log('\n🔧 Setting up admin-dashboard to use abe-guard database\n');
  
  // Step 1: Check current connection
  console.log('Step 1: Checking current database connection...\n');
  try {
    require('dotenv').config({ path: adminDashboardEnvPath });
    const { sequelize } = require('../models');
    
    await sequelize.authenticate();
    const [dbInfo] = await sequelize.query('SELECT current_database() as db_name');
    const currentDb = dbInfo[0]?.db_name;
    
    console.log(`📊 Currently connected to: ${currentDb}`);
    
    if (currentDb === 'abe-guard' || currentDb.includes('abe-guard')) {
      console.log('✅ Already connected to abe-guard database!\n');
      
      const [shiftCount] = await sequelize.query('SELECT COUNT(*) as count FROM shifts');
      const count = parseInt(shiftCount[0]?.count || 0);
      console.log(`📋 Shifts in database: ${count}`);
      
      await sequelize.close();
      process.exit(0);
    } else {
      console.log(`⚠️  Currently connected to "${currentDb}" (not abe-guard)\n`);
      await sequelize.close();
    }
  } catch (error) {
    console.log('⚠️  Could not connect to database or .env not configured\n');
  }
  
  // Step 2: Check if DATABASE_URL exists in .env
  console.log('Step 2: Checking .env file...\n');
  let envContent = '';
  let hasDatabaseUrl = false;
  
  if (fs.existsSync(adminDashboardEnvPath)) {
    envContent = fs.readFileSync(adminDashboardEnvPath, 'utf8');
    hasDatabaseUrl = envContent.includes('DATABASE_URL=');
    
    if (hasDatabaseUrl) {
      const match = envContent.match(/^DATABASE_URL=(.+)$/m);
      if (match) {
        const url = match[1].trim();
        try {
          const urlObj = new URL(url);
          const dbName = urlObj.pathname.slice(1);
          urlObj.password = '***';
          console.log(`✅ DATABASE_URL found: ${urlObj.toString()}`);
          console.log(`   Database: ${dbName}\n`);
          
          if (dbName !== 'abe-guard' && !dbName.includes('abe-guard')) {
            console.log('⚠️  DATABASE_URL points to wrong database!');
            console.log(`   Current: ${dbName}`);
            console.log(`   Should be: abe-guard\n`);
            
            const update = await askQuestion('Update DATABASE_URL to point to abe-guard? (y/n): ');
            if (update.toLowerCase() === 'y') {
              hasDatabaseUrl = false; // Will prompt for new URL
            } else {
              console.log('\n⚠️  Keeping current DATABASE_URL. Please update manually if needed.\n');
              rl.close();
              process.exit(0);
            }
          } else {
            console.log('✅ DATABASE_URL is correctly set to abe-guard database!\n');
            console.log('💡 If connection still fails, restart the admin-dashboard backend server.\n');
            rl.close();
            process.exit(0);
          }
        } catch (e) {
          console.log(`   DATABASE_URL: ${url.substring(0, 50)}...\n`);
        }
      }
    } else {
      console.log('❌ DATABASE_URL not found in .env file\n');
    }
  } else {
    console.log('⚠️  .env file not found. Will create a new one.\n');
  }
  
  // Step 3: Get DATABASE_URL from user or abe-guard-ai
  if (!hasDatabaseUrl) {
    console.log('Step 3: Setting up DATABASE_URL\n');
    console.log('Please provide the DATABASE_URL from abe-guard-ai/backend/.env');
    console.log('Format: postgresql://username:password@host:port/abe-guard\n');
    
    const databaseUrl = await askQuestion('Enter DATABASE_URL (or press Enter to skip): ');
    
    if (!databaseUrl.trim()) {
      console.log('\n⚠️  Skipped. Please manually add DATABASE_URL to .env file:');
      console.log('   DATABASE_URL=postgresql://username:password@host:port/abe-guard\n');
      rl.close();
      process.exit(0);
    }
    
    // Validate URL format
    try {
      const url = new URL(databaseUrl.trim());
      const dbName = url.pathname.slice(1);
      
      if (dbName !== 'abe-guard' && !dbName.includes('abe-guard')) {
        console.log(`\n⚠️  WARNING: Database name is "${dbName}", not "abe-guard"`);
        const confirm = await askQuestion('Continue anyway? (y/n): ');
        if (confirm.toLowerCase() !== 'y') {
          console.log('\n❌ Cancelled. Please check your DATABASE_URL.\n');
          rl.close();
          process.exit(0);
        }
      }
      
      // Update or create .env file
      if (envContent.includes('DATABASE_URL=')) {
        // Replace existing
        envContent = envContent.replace(/^DATABASE_URL=.*$/m, `DATABASE_URL=${databaseUrl.trim()}`);
        console.log('\n✅ Updated DATABASE_URL in .env file');
      } else {
        // Add new
        if (!envContent.endsWith('\n') && envContent.length > 0) {
          envContent += '\n';
        }
        envContent += '\n# DATABASE_URL - Same database as abe-guard-ai (abe-guard)\n';
        envContent += `DATABASE_URL=${databaseUrl.trim()}\n`;
        console.log('\n✅ Added DATABASE_URL to .env file');
      }
      
      fs.writeFileSync(adminDashboardEnvPath, envContent, 'utf8');
      console.log('✅ .env file saved successfully\n');
      
    } catch (error) {
      console.log(`\n❌ Invalid DATABASE_URL format: ${error.message}`);
      console.log('   Expected format: postgresql://username:password@host:port/database\n');
      rl.close();
      process.exit(1);
    }
  }
  
  // Step 4: Verify connection
  console.log('Step 4: Verifying connection to abe-guard database...\n');
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
  }
  
  rl.close();
  process.exit(0);
}

if (require.main === module) {
  main().catch(error => {
    console.error('❌ Error:', error);
    rl.close();
    process.exit(1);
  });
}

module.exports = { main };
