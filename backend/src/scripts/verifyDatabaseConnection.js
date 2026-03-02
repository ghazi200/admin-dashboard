/**
 * Script to verify database connection and check if we're using the correct abe-guard database
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const { sequelize } = require('../models');

async function verifyDatabaseConnection() {
  try {
    console.log('\n🔍 Verifying database connection...\n');
    
    // Test connection
    await sequelize.authenticate();
    console.log('✅ Database connection successful\n');
    
    // Get database name
    const [dbInfo] = await sequelize.query('SELECT current_database() as db_name');
    const dbName = dbInfo[0]?.db_name;
    console.log(`📊 Connected to database: ${dbName}\n`);
    
    // Check if shifts table exists and has data
    const [shiftCount] = await sequelize.query('SELECT COUNT(*) as count FROM shifts');
    const count = parseInt(shiftCount[0]?.count || 0);
    console.log(`📋 Shifts in database: ${count}`);
    
    if (count > 0) {
      // Get sample shifts
      const [shifts] = await sequelize.query(`
        SELECT id, shift_date, shift_start, shift_end, location 
        FROM shifts 
        ORDER BY shift_date DESC 
        LIMIT 5
      `);
      
      console.log('\n📝 Sample shifts:');
      shifts.forEach((shift, i) => {
        console.log(`   ${i + 1}. Date: ${shift.shift_date}, Start: ${shift.shift_start}, End: ${shift.shift_end}`);
      });
      
      // Check for shifts with potentially incorrect end times
      const [incorrectShifts] = await sequelize.query(`
        SELECT id, shift_date, shift_start, shift_end, location
        FROM shifts
        WHERE shift_start = '09:00:00' 
          AND shift_end IN ('16:00:00', '05:00:00', '04:00:00')
        LIMIT 10
      `);
      
      if (incorrectShifts.length > 0) {
        console.log(`\n⚠️  Found ${incorrectShifts.length} shifts with potentially incorrect end times:`);
        incorrectShifts.forEach((shift, i) => {
          console.log(`   ${i + 1}. ID: ${shift.id.substring(0, 8)}..., Date: ${shift.shift_date}, Start: ${shift.shift_start}, End: ${shift.shift_end}`);
        });
      } else {
        console.log('\n✅ No shifts found with obviously incorrect end times');
      }
    } else {
      console.log('\n⚠️  No shifts found in database');
      console.log('   This might mean:');
      console.log('   1. The database is empty');
      console.log('   2. You\'re connected to the wrong database');
      console.log('   3. The shifts table exists but has no data');
    }
    
    // Check environment variables
    console.log('\n🔧 Environment Configuration:');
    console.log(`   DATABASE_URL: ${process.env.DATABASE_URL ? '✅ Set' : '❌ Not set'}`);
    console.log(`   DB_NAME: ${process.env.DB_NAME || 'Not set'}`);
    console.log(`   DB_HOST: ${process.env.DB_HOST || 'Not set'}`);
    console.log(`   DB_USER: ${process.env.DB_USER || 'Not set'}`);
    
    if (process.env.DATABASE_URL) {
      // Parse DATABASE_URL to show database name (without exposing password)
      try {
        const url = new URL(process.env.DATABASE_URL);
        console.log(`   DATABASE_URL points to: ${url.hostname}/${url.pathname.slice(1)}`);
      } catch (e) {
        console.log(`   DATABASE_URL format: ${process.env.DATABASE_URL.substring(0, 30)}...`);
      }
    }
    
    console.log('\n✅ Verification complete\n');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.code) console.error('   Code:', error.code);
    throw error;
  }
}

async function main() {
  try {
    await verifyDatabaseConnection();
    process.exit(0);
  } catch (error) {
    console.error('❌ Verification failed:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { verifyDatabaseConnection };
