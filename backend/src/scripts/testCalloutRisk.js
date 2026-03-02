/**
 * Test Callout Risk Prediction
 * 
 * Creates test data to demonstrate the callout risk prediction system:
 * 1. Creates a guard with callout history (to trigger high risk)
 * 2. Creates upcoming shifts assigned to that guard
 * 3. Verifies risk scores are calculated
 */

require('dotenv').config();
const { sequelize } = require('../models');
const { v4: uuidv4 } = require('uuid');
const calloutRiskService = require('../services/calloutRiskPrediction.service');

async function testCalloutRisk() {
  try {
    await sequelize.authenticate();
    console.log('✅ Connected to database\n');

    // Step 1: Get or create a test guard
    console.log('👥 Step 1: Getting/Creating test guard...');
    const [existingGuards] = await sequelize.query(`
      SELECT id, name, email
      FROM guards
      LIMIT 1
    `);

    let guardId;
    let guardName;
    
    if (existingGuards.length > 0) {
      guardId = existingGuards[0].id;
      guardName = existingGuards[0].name || existingGuards[0].email;
      console.log(`✅ Using existing guard: ${guardName} (${guardId.substring(0, 8)}...)\n`);
    } else {
      guardId = uuidv4();
      guardName = `Test Guard ${Date.now()}`;
      await sequelize.query(`
        INSERT INTO guards (id, name, email, created_at)
        VALUES ($1, $2, $3, NOW())
      `, {
        bind: [guardId, guardName, `${guardName.toLowerCase().replace(/\s+/g, '.')}@test.com`]
      });
      console.log(`✅ Created test guard: ${guardName} (${guardId.substring(0, 8)}...)\n`);
    }

    // Step 2: Create callout history for this guard (to trigger high risk)
    console.log('📞 Step 2: Creating callout history...');
    const today = new Date();
    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const fourteenDaysAgo = new Date(today);
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
    const twentyOneDaysAgo = new Date(today);
    twentyOneDaysAgo.setDate(twentyOneDaysAgo.getDate() - 21);

    // Get tenant ID
    const [tenants] = await sequelize.query(`
      SELECT DISTINCT tenant_id 
      FROM shifts 
      WHERE tenant_id IS NOT NULL 
      LIMIT 1
    `);
    const tenantId = tenants.length > 0 ? tenants[0].tenant_id : uuidv4();

    // Create 3 callouts in the last 30 days (this will trigger high risk)
    // Use valid reason values from database
    const calloutReasons = ['SICK', 'PERSONAL', 'EMERGENCY'];
    const calloutDates = [sevenDaysAgo, fourteenDaysAgo, twentyOneDaysAgo];
    
    for (let i = 0; i < 3; i++) {
      const calloutId = uuidv4();
      // Create a shift first for the callout
      const shiftId = uuidv4();
      await sequelize.query(`
        INSERT INTO shifts (id, tenant_id, guard_id, shift_date, shift_start, shift_end, status, location, created_at)
        VALUES ($1, $2, $3, $4::date, $5::time, $6::time, $7, $8, NOW())
      `, {
        bind: [
          shiftId,
          tenantId,
          guardId,
          calloutDates[i].toISOString().split('T')[0],
          '07:00:00',
          '15:00:00',
          'CLOSED',
          'Test Location'
        ]
      });

      // Create the callout
      await sequelize.query(`
        INSERT INTO callouts (id, tenant_id, shift_id, guard_id, reason, created_at)
        VALUES ($1, $2, $3, $4, $5, $6)
      `, {
        bind: [
          calloutId,
          tenantId,
          shiftId,
          guardId,
          calloutReasons[i],
          calloutDates[i]
        ]
      });
    }
    console.log(`✅ Created 3 callouts in last 30 days for ${guardName}\n`);

    // Step 3: Create upcoming shifts for this guard (next 7 days)
    console.log('📅 Step 3: Creating upcoming shifts...');
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    // Get Monday of next week
    const dayOfWeek = tomorrow.getDay();
    const mondayOffset = dayOfWeek === 0 ? 1 : 8 - dayOfWeek;
    const nextMonday = new Date(tomorrow);
    nextMonday.setDate(tomorrow.getDate() + mondayOffset);
    
    const shiftDates = [
      nextMonday.toISOString().split('T')[0], // Monday
      new Date(nextMonday.getTime() + 24 * 60 * 60 * 1000).toISOString().split('T')[0], // Tuesday
    ];

    const shiftTimes = [
      { start: '07:00:00', end: '15:00:00' }, // Morning shift
      { start: '15:00:00', end: '23:00:00' }, // Afternoon shift
    ];

    const createdShifts = [];
    for (let i = 0; i < shiftDates.length; i++) {
      const shiftId = uuidv4();
      await sequelize.query(`
        INSERT INTO shifts (id, tenant_id, guard_id, shift_date, shift_start, shift_end, status, location, created_at)
        VALUES ($1, $2, $3, $4::date, $5::time, $6::time, $7, $8, NOW())
        RETURNING *
      `, {
        bind: [
          shiftId,
          tenantId,
          guardId,
          shiftDates[i],
          shiftTimes[i].start,
          shiftTimes[i].end,
          'CLOSED',
          'Main Office Building'
        ]
      });
      createdShifts.push({
        id: shiftId,
        date: shiftDates[i],
        time: `${shiftTimes[i].start} - ${shiftTimes[i].end}`
      });
      console.log(`✅ Created shift: ${shiftDates[i]} ${shiftTimes[i].start}-${shiftTimes[i].end}`);
    }

    console.log(`\n✅ Created ${createdShifts.length} upcoming shifts\n`);

    // Step 4: Calculate risk for the created shifts
    console.log('📊 Step 4: Calculating risk scores...\n');
    for (const shift of createdShifts) {
      const shiftData = {
        id: shift.id,
        guard_id: guardId,
        shift_date: shift.date,
        shift_start: shift.time.split(' - ')[0],
        shift_end: shift.time.split(' - ')[1],
        location: 'Main Office Building',
        tenant_id: tenantId,
        status: 'CLOSED'
      };

      try {
        const risk = await calloutRiskService.calculateCalloutRisk(
          shiftData,
          { sequelize }
        );

        console.log(`📅 Shift: ${shift.date} ${shift.time}`);
        console.log(`   Guard: ${risk.guardName}`);
        console.log(`   Risk Score: ${risk.score}%`);
        console.log(`   Recommendation: ${risk.recommendation}`);
        console.log(`   Message: ${risk.message}`);
        console.log(`   Factors:`);
        Object.entries(risk.factors).forEach(([key, factor]) => {
          console.log(`     • ${factor.description}: +${factor.value} pts`);
        });
        console.log('');
      } catch (err) {
        console.error(`❌ Error calculating risk for shift ${shift.id}:`, err.message);
      }
    }

    // Step 5: Get backup suggestions
    console.log('💡 Step 5: Getting backup suggestions...\n');
    const firstShift = {
      id: createdShifts[0].id,
      guard_id: guardId,
      shift_date: createdShifts[0].date,
      shift_start: shiftTimes[0].start,
      shift_end: shiftTimes[0].end,
      location: 'Main Office Building',
      tenant_id: tenantId,
      status: 'CLOSED'
    };

    try {
      const backups = await calloutRiskService.getBackupSuggestions(
        firstShift,
        { sequelize },
        3
      );

      if (backups.length > 0) {
        console.log(`✅ Found ${backups.length} backup guard suggestions:`);
        backups.forEach((backup, idx) => {
          console.log(`   ${idx + 1}. ${backup.guardName} - ${backup.matchQuality}`);
        });
      } else {
        console.log('⚠️  No backup guards available');
      }
    } catch (err) {
      console.warn('⚠️  Could not get backup suggestions:', err.message);
    }

    // Summary
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ TEST COMPLETE!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`\n📊 Test Data Created:`);
    console.log(`   Guard: ${guardName}`);
    console.log(`   Callouts: 3 in last 30 days`);
    console.log(`   Upcoming Shifts: ${createdShifts.length}`);
    console.log(`\n💡 Next Steps:`);
    console.log(`   1. Restart backend server (if not already running)`);
    console.log(`   2. Navigate to /callout-risk page in frontend`);
    console.log(`   3. You should see high-risk shifts for ${guardName}`);
    console.log(`   4. Risk scores should be 70%+ due to callout history`);
    console.log(`\n📅 Shift Dates:`);
    createdShifts.forEach(s => {
      console.log(`   • ${s.date} ${s.time}`);
    });
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    await sequelize.close();
    process.exit(0);
  } catch (err) {
    console.error('❌ Test failed:', err.message);
    console.error(err.stack);
    await sequelize.close();
    process.exit(1);
  }
}

testCalloutRisk();
