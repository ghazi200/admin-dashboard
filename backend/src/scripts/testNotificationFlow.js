/**
 * Complete Notification Test Flow
 * 
 * Tests the full notification system:
 * 1. Creates a callout and notification
 * 2. Closes shift and creates closure notification
 * 3. Verifies notifications appear in database
 * 
 * This simulates the real flow that should happen automatically
 * when callouts are created and shifts are closed.
 */

require('dotenv').config();
const { sequelize, Notification } = require('../models');
const { v4: uuidv4 } = require('uuid');
const notify = require('../utils/notify').notify;

// Mock app object for notify function
const mockApp = {
  locals: {
    models: { Notification },
    io: null // Socket.io would be set in real server
  }
};

async function testNotificationFlow() {
  try {
    await sequelize.authenticate();
    console.log('✅ Connected to database\n');

    // Step 1: Find an open shift
    console.log('📋 Step 1: Finding an open shift...');
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

    // Step 2: Get a guard
    const [guards] = await sequelize.query(`
      SELECT id, name, email FROM guards LIMIT 1
    `);
    const guard = guards[0];
    console.log(`✅ Using guard: ${guard.name || guard.email}\n`);

    // Step 3: Create callout
    console.log('📞 Step 3: Creating callout...');
    const calloutId = uuidv4();
    await sequelize.query(`
      INSERT INTO callouts (id, tenant_id, shift_id, guard_id, reason, created_at)
      VALUES ($1, $2, $3, $4, $5, NOW())
    `, {
      bind: [calloutId, shift.tenant_id, shift.id, guard.id, 'SICK']
    });
    console.log(`✅ Created callout: ${calloutId}\n`);

    // Step 4: Create callout notification (using notify utility)
    console.log('📢 Step 4: Creating callout notification...');
    const calloutNotification = await notify(mockApp, {
      type: 'CALLOUT_CREATED',
      title: 'New Callout Created',
      message: `${guard.name || guard.email} has called out (SICK) for shift on ${shift.shift_date} ${shift.shift_start}-${shift.shift_end}`,
      entityType: 'callout',
      entityId: null,
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
    console.log(`   Type: ${calloutNotification.type}\n`);

    // Step 5: Close shift and assign guard
    console.log('🔒 Step 5: Closing shift and assigning guard...');
    await sequelize.query(`
      UPDATE shifts 
      SET guard_id = $1, status = $2
      WHERE id = $3
    `, {
      bind: [guard.id, 'CLOSED', shift.id]
    });
    console.log(`✅ Shift closed and guard assigned\n`);

    // Step 6: Create shift closure notification (simulating the actual updateShift behavior)
    console.log('📢 Step 6: Creating shift closure notification (with callout tracking)...');
    
    // Check if there was a callout for this shift (like the real updateShift does)
    const [calloutCheck] = await sequelize.query(`
      SELECT c.id, c.guard_id, c.reason, g.name as guard_name, g.email as guard_email
      FROM callouts c
      LEFT JOIN guards g ON c.guard_id = g.id
      WHERE c.shift_id = $1
      ORDER BY c.created_at DESC
      LIMIT 1
    `, { bind: [shift.id] });
    
    let notificationMessage;
    let notificationTitle;
    const meta = {
      shiftId: shift.id,
      assignedGuardId: guard.id,
      assignedGuardName: guard.name || guard.email,
      shiftDate: shift.shift_date,
      shiftTime: `${shift.shift_start}-${shift.shift_end}`,
      location: shift.location || null,
    };
    
    if (calloutCheck.length > 0) {
      // There was a callout - link it to the assignment
      const callout = calloutCheck[0];
      const calledOutGuardName = callout.guard_name || callout.guard_email || "Guard";
      const calloutReason = callout.reason || "Unknown reason";
      
      notificationTitle = "Shift Filled After Callout";
      notificationMessage = `${calledOutGuardName}'s shift (${calloutReason}) on ${shift.shift_date} ${shift.shift_start}-${shift.shift_end} has been assigned to ${guard.name || guard.email}`;
      
      meta.calloutId = callout.id;
      meta.calledOutGuardId = callout.guard_id;
      meta.calledOutGuardName = calledOutGuardName;
      meta.calloutReason = calloutReason;
      
      console.log(`   📋 Found callout from: ${calledOutGuardName} (${calloutReason})`);
    } else {
      // No callout - just a regular shift closure
      notificationTitle = "Shift Closed";
      notificationMessage = `Shift on ${shift.shift_date} ${shift.shift_start}-${shift.shift_end} has been closed and assigned to ${guard.name || guard.email}`;
    }
    
    const shiftClosedNotification = await notify(mockApp, {
      type: 'SHIFT_CLOSED',
      title: notificationTitle,
      message: notificationMessage,
      entityType: 'shift',
      entityId: null,
      audience: 'all',
      meta: meta
    });

    console.log(`✅ Created shift closure notification:`);
    console.log(`   ID: ${shiftClosedNotification.id}`);
    console.log(`   Title: ${shiftClosedNotification.title}`);
    console.log(`   Message: ${shiftClosedNotification.message}`);
    console.log(`   Type: ${shiftClosedNotification.type}\n`);

    // Step 7: Verify notifications
    console.log('🔍 Step 7: Verifying notifications in database...');
    const recentNotifications = await Notification.findAll({
      order: [['createdAt', 'DESC']],
      limit: 5,
      attributes: ['id', 'type', 'title', 'message', 'createdAt']
    });

    console.log(`✅ Found ${recentNotifications.length} recent notifications:\n`);
    recentNotifications.forEach((n, i) => {
      console.log(`   ${i + 1}. [${n.type}] ${n.title}`);
      console.log(`      ${n.message.substring(0, 70)}...`);
      console.log(`      Created: ${new Date(n.createdAt).toLocaleString()}\n`);
    });

    // Summary
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ NOTIFICATION TEST FLOW COMPLETE!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`📞 Callout Notification ID: ${calloutNotification.id}`);
    console.log(`🔒 Shift Closure Notification ID: ${shiftClosedNotification.id}`);
    console.log(`\n💡 These notifications should appear in:`);
    console.log('   - Admin Dashboard notifications bell icon (🔔)');
    console.log('   - Real-time via socket events (when backend server is running)');
    console.log('   - Notification dropdown in the navbar');
    console.log('\n📋 To view notifications:');
    console.log('   1. Open admin dashboard');
    console.log('   2. Click the 🔔 bell icon in the navbar');
    console.log('   3. You should see both notifications');
    console.log('   4. Click on a notification to mark it as read');

  } catch (error) {
    console.error('❌ Error running notification test:', error);
  } finally {
    await sequelize.close();
  }
}

testNotificationFlow();
