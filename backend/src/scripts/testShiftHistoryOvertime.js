/**
 * Test script to verify shift history overtime calculation
 */
require('dotenv').config();
const { sequelize } = require('../src/models');

async function testOvertimeCalculation() {
  try {
    console.log("🧪 Testing overtime calculation logic...\n");
    
    // Test cases
    const testCases = [
      { hours: 8, expected: { regular: 8, overtime: 0, doubleTime: 0 } },
      { hours: 10, expected: { regular: 8, overtime: 2, doubleTime: 0 } },
      { hours: 13.8, expected: { regular: 8, overtime: 4, doubleTime: 1.8 } },
      { hours: 14, expected: { regular: 8, overtime: 4, doubleTime: 2 } },
    ];
    
    console.log("Testing calculation logic:\n");
    testCases.forEach(test => {
      const hours = test.hours;
      let regular = Math.min(hours, 8);
      let overtime = 0;
      let doubleTime = 0;
      
      if (hours > 12) {
        doubleTime = hours - 12;
        overtime = 4;
        regular = 8;
      } else if (hours > 8) {
        overtime = hours - 8;
        regular = 8;
      }
      
      const passed = regular === test.expected.regular && 
                     overtime === test.expected.overtime && 
                     doubleTime === test.expected.doubleTime;
      
      console.log(`${passed ? '✅' : '❌'} ${hours}h -> Regular: ${regular}, OT: ${overtime}, DT: ${doubleTime}`);
      if (!passed) {
        console.log(`   Expected: Regular: ${test.expected.regular}, OT: ${test.expected.overtime}, DT: ${test.expected.doubleTime}`);
      }
    });
    
    // Test with actual database query
    console.log("\n\n🧪 Testing with actual database query...\n");
    
    const [shifts] = await sequelize.query(`
      SELECT 
        s.id,
        s.shift_date,
        s.shift_start,
        s.shift_end,
        CASE 
          WHEN te.clock_in_at IS NOT NULL AND te.clock_out_at IS NOT NULL 
          THEN EXTRACT(EPOCH FROM (te.clock_out_at - te.clock_in_at)) / 3600
          ELSE NULL
        END as hours_worked
      FROM shifts s
      LEFT JOIN time_entries te ON s.id = te.shift_id
      WHERE s.guard_id IS NOT NULL
        AND te.clock_out_at IS NOT NULL
      ORDER BY hours_worked DESC NULLS LAST
      LIMIT 5
    `);
    
    console.log(`Found ${shifts.length} shifts with time entries:\n`);
    
    shifts.forEach(shift => {
      const hours = parseFloat(shift.hours_worked) || 0;
      let regular = Math.min(hours, 8);
      let overtime = 0;
      let doubleTime = 0;
      
      if (hours > 12) {
        doubleTime = hours - 12;
        overtime = 4;
        regular = 8;
      } else if (hours > 8) {
        overtime = hours - 8;
        regular = 8;
      }
      
      console.log(`Shift ${shift.id.substring(0, 8)}... (${shift.shift_date}):`);
      console.log(`  Hours: ${hours.toFixed(2)}`);
      console.log(`  Regular: ${regular.toFixed(2)}, OT: ${overtime.toFixed(2)}, DT: ${doubleTime.toFixed(2)}`);
      console.log('');
    });
    
  } catch (error) {
    console.error("❌ Error:", error.message);
    console.error(error.stack);
  } finally {
    await sequelize.close();
  }
}

testOvertimeCalculation();
