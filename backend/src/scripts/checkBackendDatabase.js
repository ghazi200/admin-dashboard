/**
 * Script to check which database the backend server is actually using
 * Run this to verify the backend is connected to abe_guard or abe-guard
 */

const path = require('path');
const fs = require('fs');

const REQUIRED_DB_NAMES = ['abe_guard', 'abe-guard'];

// Load .env the same way models/index.js does
const envPath = path.resolve(__dirname, '../../.env');
if (fs.existsSync(envPath)) {
  require('dotenv').config({ path: envPath });
} else {
  require('dotenv').config();
}

const { sequelize } = require('../models');

(async () => {
  try {
    console.log('\n🔍 Checking backend database connection...\n');
    
    await sequelize.authenticate();
    const [dbInfo] = await sequelize.query('SELECT current_database() as db_name');
    const dbName = dbInfo[0]?.db_name;
    
    console.log('📊 Backend is connected to:', dbName);
    console.log('');
    
    if (REQUIRED_DB_NAMES.includes(dbName)) {
      console.log('✅ CORRECT DATABASE!');
      console.log(`   The backend is using the correct database (${dbName})\n`);
      
      // Test the specific shift
      const shiftId = 'd36fe264-ae94-45ed-87eb-ca5b642bd956';
      const [shifts] = await sequelize.query(
        `SELECT shift_date, shift_start, shift_end, location FROM shifts WHERE id = $1::uuid`,
        { bind: [shiftId] }
      );
      
      if (shifts.length > 0) {
        const shift = shifts[0];
        console.log('📋 Shift data:');
        console.log(`   shift_end: ${shift.shift_end}`);
        if (shift.shift_end === '17:00:00') {
          console.log('   ✅ CORRECT (5 PM)\n');
          console.log('💡 If overtime offers still show wrong times:');
          console.log('   1. Make sure you restarted the backend server');
          console.log('   2. Delete old incorrect offers');
          console.log('   3. Create a new offer - it should work correctly\n');
        } else {
          console.log(`   ⚠️  WRONG (should be 17:00:00, not ${shift.shift_end})\n`);
        }
      }
    } else {
      console.log('❌ WRONG DATABASE!');
      console.log(`   Backend is connected to "${dbName}" instead of abe_guard or abe-guard`);
      console.log('   This means the backend server needs to be restarted!\n');
      console.log('💡 Steps to fix:');
      console.log('   1. Stop the backend server (Ctrl+C)');
      console.log('   2. Restart it: cd backend && npm start');
      console.log('   3. Run this script again to verify\n');
    }
    
    await sequelize.close();
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
})();
