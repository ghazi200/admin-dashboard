/**
 * Simple test to check if availability endpoint works and returns data
 */

const models = require('./src/models');

async function testAvailability() {
  try {
    console.log('🧪 Testing guard availability endpoint...\n');

    // Wait for models to initialize
    await new Promise(resolve => setTimeout(resolve, 1000));

    const { sequelize } = models;
    const { Guard, AvailabilityLog, Admin } = models;
    const admin = await Admin.findOne({ limit: 1 });
    
    if (!admin) {
      console.log('❌ No admin found in database');
      return;
    }

    console.log('✅ Found admin:', admin.email);
    console.log('   Role:', admin.role);
    console.log('   Tenant ID:', admin.tenant_id);

    // Simulate the getGuardAvailability function
    const { getTenantWhere, getTenantFilter } = require('./src/utils/tenantFilter');

    const mockReq = {
      admin: {
        id: admin.id,
        role: admin.role,
        tenant_id: admin.tenant_id,
      },
      app: {
        locals: { models: { Guard, AvailabilityLog, sequelize } }
      }
    };

    const tenantWhere = getTenantWhere(mockReq.admin);
    const whereClause = { active: true };
    if (tenantWhere) {
      Object.assign(whereClause, tenantWhere);
    }

    console.log('\n📊 Querying guards...');
    const activeGuards = await Guard.findAll({
      where: whereClause,
      attributes: ['id', 'name', 'active', 'tenant_id'],
      limit: 5
    });

    console.log(`✅ Found ${activeGuards.length} active guards`);
    activeGuards.forEach(g => {
      console.log(`   - ${g.name} (${g.id.substring(0, 8)}...) - tenant: ${g.tenant_id}`);
    });

    if (activeGuards.length === 0) {
      console.log('\n⚠️  No active guards found - cannot test availability');
      return;
    }

    // Test the availability query
    const crypto = require('crypto');
    const guardUuids = activeGuards.map(g => g.id);
    const guardIdInts = guardUuids.map(uuid => {
      const hash = crypto.createHash('md5').update(uuid).digest('hex');
      return parseInt(hash.substring(0, 8), 16) % 2147483647;
    });

    console.log('\n🔍 Querying availability logs...');
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [recentLogs] = await sequelize.query(`
      SELECT DISTINCT ON ("guardId")
        "guardId",
        "to" as is_available,
        "createdAt"
      FROM availability_logs
      WHERE "createdAt" >= $1
        AND "guardId" = ANY($2::int[])
        AND "guardId" > 1000
      ORDER BY "guardId", "createdAt" DESC
    `, { 
      bind: [thirtyDaysAgo, guardIdInts]
    });

    console.log(`✅ Found ${recentLogs.length} availability logs for these guards`);

    // Match guards with availability
    const availabilityByIntId = new Map();
    recentLogs.forEach(log => {
      availabilityByIntId.set(log.guardId, log.is_available);
    });

    let available = 0;
    let unavailable = 0;

    activeGuards.forEach(guard => {
      const hash = crypto.createHash('md5').update(guard.id).digest('hex');
      const guardIdInt = parseInt(hash.substring(0, 8), 16) % 2147483647;
      const availability = availabilityByIntId.get(guardIdInt);

      if (availability === true) {
        available++;
        console.log(`   ✅ ${guard.name} is AVAILABLE`);
      } else if (availability === false) {
        unavailable++;
        console.log(`   ❌ ${guard.name} is UNAVAILABLE`);
      } else {
        unavailable++;
        console.log(`   ⚠️  ${guard.name} has NO availability log (defaulted to unavailable)`);
      }
    });

    console.log('\n📊 Summary:');
    console.log(`   Total active guards: ${activeGuards.length}`);
    console.log(`   Available: ${available}`);
    console.log(`   Unavailable: ${unavailable}`);

    console.log('\n✅ Test complete!');
    console.log('\n💡 To test updates:');
    console.log('   1. Update a guard\'s availability via the API');
    console.log('   2. Wait 2-3 seconds');
    console.log('   3. Check the dashboard - it should show updated counts');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error.stack);
  } finally {
    const { sequelize } = models;
    if (sequelize) {
      await sequelize.close();
    }
  }
}

testAvailability();
