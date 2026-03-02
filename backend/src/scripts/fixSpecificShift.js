/**
 * Script to fix a specific shift's end time
 * Usage: node fixSpecificShift.js <shiftId> <newEndTime>
 * Example: node fixSpecificShift.js d36fe264-ae94-45ed-87eb-ca5b642bd956 17:00:00
 */

const path = require('path');
const fs = require('fs');

// Manually load DATABASE_URL from .env file
// __dirname is backend/src/scripts, so ../.. goes to admin-dashboard, then .env is at admin-dashboard/.env
// But we want backend/.env, so from admin-dashboard we go to backend/.env
const envPath = path.resolve(__dirname, '../../.env');
let databaseUrl = null;

if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  const match = envContent.match(/^DATABASE_URL=(.+)$/m);
  if (match) {
    databaseUrl = match[1].trim();
  }
}

if (!databaseUrl) {
  console.error('❌ DATABASE_URL not found in .env file');
  console.error(`   Expected at: ${envPath}`);
  process.exit(1);
}

// Use pg directly to ensure we connect to the correct database
const { Pool } = require('pg');

async function fixShift(shiftId, newEndTime) {
  if (!shiftId || !newEndTime) {
    console.error('❌ Usage: node fixSpecificShift.js <shiftId> <newEndTime>');
    console.error('   Example: node fixSpecificShift.js d36fe264-ae94-45ed-87eb-ca5b642bd956 17:00:00');
    process.exit(1);
  }

  // Create pool using DATABASE_URL from .env file
  const pool = new Pool({
    connectionString: databaseUrl,
  });

  try {
    console.log(`\n🔄 Fixing shift ${shiftId}...\n`);

    // Check which database we're connected to
    const dbResult = await pool.query('SELECT current_database() as db_name');
    console.log(`📊 Connected to database: ${dbResult.rows[0]?.db_name}\n`);

    // First, get current values
    const currentResult = await pool.query(
      `SELECT shift_date, shift_start, shift_end, location 
       FROM shifts 
       WHERE id = $1::uuid`,
      [shiftId]
    );

    if (currentResult.rows.length === 0) {
      console.error('❌ Shift not found');
      console.error('   Make sure:');
      console.error('   1. The shift ID is correct');
      console.error('   2. You\'re connected to the correct database (abe_guard)');
      console.error('   3. The shift exists in the database\n');
      
      // Try to find similar shifts
      const similarResult = await pool.query(
        `SELECT id, shift_date, shift_start, shift_end, location
         FROM shifts
         WHERE shift_start = '09:00:00' AND shift_end = '22:00:00'
         ORDER BY shift_date DESC
         LIMIT 5`
      );
      
      if (similarResult.rows.length > 0) {
        console.log(`⚠️  Found ${similarResult.rows.length} shifts with 9 AM - 10 PM pattern:`);
        similarResult.rows.forEach((s, i) => {
          console.log(`   ${i+1}. ID: ${s.id}, Date: ${s.shift_date}, End: ${s.shift_end}`);
        });
        console.log('\n   These should be changed to 17:00:00 (5 PM)\n');
      }
      
      await pool.end();
      process.exit(1);
    }

    const shift = currentResult.rows[0];
    console.log('Current values:');
    console.log(`   Date: ${shift.shift_date}`);
    console.log(`   Start: ${shift.shift_start}`);
    console.log(`   End: ${shift.shift_end} → ${newEndTime}`);
    console.log(`   Location: ${shift.location || 'N/A'}\n`);

    // Update the shift
    const updateResult = await pool.query(
      `UPDATE shifts 
       SET shift_end = $1::time 
       WHERE id = $2::uuid
       RETURNING id, shift_date, shift_start, shift_end, location`,
      [newEndTime, shiftId]
    );

    if (updateResult.rows.length === 0) {
      console.error('❌ Update failed - shift not found');
      await pool.end();
      process.exit(1);
    }

    const updated = updateResult.rows[0];
    console.log('✅ Updated successfully:');
    console.log(`   Date: ${updated.shift_date}`);
    console.log(`   Start: ${updated.shift_start}`);
    console.log(`   End: ${updated.shift_end}`);
    console.log(`   Location: ${updated.location || 'N/A'}\n`);

    console.log('💡 Next steps:');
    console.log('   1. Refresh the admin dashboard and guard-ui');
    console.log('   2. Create a new overtime offer for this shift');
    console.log('   3. The offer will now show the correct end time (5:00 PM)\n');

    await pool.end();
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.code) console.error('   Code:', error.code);
    if (error.detail) console.error('   Detail:', error.detail);
    await pool.end();
    process.exit(1);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const shiftId = args[0];
  const newEndTime = args[1];

  if (!shiftId || !newEndTime) {
    console.error('❌ Usage: node fixSpecificShift.js <shiftId> <newEndTime>');
    console.error('   Example: node fixSpecificShift.js d36fe264-ae94-45ed-87eb-ca5b642bd956 17:00:00');
    process.exit(1);
  }

  await fixShift(shiftId, newEndTime);
  process.exit(0);
}

if (require.main === module) {
  main();
}

module.exports = { fixShift };
