/**
 * Script to check shift times in the database
 * Shows all recent shifts and their start/end times
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../../../.env') });
const { sequelize } = require('../models');

async function checkShiftTimes() {
  try {
    console.log('\n🔍 Checking recent shifts and their times...\n');
    
    // Get recent shifts
    const [shifts] = await sequelize.query(`
      SELECT 
        id,
        shift_date,
        shift_start,
        shift_end,
        location,
        status
      FROM shifts
      ORDER BY shift_date DESC, created_at DESC
      LIMIT 20
    `);

    if (shifts.length === 0) {
      console.log('No shifts found');
      return;
    }

    console.log(`Found ${shifts.length} recent shifts:\n`);
    
    shifts.forEach((shift, index) => {
      console.log(`${index + 1}. Shift ID: ${shift.id.substring(0, 8)}...`);
      console.log(`   Date: ${shift.shift_date}`);
      console.log(`   Start: ${shift.shift_start || 'N/A'}`);
      console.log(`   End: ${shift.shift_end || 'N/A'}`);
      console.log(`   Location: ${shift.location || 'N/A'}`);
      console.log(`   Status: ${shift.status || 'N/A'}`);
      
      // Check if times look wrong
      if (shift.shift_start === '09:00:00' && shift.shift_end === '16:00:00') {
        console.log(`   ⚠️  POTENTIAL ISSUE: 9 AM - 4 PM (should probably be 5 PM or 11 PM)`);
      } else if (shift.shift_start === '09:00:00' && shift.shift_end === '05:00:00') {
        console.log(`   ⚠️  POTENTIAL ISSUE: 9 AM - 5 AM (should probably be 5 PM)`);
      }
      console.log('');
    });

    // Also check for shifts with specific end times
    console.log('\n📊 Summary by shift_end time:');
    const [summary] = await sequelize.query(`
      SELECT 
        shift_end,
        COUNT(*) as count
      FROM shifts
      WHERE shift_end IS NOT NULL
      GROUP BY shift_end
      ORDER BY count DESC
      LIMIT 10
    `);
    
    summary.forEach(row => {
      console.log(`   ${row.shift_end}: ${row.count} shifts`);
    });

  } catch (error) {
    console.error('❌ Error:', error.message);
    throw error;
  }
}

async function main() {
  try {
    await checkShiftTimes();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { checkShiftTimes };
