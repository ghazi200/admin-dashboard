/**
 * Script to help set up DATABASE_URL in admin-dashboard .env file
 * This ensures both admin-dashboard and abe-guard-ai use the same database (abe-guard)
 */

const fs = require('fs');
const path = require('path');

const envPath = path.resolve(__dirname, '../../../.env');

console.log('\n🔧 Setting up DATABASE_URL for admin-dashboard\n');
console.log('This script will help you add DATABASE_URL to your .env file');
console.log('so that admin-dashboard uses the same database as abe-guard-ai (abe-guard)\n');

// Read current .env file
let envContent = '';
if (fs.existsSync(envPath)) {
  envContent = fs.readFileSync(envPath, 'utf8');
  console.log('✅ Found existing .env file\n');
} else {
  console.log('⚠️  .env file not found. Will create a new one.\n');
}

// Check if DATABASE_URL already exists
if (envContent.includes('DATABASE_URL=')) {
  console.log('⚠️  DATABASE_URL already exists in .env file');
  const match = envContent.match(/^DATABASE_URL=(.+)$/m);
  if (match) {
    const url = match[1];
    // Mask password
    try {
      const urlObj = new URL(url);
      urlObj.password = '***';
      console.log(`   Current value: ${urlObj.toString()}`);
      console.log(`   Database: ${urlObj.pathname.slice(1)}\n`);
    } catch (e) {
      console.log(`   Current value: ${url.substring(0, 30)}...\n`);
    }
  }
  console.log('If you want to update it, please edit the .env file manually.\n');
  process.exit(0);
}

// Check for existing DB_* variables
const hasDbVars = envContent.includes('DB_NAME=') || 
                  envContent.includes('DB_HOST=') || 
                  envContent.includes('DB_USER=') || 
                  envContent.includes('DB_PASS=');

if (hasDbVars) {
  console.log('📋 Found existing DB_* variables in .env:');
  const dbName = envContent.match(/^DB_NAME=(.+)$/m)?.[1];
  const dbHost = envContent.match(/^DB_HOST=(.+)$/m)?.[1];
  const dbUser = envContent.match(/^DB_USER=(.+)$/m)?.[1];
  const dbPass = envContent.match(/^DB_PASS=(.+)$/m)?.[1];
  
  if (dbName) console.log(`   DB_NAME: ${dbName}`);
  if (dbHost) console.log(`   DB_HOST: ${dbHost}`);
  if (dbUser) console.log(`   DB_USER: ${dbUser}`);
  if (dbPass) console.log(`   DB_PASS: ${dbPass ? '***' : 'not set'}`);
  
  if (dbName && dbHost && dbUser && dbPass) {
    // Construct DATABASE_URL from DB_* variables
    const databaseUrl = `postgresql://${dbUser}:${dbPass}@${dbHost}/${dbName}`;
    console.log(`\n✅ Constructed DATABASE_URL from DB_* variables:`);
    console.log(`   ${databaseUrl.replace(/:[^:@]+@/, ':***@')}\n`);
    
    // Add DATABASE_URL to .env
    if (!envContent.endsWith('\n')) {
      envContent += '\n';
    }
    envContent += `# DATABASE_URL - Use same database as abe-guard-ai (abe-guard)\n`;
    envContent += `DATABASE_URL=${databaseUrl}\n`;
    
    fs.writeFileSync(envPath, envContent, 'utf8');
    console.log('✅ Added DATABASE_URL to .env file');
    console.log('   The admin-dashboard will now use the same database as abe-guard-ai\n');
    console.log('⚠️  IMPORTANT: Please verify that this DATABASE_URL points to the "abe-guard" database');
    console.log('   (not "ghaziabdullah"). Restart the admin-dashboard backend server after this change.\n');
  } else {
    console.log('\n⚠️  Cannot construct DATABASE_URL - missing DB_* variables');
    console.log('   Please add DATABASE_URL manually to your .env file:');
    console.log('   DATABASE_URL=postgresql://username:password@host:port/abe-guard\n');
  }
} else {
  console.log('⚠️  No DB_* variables found in .env file');
  console.log('   Please add DATABASE_URL manually to your .env file:');
  console.log('   DATABASE_URL=postgresql://username:password@host:port/abe-guard\n');
  console.log('   Make sure it points to the same database as abe-guard-ai uses.\n');
}

process.exit(0);
