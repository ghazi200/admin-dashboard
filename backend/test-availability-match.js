/**
 * Test to verify availability log matching
 */

const models = require('./src/models');

async function testMatching() {
  try {
    console.log('🧪 Testing availability log matching...\n');

    await new Promise(resolve => setTimeout(resolve, 1000));
    const { sequelize } = models;
    const { Guard, AvailabilityLog } = models;
    const crypto = require('crypto');

    // Get a guard
    const guard = await Guard.findOne({ where: { active: true }, limit: 1 });
    if (!guard) {
      console.log('❌ No active guards found');
      return;
    }

    console.log('✅ Found guard:', guard.name, `(${guard.id})`);

    // Calculate the hash
    const hash = crypto.createHash('md5').update(guard.id).digest('hex');
    const guardIdInt = parseInt(hash.substring(0, 8), 16) % 2147483647;
    console.log('   Hash:', hash);
    console.log('   GuardIdInt:', guardIdInt);

    // Check if there's an availability log for this guard
    const logs = await sequelize.query(`
      SELECT "guardId", "to" as is_available, "createdAt"
      FROM availability_logs
      WHERE "guardId" = $1
      ORDER BY "createdAt" DESC
      LIMIT 5
    `, {
      bind: [guardIdInt],
      type: sequelize.QueryTypes.SELECT
    });

    console.log(`\n📋 Found ${logs.length} availability logs for guardId ${guardIdInt}:`);
    logs.forEach((log, i) => {
      console.log(`   ${i + 1}. Availability: ${log.is_available}, Created: ${log.createdAt}`);
    });

    if (logs.length === 0) {
      console.log('\n⚠️  No availability logs found for this guard!');
      console.log('   This means when the guard becomes active, they will default to unavailable.');
      console.log('   Solution: Set the guard\'s availability to create a log entry.');
    } else {
      const mostRecent = logs[0];
      console.log(`\n✅ Most recent log: availability = ${mostRecent.is_available}`);
      console.log(`   This guard should be counted as ${mostRecent.is_available ? 'AVAILABLE' : 'UNAVAILABLE'}`);
    }

    // Now test the dashboard query logic
    console.log('\n🔍 Testing dashboard query logic...');
    const guardUuids = [guard.id];
    const guardIdInts = guardUuids.map(uuid => {
      const h = crypto.createHash('md5').update(uuid).digest('hex');
      return parseInt(h.substring(0, 8), 16) % 2147483647;
    });

    const [recentLogs] = await sequelize.query(`
      SELECT DISTINCT ON ("guardId")
        "guardId",
        "to" as is_available,
        "createdAt"
      FROM availability_logs
      WHERE "guardId" = ANY($1::int[])
        AND "guardId" > 1000
      ORDER BY "guardId", "createdAt" DESC
    `, {
      bind: [guardIdInts],
      type: sequelize.QueryTypes.SELECT
    });

    console.log(`   Query found ${recentLogs.length} logs`);
    const availabilityByIntId = new Map();
    recentLogs.forEach(log => {
      availabilityByIntId.set(log.guardId, log.is_available);
    });

    const availability = availabilityByIntId.get(guardIdInt);
    console.log(`   Guard ${guard.name} -> hash ${guardIdInt} -> availability: ${availability}`);
    
    if (availability === true) {
      console.log('   ✅ Should be counted as AVAILABLE');
    } else if (availability === false) {
      console.log('   ❌ Should be counted as UNAVAILABLE');
    } else {
      console.log('   ⚠️  No log found - will default to UNAVAILABLE');
    }

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error.stack);
  } finally {
    await sequelize.close();
  }
}

testMatching();
