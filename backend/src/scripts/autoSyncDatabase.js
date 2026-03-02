/**
 * Script to automatically sync admin-dashboard to use the same database as abe-guard-ai
 * Reads DATABASE_URL from abe-guard-ai/backend/.env and updates admin-dashboard/.env
 */

const fs = require('fs');
const path = require('path');

const adminDashboardEnvPath = path.resolve(__dirname, '../../../.env');
const abeGuardEnvPaths = [
  path.resolve(__dirname, '../../../../abe-guard-ai/backend/.env'),
  path.resolve(__dirname, '../../../abe-guard-ai/backend/.env'),
  path.resolve(__dirname, '../../../../abe-guard-ai/.env'),
];

async function autoSyncDatabase() {
  console.log('\n🔧 Auto-syncing database connection to abe-guard database\n');
  
  // Step 1: Find and read DATABASE_URL from abe-guard-ai
  let abeGuardDatabaseUrl = null;
  let foundPath = null;
  
  for (const envPath of abeGuardEnvPaths) {
    if (fs.existsSync(envPath)) {
      try {
        const envContent = fs.readFileSync(envPath, 'utf8');
        const match = envContent.match(/^DATABASE_URL=(.+)$/m);
        if (match) {
          abeGuardDatabaseUrl = match[1].trim();
          foundPath = envPath;
          break;
        }
      } catch (error) {
        console.log(`⚠️  Could not read ${envPath}: ${error.message}`);
      }
    }
  }
  
  if (!abeGuardDatabaseUrl) {
    console.log('❌ Could not find DATABASE_URL in abe-guard-ai .env files');
    console.log('   Checked paths:');
    abeGuardEnvPaths.forEach(p => console.log(`     - ${p}`));
    console.log('\n   Please manually run:');
    console.log('   node src/scripts/syncToAbeGuardDatabase.js "postgresql://..."\n');
    process.exit(1);
  }
  
  console.log(`✅ Found DATABASE_URL in: ${foundPath}`);
  
  // Validate and show database name
  try {
    const url = new URL(abeGuardDatabaseUrl);
    const dbName = url.pathname.slice(1);
    url.password = '***';
    console.log(`   Connection: ${url.toString()}`);
    console.log(`   Database: ${dbName}\n`);
    
    if (dbName !== 'abe-guard' && !dbName.includes('abe-guard')) {
      console.log(`⚠️  WARNING: Database name is "${dbName}", not "abe-guard"`);
      console.log('   Make sure this is the correct database!\n');
    }
  } catch (error) {
    console.log(`   DATABASE_URL: ${abeGuardDatabaseUrl.substring(0, 50)}...\n`);
  }
  
  // Step 2: Read or create admin-dashboard .env
  let envContent = '';
  if (fs.existsSync(adminDashboardEnvPath)) {
    envContent = fs.readFileSync(adminDashboardEnvPath, 'utf8');
    console.log('✅ Found existing admin-dashboard/.env file\n');
  } else {
    console.log('⚠️  admin-dashboard/.env not found. Will create a new one.\n');
  }
  
  // Step 3: Update or add DATABASE_URL
  let updated = false;
  if (envContent.includes('DATABASE_URL=')) {
    // Check if it's already the same
    const existingMatch = envContent.match(/^DATABASE_URL=(.+)$/m);
    if (existingMatch && existingMatch[1].trim() === abeGuardDatabaseUrl) {
      console.log('ℹ️  DATABASE_URL already matches - no changes needed\n');
    } else {
      // Replace existing
      const lines = envContent.split('\n');
      const updatedLines = lines.map(line => {
        if (line.startsWith('DATABASE_URL=')) {
          updated = true;
          return `DATABASE_URL=${abeGuardDatabaseUrl}`;
        }
        return line;
      });
      envContent = updatedLines.join('\n');
      
      if (updated) {
        console.log('✅ Updated existing DATABASE_URL in admin-dashboard/.env');
      }
    }
  } else {
    // Add new
    if (!envContent.endsWith('\n') && envContent.length > 0) {
      envContent += '\n';
    }
    envContent += '\n# DATABASE_URL - Same database as abe-guard-ai (abe-guard)\n';
    envContent += `DATABASE_URL=${abeGuardDatabaseUrl}\n`;
    updated = true;
    console.log('✅ Added DATABASE_URL to admin-dashboard/.env');
  }
  
  // Step 4: Write .env file
  if (updated) {
    fs.writeFileSync(adminDashboardEnvPath, envContent, 'utf8');
    console.log('✅ .env file saved successfully\n');
  }
  
  // Step 5: Verify connection
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
        
        // Check for shifts with incorrect end times
        const [incorrectShifts] = await sequelize.query(`
          SELECT id, shift_date, shift_start, shift_end, location
          FROM shifts
          WHERE shift_start = '09:00:00' 
            AND shift_end IN ('16:00:00', '05:00:00', '04:00:00')
          LIMIT 5
        `);
        
        if (incorrectShifts.length > 0) {
          console.log(`⚠️  Found ${incorrectShifts.length} shifts with potentially incorrect end times:`);
          incorrectShifts.forEach((shift, i) => {
            console.log(`   ${i + 1}. Date: ${shift.shift_date}, Start: ${shift.shift_start}, End: ${shift.shift_end}`);
          });
          console.log('\n   You can fix these using: node src/scripts/fixShiftEndTimes.js\n');
        }
      } else {
        console.log('ℹ️  Database is empty or shifts table has no data\n');
      }
      
      await sequelize.close();
      console.log('💡 IMPORTANT: Restart the admin-dashboard backend server for changes to take effect.\n');
    } else {
      console.log(`⚠️  Connected to "${dbName}" instead of "abe-guard"`);
      console.log('   Please verify your DATABASE_URL is correct.\n');
      await sequelize.close();
      process.exit(1);
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
  autoSyncDatabase().catch(error => {
    console.error('❌ Error:', error);
    process.exit(1);
  });
}

module.exports = { autoSyncDatabase };
