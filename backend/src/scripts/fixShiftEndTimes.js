/**
 * Script to fix incorrect shift_end times in the database
 * 
 * This script:
 * 1. Finds shifts with incorrect shift_end values
 * 2. Allows updating them to correct values
 * 3. Can fix specific shifts or all shifts matching criteria
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../../../.env') });
const { sequelize } = require('../models');

/**
 * Find shifts with incorrect shift_end times
 */
async function findShiftsWithIncorrectEndTimes() {
  try {
    console.log('\n🔍 Finding shifts with potentially incorrect shift_end times...\n');
    
    // Find shifts that might have incorrect end times
    // Common issues: 16:00:00 (4 PM) when should be 23:00:00 (11 PM)
    // Or 05:00:00 (5 AM) when should be 17:00:00 (5 PM)
    const [shifts] = await sequelize.query(`
      SELECT 
        id,
        shift_date,
        shift_start,
        shift_end,
        location,
        status,
        created_at
      FROM shifts
      WHERE shift_end IN ('16:00:00', '05:00:00', '04:00:00')
        OR (shift_start = '09:00:00' AND shift_end != '17:00:00' AND shift_end != '23:00:00')
      ORDER BY shift_date DESC, created_at DESC
      LIMIT 50
    `);

    if (shifts.length === 0) {
      console.log('✅ No shifts found with obviously incorrect end times');
      return [];
    }

    console.log(`Found ${shifts.length} shifts that might need correction:\n`);
    
    shifts.forEach((shift, index) => {
      console.log(`${index + 1}. Shift ID: ${shift.id.substring(0, 8)}...`);
      console.log(`   Date: ${shift.shift_date}`);
      console.log(`   Time: ${shift.shift_start} - ${shift.shift_end}`);
      console.log(`   Location: ${shift.location || 'N/A'}`);
      console.log(`   Status: ${shift.status}`);
      
      // Suggest correct end time based on start time
      if (shift.shift_start === '09:00:00') {
        if (shift.shift_end === '16:00:00') {
          console.log(`   ⚠️  Suggested fix: Change 16:00:00 (4 PM) to 17:00:00 (5 PM) or 23:00:00 (11 PM)`);
        } else if (shift.shift_end === '05:00:00') {
          console.log(`   ⚠️  Suggested fix: Change 05:00:00 (5 AM) to 17:00:00 (5 PM)`);
        }
      }
      console.log('');
    });

    return shifts;
  } catch (error) {
    console.error('❌ Error finding shifts:', error);
    throw error;
  }
}

/**
 * Update a specific shift's end time
 */
async function updateShiftEndTime(shiftId, newEndTime) {
  try {
    console.log(`\n🔄 Updating shift ${shiftId.substring(0, 8)}...`);
    console.log(`   New end time: ${newEndTime}`);

    const [result] = await sequelize.query(
      `UPDATE shifts 
       SET shift_end = $1::time 
       WHERE id = $2::uuid
       RETURNING id, shift_date, shift_start, shift_end, location`,
      { bind: [newEndTime, shiftId] }
    );

    if (result.length === 0) {
      console.log('   ❌ Shift not found');
      return false;
    }

    const updated = result[0];
    console.log(`   ✅ Updated successfully:`);
    console.log(`      Date: ${updated.shift_date}`);
    console.log(`      Time: ${updated.shift_start} - ${updated.shift_end}`);
    console.log(`      Location: ${updated.location || 'N/A'}`);

    return true;
  } catch (error) {
    console.error(`   ❌ Error updating shift:`, error.message);
    return false;
  }
}

/**
 * Fix shifts with common incorrect patterns
 */
async function fixCommonIssues() {
  try {
    console.log('\n🔧 Fixing common shift_end issues...\n');

    // Fix 9 AM - 4 PM shifts (should be 5 PM or 11 PM)
    console.log('1. Fixing 9 AM - 4 PM shifts (changing to 5 PM)...');
    const [result1] = await sequelize.query(
      `UPDATE shifts 
       SET shift_end = '17:00:00'::time 
       WHERE shift_start = '09:00:00' 
         AND shift_end = '16:00:00'
       RETURNING id, shift_date, shift_start, shift_end`,
      { bind: [] }
    );
    console.log(`   ✅ Fixed ${result1.length} shifts (9 AM - 4 PM → 9 AM - 5 PM)\n`);

    // Fix 9 AM - 5 AM shifts (should be 5 PM)
    console.log('2. Fixing 9 AM - 5 AM shifts (changing to 5 PM)...');
    const [result2] = await sequelize.query(
      `UPDATE shifts 
       SET shift_end = '17:00:00'::time 
       WHERE shift_start = '09:00:00' 
         AND shift_end = '05:00:00'
       RETURNING id, shift_date, shift_start, shift_end`,
      { bind: [] }
    );
    console.log(`   ✅ Fixed ${result2.length} shifts (9 AM - 5 AM → 9 AM - 5 PM)\n`);

    // Fix 9 AM - 4 AM shifts (should be 5 PM)
    console.log('3. Fixing 9 AM - 4 AM shifts (changing to 5 PM)...');
    const [result3] = await sequelize.query(
      `UPDATE shifts 
       SET shift_end = '17:00:00'::time 
       WHERE shift_start = '09:00:00' 
         AND shift_end = '04:00:00'
       RETURNING id, shift_date, shift_start, shift_end`,
      { bind: [] }
    );
    console.log(`   ✅ Fixed ${result3.length} shifts (9 AM - 4 AM → 9 AM - 5 PM)\n`);

    const totalFixed = result1.length + result2.length + result3.length;
    console.log(`\n✅ Total shifts fixed: ${totalFixed}`);

    return totalFixed;
  } catch (error) {
    console.error('❌ Error fixing shifts:', error);
    throw error;
  }
}

/**
 * Interactive mode - let user choose which shifts to fix
 */
async function interactiveFix() {
  try {
    const shifts = await findShiftsWithIncorrectEndTimes();

    if (shifts.length === 0) {
      console.log('No shifts need fixing.');
      return;
    }

    console.log('\n📝 To fix a specific shift, use:');
    console.log('   node fixShiftEndTimes.js --fix <shiftId> <newEndTime>');
    console.log('   Example: node fixShiftEndTimes.js --fix abc123... 17:00:00');
    console.log('\nOr use --auto to fix common issues automatically');
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

/**
 * Main function
 */
async function main() {
  try {
    const args = process.argv.slice(2);

    if (args.includes('--auto')) {
      // Auto-fix common issues
      await fixCommonIssues();
    } else if (args.includes('--fix') && args.length >= 3) {
      // Fix specific shift
      const shiftId = args[args.indexOf('--fix') + 1];
      const newEndTime = args[args.indexOf('--fix') + 2];
      
      if (!shiftId || !newEndTime) {
        console.error('❌ Usage: node fixShiftEndTimes.js --fix <shiftId> <newEndTime>');
        console.error('   Example: node fixShiftEndTimes.js --fix abc123... 17:00:00');
        process.exit(1);
      }

      await updateShiftEndTime(shiftId, newEndTime);
    } else {
      // Interactive mode - show shifts that need fixing
      await interactiveFix();
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = {
  findShiftsWithIncorrectEndTimes,
  updateShiftEndTime,
  fixCommonIssues,
};
