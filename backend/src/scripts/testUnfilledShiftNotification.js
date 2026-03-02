/**
 * Test script for Unfilled Shift Notification System
 * 
 * This script:
 * 1. Creates or finds an unfilled shift starting in 30-60 minutes
 * 2. Runs the unfilled shift checker
 * 3. Verifies that a notification was created
 */

require('dotenv').config();
const { sequelize } = require('../models');
const unfilledShiftNotification = require('../services/unfilledShiftNotification.service');

// Mock app object for notify function
const mockApp = {
  locals: {
    models: require('../models'),
    io: {
      to: (room) => ({
        emit: (event, data) => {
          console.log(`📤 Would emit ${event} to ${room}:`, data?.title || data?.type);
        }
      })
    }
  }
};

async function testUnfilledShiftNotification() {
  try {
    await sequelize.authenticate();
    console.log('✅ Connected to database\n');

    const models = require('../models');
    const { Notification } = models;

    // Step 1: Create or find an unfilled shift starting in 30-60 minutes
    console.log('📋 Step 1: Setting up test shift...\n');
    
    const now = new Date();
    const thirtyMinutesFromNow = new Date(now.getTime() + 35 * 60 * 1000); // 35 minutes from now
    const shiftStartTime = thirtyMinutesFromNow.toTimeString().substring(0, 5); // HH:MM format
    const shiftEndTime = new Date(now.getTime() + 35 * 60 * 1000 + 8 * 60 * 60 * 1000).toTimeString().substring(0, 5); // 8 hours later
    const shiftDate = now.toISOString().split('T')[0]; // YYYY-MM-DD format

    // Check if a test shift already exists
    const [existingShifts] = await sequelize.query(`
      SELECT id, shift_date, shift_start, shift_end, status, guard_id
      FROM shifts
      WHERE shift_date = $1
        AND shift_start = $2
        AND status = 'OPEN'
        AND guard_id IS NULL
      LIMIT 1
    `, {
      bind: [shiftDate, shiftStartTime]
    });

    let testShift;
    if (existingShifts.length > 0) {
      testShift = existingShifts[0];
      console.log(`✅ Found existing unfilled shift:`);
      console.log(`   ID: ${testShift.id}`);
      console.log(`   Date: ${testShift.shift_date}`);
      console.log(`   Time: ${testShift.shift_start} - ${testShift.shift_end}`);
      console.log(`   Status: ${testShift.status}`);
      console.log(`   Guard ID: ${testShift.guard_id || 'NULL (unfilled)'}\n`);
    } else {
      // Create a new test shift
      const { v4: uuidv4 } = require('uuid');
      const shiftId = uuidv4();
      
      // Get a tenant ID (or use null)
      const [tenants] = await sequelize.query(`
        SELECT id FROM tenants LIMIT 1
      `);
      const tenantId = tenants.length > 0 ? tenants[0].id : null;

      await sequelize.query(`
        INSERT INTO shifts (id, tenant_id, shift_date, shift_start, shift_end, status, guard_id, location)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `, {
        bind: [
          shiftId,
          tenantId,
          shiftDate,
          shiftStartTime,
          shiftEndTime,
          'OPEN',
          null, // No guard assigned
          'Test Location - Unfilled Shift'
        ]
      });

      testShift = {
        id: shiftId,
        shift_date: shiftDate,
        shift_start: shiftStartTime,
        shift_end: shiftEndTime,
        status: 'OPEN',
        guard_id: null
      };

      console.log(`✅ Created test unfilled shift:`);
      console.log(`   ID: ${testShift.id}`);
      console.log(`   Date: ${testShift.shift_date}`);
      console.log(`   Time: ${testShift.shift_start} - ${testShift.shift_end}`);
      console.log(`   Status: ${testShift.status}`);
      console.log(`   Guard ID: NULL (unfilled)\n`);
    }

    // Calculate minutes until shift starts
    const shiftDateTime = new Date(`${testShift.shift_date}T${testShift.shift_start}`);
    const minutesUntilStart = Math.round((shiftDateTime - now) / (1000 * 60));
    console.log(`⏰ Shift starts in ${minutesUntilStart} minutes\n`);

    if (minutesUntilStart < 30 || minutesUntilStart > 60) {
      console.log(`⚠️  Warning: Shift is ${minutesUntilStart} minutes away.`);
      console.log(`   The checker only notifies for shifts starting in 30-60 minutes.`);
      console.log(`   This test may not create a notification.\n`);
    }

    // Step 2: Clear any existing notifications for this shift (to test fresh notification)
    console.log('🧹 Step 2: Cleaning up existing notifications...\n');
    // Use Sequelize model to delete (handles column name mapping)
    try {
      const existing = await Notification.findAll({
        where: {
          type: 'UNFILLED_SHIFT_WARNING'
        }
      });
      
      // Filter by meta.shiftId in JavaScript
      const toDelete = existing.filter(n => (n.meta || {}).shiftId === testShift.id);
      if (toDelete.length > 0) {
        await Notification.destroy({
          where: {
            id: toDelete.map(n => n.id)
          }
        });
        console.log(`✅ Deleted ${toDelete.length} existing notification(s)\n`);
      } else {
        console.log('✅ No existing notifications to delete\n');
      }
    } catch (err) {
      console.log('⚠️  Could not delete existing notifications (may not exist)\n');
    }
    console.log('✅ Cleaned up existing notifications\n');

    // Step 3: Run the unfilled shift checker
    console.log('🔍 Step 3: Running unfilled shift checker...\n');
    const notifications = await unfilledShiftNotification.checkUnfilledShifts(models, mockApp);
    
    if (notifications.length > 0) {
      console.log(`✅ Checker found ${notifications.length} unfilled shift(s) and created notification(s):\n`);
      notifications.forEach((notif, index) => {
        console.log(`   ${index + 1}. Shift ID: ${notif.shiftId}`);
        console.log(`      Location: ${notif.location}`);
        console.log(`      Time: ${notif.shiftTime}`);
        console.log(`      Minutes until start: ${notif.minutesUntilStart}\n`);
      });
    } else {
      console.log('⚠️  No notifications created.');
      if (minutesUntilStart < 30 || minutesUntilStart > 60) {
        console.log('   This is expected - shift is outside the 30-60 minute window.\n');
      } else {
        console.log('   This might indicate an issue. Check the logs above.\n');
      }
    }

    // Step 4: Verify notification was created in database
    console.log('🔍 Step 4: Verifying notification in database...\n');
    
    // Use Sequelize model to query (handles column name mapping)
    const allNotifications = await Notification.findAll({
      where: {
        type: 'UNFILLED_SHIFT_WARNING'
      },
      order: [['createdAt', 'DESC']],
      limit: 10
    });
    
    // Filter by meta.shiftId in JavaScript
    const dbNotifications = allNotifications.filter(n => (n.meta || {}).shiftId === testShift.id);

    if (dbNotifications.length > 0) {
      const notification = dbNotifications[0];
      const meta = notification.meta || {};
      console.log('✅ Notification found in database:');
      console.log(`   ID: ${notification.id}`);
      console.log(`   Type: ${notification.type}`);
      console.log(`   Title: ${notification.title}`);
      console.log(`   Message: ${notification.message.substring(0, 100)}...`);
      console.log(`   Priority: ${notification.priority || 'N/A'}`);
      console.log(`   Category: ${notification.category || 'N/A'}`);
      console.log(`   Urgency: ${notification.urgency || 'N/A'}`);
      console.log(`   Audience: ${notification.audience || 'N/A'}`);
      console.log(`   Shift ID: ${meta.shiftId || 'N/A'}`);
      console.log(`   Minutes until start: ${meta.minutesUntilStart || 'N/A'}`);
      console.log(`   Created: ${notification.createdAt ? new Date(notification.createdAt).toLocaleString() : 'N/A'}\n`);
      
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('✅ TEST COMPLETED SUCCESSFULLY!');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(`📢 Notification ID: ${notification.id}`);
      console.log(`📅 Shift ID: ${testShift.id}`);
      console.log(`\n💡 Check the notification bell (🔔) in the admin dashboard to see the notification.`);
    } else {
      console.log('⚠️  Notification not found in database.');
      if (minutesUntilStart < 30 || minutesUntilStart > 60) {
        console.log('   This is expected - shift is outside the 30-60 minute window.');
        console.log('   Try adjusting the shift time to be 30-60 minutes from now.\n');
      } else {
        console.log('   This might indicate an issue. Check the logs above for errors.\n');
      }
    }

  } catch (error) {
    console.error('❌ Test failed:', error);
    console.error(error.stack);
  } finally {
    await sequelize.close();
  }
}

// Run the test
testUnfilledShiftNotification();
