/**
 * Script to test overtime offer creation and see what the backend calculates
 */

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const envPath = path.resolve(__dirname, '../../.env');
const envContent = fs.readFileSync(envPath, 'utf8');
const match = envContent.match(/^DATABASE_URL=(.+)$/m);
const databaseUrl = match[1].trim();

const pool = new Pool({ connectionString: databaseUrl });

async function testCreation() {
  try {
    const shiftId = 'd36fe264-ae94-45ed-87eb-ca5b642bd956';
    
    // Get shift data (simulate what backend does)
    const result = await pool.query(
      `SELECT shift_date, shift_start, shift_end, location 
       FROM shifts 
       WHERE id = $1::uuid`,
      [shiftId]
    );
    
    if (result.rows.length === 0) {
      console.log('❌ Shift not found');
      await pool.end();
      return;
    }
    
    const shift = result.rows[0];
    console.log('📊 Shift data from database:');
    console.log(`   shift_end: ${shift.shift_end} (type: ${typeof shift.shift_end})`);
    console.log(`   shift_date: ${shift.shift_date}`);
    console.log('');
    
    // Simulate backend calculation
    const shiftDateStr = shift.shift_date instanceof Date 
      ? shift.shift_date.toISOString().split('T')[0]
      : String(shift.shift_date).split('T')[0];
    const shiftEndStr = String(shift.shift_end).split('.')[0];
    
    const dateParts = shiftDateStr.split('-');
    const timeParts = shiftEndStr.split(':');
    
    const year = parseInt(dateParts[0], 10);
    const month = parseInt(dateParts[1], 10) - 1;
    const day = parseInt(dateParts[2], 10);
    const hours = parseInt(timeParts[0], 10);
    const minutes = parseInt(timeParts[1] || '0', 10);
    const seconds = parseInt(timeParts[2] || '0', 10);
    
    console.log('🔍 Parsed values:');
    console.log(`   hours: ${hours} (should be 17 for 5 PM)`);
    console.log(`   minutes: ${minutes}`);
    console.log('');
    
    // Create date
    const currentEndTime = new Date(year, month, day, hours, minutes, seconds);
    
    console.log('📅 Created Date object:');
    console.log(`   Local hours: ${currentEndTime.getHours()} (should be 17)`);
    console.log(`   UTC hours: ${currentEndTime.getUTCHours()} (should be 22)`);
    console.log(`   UTC ISO: ${currentEndTime.toISOString()}`);
    console.log(`   Local string: ${currentEndTime.toLocaleString()}`);
    console.log('');
    
    if (currentEndTime.getHours() === 17 && currentEndTime.getUTCHours() === 22) {
      console.log('✅ Calculation is CORRECT!');
      console.log('   The backend code should work correctly.');
      console.log('   If offers still show wrong times, the server needs to be restarted.\n');
    } else {
      console.log('❌ Calculation is WRONG!');
      console.log(`   Expected: local=17, UTC=22`);
      console.log(`   Actual: local=${currentEndTime.getHours()}, UTC=${currentEndTime.getUTCHours()}\n`);
    }
    
    await pool.end();
  } catch (e) {
    console.error('Error:', e.message);
    await pool.end();
  }
}

if (require.main === module) {
  testCreation();
}

module.exports = { testCreation };
