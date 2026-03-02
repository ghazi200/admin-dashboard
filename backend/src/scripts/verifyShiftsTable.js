/**
 * Script to verify the shifts table exists and show its structure
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../../../.env') });
const { sequelize } = require('../models');

async function verifyShiftsTable() {
  try {
    console.log('\n🔍 Verifying shifts table...\n');
    
    // Check if table exists
    const [tableCheck] = await sequelize.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'shifts'
      )
    `);
    
    if (!tableCheck[0]?.exists) {
      console.log('❌ shifts table does not exist');
      return;
    }
    
    console.log('✅ shifts table exists\n');
    
    // Get table structure
    const [columns] = await sequelize.query(`
      SELECT 
        column_name,
        data_type,
        is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public' 
        AND table_name = 'shifts'
      ORDER BY ordinal_position
    `);
    
    console.log('Table structure:');
    columns.forEach(col => {
      console.log(`   ${col.column_name}: ${col.data_type} (${col.is_nullable === 'YES' ? 'nullable' : 'NOT NULL'})`);
    });
    
    // Count rows
    const [count] = await sequelize.query(`SELECT COUNT(*) as count FROM shifts`);
    console.log(`\nTotal shifts in table: ${count[0]?.count || 0}`);
    
    // Get a few sample shifts
    const [samples] = await sequelize.query(`
      SELECT 
        id,
        shift_date,
        shift_start,
        shift_end,
        location,
        status
      FROM shifts
      LIMIT 5
    `);
    
    if (samples.length > 0) {
      console.log('\nSample shifts:');
      samples.forEach((shift, i) => {
        console.log(`\n${i + 1}. ID: ${shift.id?.substring(0, 8) || 'N/A'}...`);
        console.log(`   Date: ${shift.shift_date || 'N/A'}`);
        console.log(`   Start: ${shift.shift_start || 'N/A'}`);
        console.log(`   End: ${shift.shift_end || 'N/A'}`);
        console.log(`   Location: ${shift.location || 'N/A'}`);
        console.log(`   Status: ${shift.status || 'N/A'}`);
      });
    } else {
      console.log('\n⚠️  No shifts found in table');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('   Code:', error.code);
    console.error('   Detail:', error.detail);
    throw error;
  }
}

async function main() {
  try {
    await verifyShiftsTable();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { verifyShiftsTable };
