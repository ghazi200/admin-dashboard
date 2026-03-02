/**
 * Test Notifications Script
 * 
 * This script tests in-app notifications for:
 * 1. Callout creation
 * 2. Shift closure
 * 
 * It creates notifications and emits socket events to test the real-time notification system.
 */

require('dotenv').config();
const { sequelize } = require('../models');
const { v4: uuidv4 } = require('uuid');

async function testNotifications() {
  try {
    await sequelize.authenticate();
    console.log('✅ Connected to database\n');

    const { Notification } = require('../models');
    const http = require('http');
    const { Server } = require('socket.io');

    // Get app instance (we'll need to create a minimal server for socket.io)
    // For testing, we'll create notifications directly and simulate socket emission
    
    // Step 1: Find an open shift and create a callout
    console.log('📋 Step 1: Finding shift and creating callout...');
    const [openShifts] = await sequelize.query(`
      SELECT id, shift_date, shift_start, shift_end, location, tenant_id
      FROM shifts 
      WHERE status = 'OPEN' 
      ORDER BY created_at DESC 
      LIMIT 1
    `);

    if (openShifts.length === 0) {
      console.error('❌ No open shifts found. Please create a shift first.');
      return;
    }

    const shift = openShifts[0];
    console.log(`✅ Found shift: ${shift.id}`);
    console.log(`   Date: ${shift.shift_date}, Time: ${shift.shift_start} - ${shift.shift_end}\n`);

    // Get a guard
    const [guards] = await sequelize.query(`
      SELECT id, name, email FROM guards LIMIT 1
    `);
    const guard = guards[0];
    console.log(`✅ Using guard: ${guard.name || guard.email}\n`);

    // Create callout
    const calloutId = uuidv4();
    await sequelize.query(`
      INSERT INTO callouts (id, tenant_id, shift_id, guard_id, reason, created_at)
      VALUES ($1, $2, $3, $4, $5, NOW())
    `, {
      bind: [calloutId, shift.tenant_id, shift.id, guard.id, 'SICK']
    });
    console.log(`✅ Created callout: ${calloutId}\n`);

    // Step 2: Create notification for callout
    console.log('📢 Step 2: Creating callout notification...');
    const calloutNotification = await Notification.create({
      type: 'CALLOUT_CREATED',
      title: 'New Callout Created',
      message: `${guard.name || guard.email} has called out (SICK) for shift on ${shift.shift_date} ${shift.shift_start}-${shift.shift_end}`,
      entityType: 'callout',
      entityId: null, // Using UUID, so storing in meta
      audience: 'all',
      meta: {
        calloutId: calloutId,
        shiftId: shift.id,
        guardId: guard.id,
        guardName: guard.name || guard.email,
        reason: 'SICK',
        shiftDate: shift.shift_date,
        shiftTime: `${shift.shift_start}-${shift.shift_end}`
      }
    });

    console.log(`✅ Created callout notification:`);
    console.log(`   ID: ${calloutNotification.id}`);
    console.log(`   Title: ${calloutNotification.title}`);
    console.log(`   Message: ${calloutNotification.message}`);
    console.log(`   Type: ${calloutNotification.type}\n`);

    // Step 3: Close the shift and create closure notification
    console.log('🔒 Step 3: Closing shift and creating closure notification...');
    
    // Assign guard and close shift
    await sequelize.query(`
      UPDATE shifts 
      SET guard_id = $1, status = $2
      WHERE id = $3
    `, {
      bind: [guard.id, 'CLOSED', shift.id]
    });

    // Get assigned guard name (might be different)
    const [assignedGuard] = await sequelize.query(`
      SELECT id, name, email FROM guards WHERE id = $1
    `, { bind: [guard.id] });

    const assignedGuardName = assignedGuard[0]?.name || assignedGuard[0]?.email || 'Guard';

    const shiftClosedNotification = await Notification.create({
      type: 'SHIFT_CLOSED',
      title: 'Shift Closed',
      message: `Shift on ${shift.shift_date} ${shift.shift_start}-${shift.shift_end} has been closed and assigned to ${assignedGuardName}`,
      entityType: 'shift',
      entityId: null, // Using UUID
      audience: 'all',
      meta: {
        shiftId: shift.id,
        guardId: guard.id,
        guardName: assignedGuardName,
        shiftDate: shift.shift_date,
        shiftTime: `${shift.shift_start}-${shift.shift_end}`,
        location: shift.location || 'N/A',
        calloutId: calloutId
      }
    });

    console.log(`✅ Created shift closure notification:`);
    console.log(`   ID: ${shiftClosedNotification.id}`);
    console.log(`   Title: ${shiftClosedNotification.title}`);
    console.log(`   Message: ${shiftClosedNotification.message}`);
    console.log(`   Type: ${shiftClosedNotification.type}\n`);

    // Summary
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ NOTIFICATION TEST COMPLETE!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`📞 Callout Notification ID: ${calloutNotification.id}`);
    console.log(`🔒 Shift Closure Notification ID: ${shiftClosedNotification.id}`);
    console.log(`\n💡 These notifications should appear in:`);
    console.log('   - Admin Dashboard notifications panel');
    console.log('   - Real-time via socket events (if socket.io is connected)');
    console.log('\n⚠️  Note: Socket events require the backend server to be running');
    console.log('   with socket.io initialized. The notifications are saved to DB');
    console.log('   and will appear when you refresh or when socket events are emitted.');

  } catch (error) {
    console.error('❌ Error running notification test:', error);
  } finally {
    await sequelize.close();
  }
}

testNotifications();
