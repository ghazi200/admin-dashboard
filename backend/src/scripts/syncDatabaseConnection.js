/**
 * Script to sync admin-dashboard to use the same database as abe-guard-ai
 * This ensures both systems use the abe-guard database
 */

const fs = require('fs');
const path = require('path');

const adminDashboardEnvPath = path.resolve(__dirname, '../../../.env');
// Check multiple possible locations for abe-guard-ai .env
const possibleAbeGuardPaths = [
  path.resolve(__dirname, '../../../../abe-guard-ai/backend/.env'), // Most likely location
  path.resolve(__dirname, '../../../../abe-guard-ai/.env'),         // Alternative location
  path.resolve(__dirname, '../../../abe-guard-ai/backend/.env'),    // Relative path alternative
];

console.log('\n🔧 Syncing database connection to use abe-guard database\n');

// Step 1: Find and read DATABASE_URL from abe-guard-ai .env
let abeGuardDatabaseUrl = null;
let abeGuardEnvPath = null;

// Try to find the .env file in possible locations
for (const possiblePath of possibleAbeGuardPaths) {
  if (fs.existsSync(possiblePath)) {
    abeGuardEnvPath = possiblePath;
    break;
  }
}

if (abeGuardEnvPath) {
  console.log(`✅ Found abe-guard-ai .env at: ${abeGuardEnvPath}\n`);
  const abeGuardEnvContent = fs.readFileSync(abeGuardEnvPath, 'utf8');
  const match = abeGuardEnvContent.match(/^DATABASE_URL=(.+)$/m);
  if (match) {
    abeGuardDatabaseUrl = match[1].trim();
    console.log('✅ Found DATABASE_URL in abe-guard-ai/.env');
    
    // Show database name (mask password)
    try {
      const url = new URL(abeGuardDatabaseUrl);
      const dbName = url.pathname.slice(1);
      url.password = '***';
      console.log(`   Connection: ${url.toString()}`);
      console.log(`   Database: ${dbName}\n`);
      
      if (dbName !== 'abe-guard' && !dbName.includes('abe-guard')) {
        console.log('⚠️  WARNING: Database name is not "abe-guard"');
        console.log(`   Current database: ${dbName}`);
        console.log('   Make sure this is the correct database!\n');
      }
    } catch (e) {
      console.log(`   DATABASE_URL: ${abeGuardDatabaseUrl.substring(0, 50)}...\n`);
    }
  } else {
    console.log('❌ DATABASE_URL not found in abe-guard-ai/.env');
    console.log('   Please ensure abe-guard-ai/.env has DATABASE_URL set\n');
    process.exit(1);
  }
} else {
  console.log('❌ abe-guard-ai/.env file not found in any of these locations:');
  possibleAbeGuardPaths.forEach(p => console.log(`   - ${p}`));
  console.log('\n⚠️  Please manually set DATABASE_URL in admin-dashboard/.env');
  console.log('   to match the DATABASE_URL from abe-guard-ai/backend/.env\n');
  process.exit(1);
}

// Step 2: Read or create admin-dashboard .env
let adminDashboardEnvContent = '';
if (fs.existsSync(adminDashboardEnvPath)) {
  adminDashboardEnvContent = fs.readFileSync(adminDashboardEnvPath, 'utf8');
  console.log('✅ Found existing admin-dashboard/.env file\n');
} else {
  console.log('⚠️  admin-dashboard/.env not found. Will create a new one.\n');
}

// Step 3: Update or add DATABASE_URL in admin-dashboard .env
let updated = false;
if (adminDashboardEnvContent.includes('DATABASE_URL=')) {
  // Replace existing DATABASE_URL
  const lines = adminDashboardEnvContent.split('\n');
  const updatedLines = lines.map(line => {
    if (line.startsWith('DATABASE_URL=')) {
      updated = true;
      return `DATABASE_URL=${abeGuardDatabaseUrl}`;
    }
    return line;
  });
  adminDashboardEnvContent = updatedLines.join('\n');
  
  if (updated) {
    console.log('✅ Updated existing DATABASE_URL in admin-dashboard/.env');
  }
} else {
  // Add new DATABASE_URL
  if (!adminDashboardEnvContent.endsWith('\n') && adminDashboardEnvContent.length > 0) {
    adminDashboardEnvContent += '\n';
  }
  adminDashboardEnvContent += '\n# DATABASE_URL - Same database as abe-guard-ai (abe-guard)\n';
  adminDashboardEnvContent += `DATABASE_URL=${abeGuardDatabaseUrl}\n`;
  updated = true;
  console.log('✅ Added DATABASE_URL to admin-dashboard/.env');
}

// Step 4: Write updated .env file
if (updated) {
  fs.writeFileSync(adminDashboardEnvPath, adminDashboardEnvContent, 'utf8');
  console.log('✅ admin-dashboard/.env file updated successfully\n');
} else {
  console.log('ℹ️  DATABASE_URL already matches (no changes needed)\n');
}

// Step 5: Verify the connection
console.log('🔍 Verifying database connection...\n');
try {
  // Load the updated .env
  require('dotenv').config({ path: adminDashboardEnvPath });
  
  // Test connection
  const { sequelize } = require('../models');
  
  (async () => {
    try {
      await sequelize.authenticate();
      console.log('✅ Database connection successful');
      
      // Get database name
      const [dbInfo] = await sequelize.query('SELECT current_database() as db_name');
      const dbName = dbInfo[0]?.db_name;
      console.log(`📊 Connected to database: ${dbName}`);
      
      // Check if it matches abe-guard
      if (dbName === 'abe-guard' || dbName.includes('abe-guard')) {
        console.log('✅ SUCCESS: Connected to abe-guard database!\n');
      } else {
        console.log(`⚠️  WARNING: Connected to "${dbName}" instead of "abe-guard"`);
        console.log('   Please verify this is the correct database.\n');
      }
      
      // Check for shifts
      const [shiftCount] = await sequelize.query('SELECT COUNT(*) as count FROM shifts');
      const count = parseInt(shiftCount[0]?.count || 0);
      console.log(`📋 Shifts in database: ${count}`);
      
      if (count > 0) {
        console.log('✅ Database has shifts data - connection is working!\n');
      } else {
        console.log('ℹ️  Database is empty or shifts table has no data\n');
      }
      
      await sequelize.close();
      process.exit(0);
    } catch (error) {
      console.error('❌ Database connection failed:', error.message);
      console.error('\n⚠️  Please check:');
      console.error('   1. Database server is running');
      console.error('   2. DATABASE_URL credentials are correct');
      console.error('   3. Database "abe-guard" exists\n');
      process.exit(1);
    }
  })();
} catch (error) {
  console.error('❌ Error loading models:', error.message);
  console.error('\n⚠️  Please restart the admin-dashboard backend server');
  console.error('   for the changes to take effect.\n');
  process.exit(1);
}
