/**
 * Diagnostic script to trace why overtime offers are created with wrong times
 * Run this to see what the backend would do when creating an offer
 */

const path = require('path');
const fs = require('fs');
const { Sequelize } = require('sequelize');

// Load .env
const envPath = path.resolve(__dirname, '../../.env');
if (fs.existsSync(envPath)) {
  require('dotenv').config({ path: envPath });
} else {
  require('dotenv').config();
}

const sequelize = new Sequelize(process.env.DATABASE_URL, {
  dialect: 'postgres',
  logging: false,
});

(async () => {
  try {
    await sequelize.authenticate();
    console.log('✅ Connected to database\n');
    
    const shiftId = 'd36fe264-ae94-45ed-87eb-ca5b642bd956';
    
    // Query the shift exactly as the backend does
    const [shifts] = await sequelize.query(
      `SELECT shift_date, shift_start, shift_end, location FROM shifts WHERE id = $1::uuid`,
      { bind: [shiftId] }
    );
    
    if (shifts.length === 0) {
      console.log('❌ Shift not found');
      await sequelize.close();
      process.exit(1);
    }
    
    const shift = shifts[0];
    console.log('📋 Shift data from database:');
    console.log('   shift_date:', shift.shift_date, '(type:', typeof shift.shift_date, ')');
    console.log('   shift_start:', shift.shift_start, '(type:', typeof shift.shift_start, ')');
    console.log('   shift_end:', shift.shift_end, '(type:', typeof shift.shift_end, ')');
    console.log('   location:', shift.location);
    console.log('');
    
    // Simulate the exact code from overtimeOffers.controller.js
    const shiftDateStr = shift.shift_date instanceof Date 
      ? shift.shift_date.toISOString().split('T')[0]
      : String(shift.shift_date).split('T')[0];
    const shiftEndStr = String(shift.shift_end).split('.')[0];
    
    console.log('🔍 Parsing (same as backend):');
    console.log('   shiftDateStr:', shiftDateStr);
    console.log('   shiftEndStr:', shiftEndStr);
    console.log('');
    
    const dateParts = shiftDateStr.split('-');
    const timeParts = shiftEndStr.split(':');
    const year = parseInt(dateParts[0], 10);
    const month = parseInt(dateParts[1], 10) - 1;
    const day = parseInt(dateParts[2], 10);
    const hours = parseInt(timeParts[0], 10);
    const minutes = parseInt(timeParts[1] || '0', 10);
    const seconds = parseInt(timeParts[2] || '0', 10);
    
    console.log('📅 Parsed components:');
    console.log('   year:', year);
    console.log('   month:', month + 1, '(0-indexed:', month, ')');
    console.log('   day:', day);
    console.log('   hours:', hours, '(should be 17 for 5 PM)');
    console.log('   minutes:', minutes);
    console.log('   seconds:', seconds);
    console.log('');
    
    // Create date exactly as backend does
    const currentEndTime = new Date(year, month, day, hours, minutes, seconds);
    
    console.log('📅 Created Date object:');
    console.log('   Local string:', currentEndTime.toLocaleString());
    console.log('   Local hours:', currentEndTime.getHours(), '(should match parsed hours:', hours, ')');
    console.log('   UTC ISO:', currentEndTime.toISOString());
    console.log('   UTC hours:', currentEndTime.getUTCHours(), '(should be 22 for 5 PM EST)');
    console.log('   Timezone offset:', currentEndTime.getTimezoneOffset(), 'minutes');
    console.log('');
    
    // Check for issues
    if (currentEndTime.getHours() !== hours) {
      console.log('❌ ERROR: Local hours don\'t match!');
      console.log('   Expected:', hours);
      console.log('   Actual:', currentEndTime.getHours());
    } else {
      console.log('✅ Local hours match');
    }
    
    if (hours === 17 && currentEndTime.getUTCHours() === 3) {
      console.log('❌ ERROR: UTC hours are wrong!');
      console.log('   For 17:00 EST, UTC should be 22:00, not 3:00');
      console.log('   This suggests the server timezone is wrong or shift_end was read incorrectly');
    } else if (hours === 17 && currentEndTime.getUTCHours() === 22) {
      console.log('✅ UTC hours are correct (22:00 for 5 PM EST)');
    } else {
      console.log('⚠️  UTC hours:', currentEndTime.getUTCHours(), '(check if this is correct for your timezone)');
    }
    
    console.log('');
    console.log('💡 If UTC hours are wrong, check:');
    console.log('   1. Server timezone (should be America/New_York)');
    console.log('   2. If shift_end was read correctly from database');
    console.log('   3. Backend server logs when creating an offer');
    
    await sequelize.close();
  } catch (e) {
    console.error('❌ Error:', e.message);
    console.error(e.stack);
    await sequelize.close();
    process.exit(1);
  }
})();
