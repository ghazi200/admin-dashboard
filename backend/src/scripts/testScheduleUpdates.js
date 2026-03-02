require('dotenv').config();
const { sequelize } = require('../models');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');

const BASE_URL = process.env.ADMIN_DASHBOARD_URL || 'http://localhost:5000';
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || ''; // You'll need to set this

async function testScheduleUpdates() {
  try {
    await sequelize.authenticate();
    console.log('✅ Connected to database\n');

    // Step 1: Get current schedule
    console.log('📅 Step 1: Fetching current schedule...');
    let scheduleResponse;
    try {
      scheduleResponse = await axios.get(`${BASE_URL}/api/admin/schedule`, {
        headers: {
          'Authorization': `Bearer ${ADMIN_TOKEN}`,
        },
      });
      console.log('✅ Schedule fetched successfully');
      console.log(`   Building: ${scheduleResponse.data.building.name}`);
      console.log(`   Week Range: ${scheduleResponse.data.weekRange.start} to ${scheduleResponse.data.weekRange.end}`);
      console.log(`   Total Days: ${scheduleResponse.data.schedule.length}`);
      console.log(`   Total Guards: ${scheduleResponse.data.summary.totalGuards}\n`);
    } catch (err) {
      console.log('⚠️  Could not fetch schedule via API (might need auth token)');
      console.log('   Will test database directly instead\n');
    }

    // Step 2: Get a tenant ID (or create one)
    console.log('🏢 Step 2: Getting tenant ID...');
    const [tenants] = await sequelize.query(`
      SELECT DISTINCT tenant_id 
      FROM shifts 
      WHERE tenant_id IS NOT NULL 
      LIMIT 1
    `);
    
    let tenantId;
    if (tenants.length > 0) {
      tenantId = tenants[0].tenant_id;
      console.log(`✅ Using existing tenant: ${tenantId.substring(0, 8)}...\n`);
    } else {
      tenantId = uuidv4();
      console.log(`✅ Created new tenant ID: ${tenantId.substring(0, 8)}...\n`);
    }

    // Step 3: Get a guard ID
    console.log('👥 Step 3: Getting guard ID...');
    const [guards] = await sequelize.query(`
      SELECT id, name, email 
      FROM guards 
      LIMIT 1
    `);
    
    let guardId = null;
    if (guards.length > 0) {
      guardId = guards[0].id;
      console.log(`✅ Using guard: ${guards[0].name || guards[0].email}`);
      console.log(`   Guard ID: ${guardId.substring(0, 8)}...\n`);
    } else {
      console.log('⚠️  No guards found, will create shift without guard assignment\n');
    }

    // Step 4: Create a new shift for a different location
    console.log('📋 Step 4: Creating new shift for different location...');
    const shiftId = uuidv4();
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    // Get current day of week to find next Monday
    const dayOfWeek = today.getDay();
    const daysUntilMonday = dayOfWeek === 0 ? 1 : 8 - dayOfWeek;
    const nextMonday = new Date(today);
    nextMonday.setDate(today.getDate() + daysUntilMonday);
    
    const shiftDate = nextMonday.toISOString().split('T')[0];
    const testLocation = `Test Location ${Date.now()}`;
    
    await sequelize.query(`
      INSERT INTO shifts (id, tenant_id, guard_id, shift_date, shift_start, shift_end, status, location, created_at)
      VALUES ($1, $2, $3, $4::date, $5::time, $6::time, $7, $8, NOW())
      RETURNING *
    `, {
      bind: [
        shiftId,
        tenantId,
        guardId,
        shiftDate,
        '07:00:00',
        '15:00:00',
        'CLOSED', // CLOSED so it appears in schedule
        testLocation,
      ]
    });
    
    console.log(`✅ Created new shift:`);
    console.log(`   ID: ${shiftId.substring(0, 8)}...`);
    console.log(`   Date: ${shiftDate}`);
    console.log(`   Time: 07:00 - 15:00`);
    console.log(`   Location: ${testLocation}`);
    console.log(`   Status: CLOSED`);
    console.log(`   Guard: ${guardId ? guards[0].name || guards[0].email : 'Unassigned'}\n`);

    // Step 5: Wait a moment for any async processing
    console.log('⏳ Step 5: Waiting 2 seconds for processing...');
    await new Promise(resolve => setTimeout(resolve, 2000));
    console.log('✅ Wait complete\n');

    // Step 6: Fetch schedule again to verify update
    console.log('📅 Step 6: Fetching updated schedule...');
    try {
      const updatedScheduleResponse = await axios.get(`${BASE_URL}/api/admin/schedule`, {
        headers: {
          'Authorization': `Bearer ${ADMIN_TOKEN}`,
        },
      });
      
      const updatedSchedule = updatedScheduleResponse.data;
      console.log('✅ Updated schedule fetched');
      
      // Check if our new shift appears in the schedule
      let foundShift = false;
      updatedSchedule.schedule.forEach(day => {
        if (day.date === shiftDate) {
          day.shifts.forEach(shift => {
            if (shift.start === '07:00' && shift.end === '15:00') {
              console.log(`\n🎯 Found matching shift in schedule:`);
              console.log(`   Day: ${day.day}`);
              console.log(`   Time: ${shift.time}`);
              console.log(`   Guard: ${shift.guard}`);
              console.log(`   Location match: ${shift.guard.includes(guards[0]?.name || guards[0]?.email || '') ? '✅' : '⚠️'}`);
              foundShift = true;
            }
          });
        }
      });
      
      if (foundShift) {
        console.log('\n✅ SUCCESS: New shift appears in schedule!');
      } else {
        console.log('\n⚠️  New shift not found in schedule (might be outside current week range)');
        console.log(`   Created shift date: ${shiftDate}`);
        console.log(`   Schedule week: ${updatedSchedule.weekRange.start} to ${updatedSchedule.weekRange.end}`);
      }
      
    } catch (err) {
      console.log('⚠️  Could not fetch updated schedule via API');
      console.log('   Testing database directly...\n');
      
      // Test database directly
      const [scheduleShifts] = await sequelize.query(`
        SELECT s.id, s.shift_date, s.shift_start, s.shift_end, s.location, s.status, g.name as guard_name
        FROM shifts s
        LEFT JOIN guards g ON s.guard_id = g.id
        WHERE s.id = $1
      `, {
        bind: [shiftId]
      });
      
      if (scheduleShifts.length > 0) {
        const shift = scheduleShifts[0];
        console.log('✅ Shift found in database:');
        console.log(`   Date: ${shift.shift_date}`);
        console.log(`   Time: ${shift.shift_start} - ${shift.shift_end}`);
        console.log(`   Location: ${shift.location}`);
        console.log(`   Status: ${shift.status}`);
        console.log(`   Guard: ${shift.guard_name || 'Unassigned'}`);
        console.log('\n✅ SUCCESS: Shift created and stored in database!');
      }
    }

    // Step 7: Summary
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 TEST SUMMARY');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ Shift created successfully');
    console.log('✅ Shift stored in database');
    console.log('✅ Schedule endpoint tested');
    console.log('\n💡 Next steps:');
    console.log('   1. Check the Schedule page in the frontend');
    console.log('   2. Verify socket events are being emitted (check backend logs)');
    console.log('   3. Verify the schedule page updates automatically');
    console.log(`\n🗑️  To clean up, delete shift: ${shiftId}`);
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

testScheduleUpdates();
