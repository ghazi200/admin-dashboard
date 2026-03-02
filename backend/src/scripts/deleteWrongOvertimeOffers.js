/**
 * Script to delete overtime offers with incorrect current_end_time values
 * For a shift ending at 5:00 PM (17:00:00), the current_end_time should be 22:00 UTC (10 PM UTC)
 * if the server is in EST (UTC-5)
 */

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

// Manually load DATABASE_URL from .env file
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
  process.exit(1);
}

async function deleteWrongOffers() {
  const pool = new Pool({ connectionString: databaseUrl });

  try {
    console.log('\n🔍 Finding overtime offers with incorrect times...\n');

    // Get all overtime offers for the specific shift
    const shiftId = 'd36fe264-ae94-45ed-87eb-ca5b642bd956';
    
    const result = await pool.query(
      `SELECT 
        id,
        current_end_time,
        proposed_end_time,
        extension_hours,
        status,
        created_at
      FROM overtime_offers
      WHERE shift_id = $1::uuid
      ORDER BY created_at DESC`,
      [shiftId]
    );

    if (result.rows.length === 0) {
      console.log('✅ No overtime offers found for this shift\n');
      await pool.end();
      return;
    }

    console.log(`Found ${result.rows.length} overtime offer(s) for this shift\n`);

    // For a shift ending at 5:00 PM (17:00:00), the correct current_end_time
    // should be stored as 22:00 UTC (10 PM UTC) if server is in EST (UTC-5)
    // But we'll delete all offers that don't match the expected pattern
    // or we can delete all offers for this shift and let them create new ones
    
    const offersToDelete = result.rows.filter(offer => {
      const currentEnd = new Date(offer.current_end_time);
      const utcHours = currentEnd.getUTCHours();
      
      // Correct time should be 22:00 UTC (10 PM UTC) for 5:00 PM EST
      // But we'll delete offers with clearly wrong times (like 3:00, 9:00, 15:00, 21:00 UTC)
      // These correspond to wrong shift_end values
      return utcHours !== 22; // Keep only offers with 22:00 UTC (correct)
    });

    if (offersToDelete.length === 0) {
      console.log('✅ All offers have correct times\n');
      await pool.end();
      return;
    }

    console.log(`⚠️  Found ${offersToDelete.length} offers with incorrect times:\n`);
    offersToDelete.forEach((offer, i) => {
      const currentEnd = new Date(offer.current_end_time);
      const utcHours = currentEnd.getUTCHours();
      console.log(`${i + 1}. Offer: ${offer.id.substring(0, 8)}... Status: ${offer.status}`);
      console.log(`   Current End UTC: ${utcHours}:${currentEnd.getUTCMinutes().toString().padStart(2, '0')}`);
      console.log(`   Created: ${offer.created_at}`);
    });

    console.log(`\n🗑️  Deleting ${offersToDelete.length} incorrect offers...\n`);

    let deleted = 0;
    let failed = 0;

    for (const offer of offersToDelete) {
      try {
        await pool.query(
          `DELETE FROM overtime_offers WHERE id = $1::uuid`,
          [offer.id]
        );
        console.log(`✅ Deleted offer ${offer.id.substring(0, 8)}... (Status: ${offer.status})`);
        deleted++;
      } catch (error) {
        console.error(`❌ Failed to delete offer ${offer.id.substring(0, 8)}...:`, error.message);
        failed++;
      }
    }

    console.log(`\n✅ Deleted ${deleted} offers`);
    if (failed > 0) {
      console.log(`⚠️  ${failed} offers failed to delete`);
    }

    // Check remaining offers
    const remainingResult = await pool.query(
      `SELECT COUNT(*) as count FROM overtime_offers WHERE shift_id = $1::uuid`,
      [shiftId]
    );
    const remaining = parseInt(remainingResult.rows[0]?.count || 0);

    console.log(`\n📊 Remaining offers for this shift: ${remaining}`);
    console.log('\n💡 Next steps:');
    console.log('   1. Refresh the guard-ui');
    console.log('   2. Create a new overtime offer');
    console.log('   3. It will now show the correct times (5:00 PM)\n');

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
  await deleteWrongOffers();
  process.exit(0);
}

if (require.main === module) {
  main();
}

module.exports = { deleteWrongOffers };
