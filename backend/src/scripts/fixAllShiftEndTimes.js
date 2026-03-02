/**
 * Script to find and fix all shifts with incorrect shift_end times
 * Specifically fixes 9 AM shifts that end at 10 PM (22:00:00) to end at 5 PM (17:00:00)
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const { sequelize } = require('../models');

async function fixAllShiftEndTimes() {
  try {
    console.log('\n🔍 Finding shifts with incorrect end times...\n');
    
    // Find shifts that start at 9 AM and end at 10 PM (should be 5 PM)
    const [shifts] = await sequelize.query(`
      SELECT 
        id,
        shift_date,
        shift_start,
        shift_end,
        location,
        status
      FROM shifts
      WHERE shift_start = '09:00:00' 
        AND shift_end = '22:00:00'
      ORDER BY shift_date DESC
      LIMIT 50
    `);
    
    if (shifts.length === 0) {
      console.log('✅ No shifts found with 9 AM - 10 PM pattern');
      console.log('   (This might mean they\'re already fixed or don\'t exist)\n');
      
      // Also check for 9 AM - 4 PM shifts (should be 5 PM)
      const [shifts2] = await sequelize.query(`
        SELECT 
          id,
          shift_date,
          shift_start,
          shift_end,
          location
        FROM shifts
        WHERE shift_start = '09:00:00' 
          AND shift_end = '16:00:00'
        ORDER BY shift_date DESC
        LIMIT 10
      `);
      
      if (shifts2.length > 0) {
        console.log(`⚠️  Found ${shifts2.length} shifts with 9 AM - 4 PM (should be 5 PM):\n`);
        shifts2.forEach((s, i) => {
          console.log(`   ${i+1}. ID: ${s.id.substring(0, 8)}..., Date: ${s.shift_date}, End: ${s.shift_end}`);
        });
        console.log('\n   These should be changed to 17:00:00 (5 PM)\n');
      }
      
      return;
    }
    
    console.log(`⚠️  Found ${shifts.length} shifts with 9 AM - 10 PM (should be 5 PM):\n`);
    
    shifts.forEach((shift, i) => {
      console.log(`${i+1}. ID: ${shift.id.substring(0, 8)}...`);
      console.log(`   Date: ${shift.shift_date}`);
      console.log(`   Start: ${shift.shift_start}`);
      console.log(`   End: ${shift.shift_end} → should be 17:00:00`);
      console.log(`   Location: ${shift.location || 'N/A'}`);
      console.log('');
    });
    
    console.log(`🔄 Fixing ${shifts.length} shifts...\n`);
    
    let fixed = 0;
    let failed = 0;
    
    for (const shift of shifts) {
      try {
        const [result] = await sequelize.query(
          `UPDATE shifts 
           SET shift_end = '17:00:00'::time 
           WHERE id = $1::uuid
           RETURNING id, shift_date, shift_start, shift_end`,
          { bind: [shift.id] }
        );
        
        if (result.length > 0) {
          console.log(`✅ Fixed shift ${shift.id.substring(0, 8)}... (${shift.shift_date})`);
          fixed++;
        } else {
          console.log(`⚠️  Shift ${shift.id.substring(0, 8)}... not found`);
          failed++;
        }
      } catch (error) {
        console.error(`❌ Error fixing shift ${shift.id.substring(0, 8)}...:`, error.message);
        failed++;
      }
    }
    
    console.log(`\n✅ Fixed ${fixed} shifts`);
    if (failed > 0) {
      console.log(`⚠️  ${failed} shifts failed to update`);
    }
    console.log('\n💡 Next steps:');
    console.log('   1. Refresh the admin dashboard');
    console.log('   2. The clock status will now show correct shift end times');
    console.log('   3. Overtime offers will show the correct current end time\n');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.code) console.error('   Code:', error.code);
    if (error.detail) console.error('   Detail:', error.detail);
    process.exit(1);
  }
}

async function main() {
  try {
    await fixAllShiftEndTimes();
    await sequelize.close();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { fixAllShiftEndTimes };
