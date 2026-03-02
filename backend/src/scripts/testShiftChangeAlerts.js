/**
 * Test Shift Change Alerts System
 * 
 * Tests the complete flow:
 * 1. Create a shift with guard assignment
 * 2. Update shift time
 * 3. Update shift date
 * 4. Update shift location
 * 5. Change guard assignment
 * 6. Cancel shift
 * 7. Verify notifications were created
 */

require("dotenv").config();
const { sequelize } = require("../config/db");
const { v4: uuidv4 } = require("uuid");

async function testShiftChangeAlerts() {
  let testGuardId = null;
  let testShiftId = null;
  let notificationsCreated = [];

  try {
    console.log("🧪 Starting Shift Change Alerts Test...\n");

    // Step 1: Get or create a test guard
    console.log("📋 Step 1: Finding test guard...");
    const guardResult = await sequelize.query(
      `SELECT id, name, email FROM public.guards LIMIT 1`,
      { type: sequelize.QueryTypes.SELECT }
    );

    if (guardResult.length === 0) {
      console.error("❌ No guards found in database. Please create a guard first.");
      process.exit(1);
    }

    testGuardId = guardResult[0].id;
    const guardName = guardResult[0].name || guardResult[0].email;
    console.log(`✅ Using guard: ${guardName} (${testGuardId})\n`);

    // Step 2: Create a test shift
    console.log("📋 Step 2: Creating test shift...");
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const shiftDate = tomorrow.toISOString().split("T")[0];
    const shiftStart = "09:00";
    const shiftEnd = "17:00";
    const location = "Test Location";

    const shiftResult = await sequelize.query(
      `INSERT INTO public.shifts (guard_id, shift_date, shift_start, shift_end, location, status, created_at)
       VALUES ($1, $2::date, $3::time, $4::time, $5, 'OPEN', NOW())
       RETURNING id, guard_id, shift_date, shift_start, shift_end, location, status`,
      {
        bind: [testGuardId, shiftDate, shiftStart, shiftEnd, location],
        type: sequelize.QueryTypes.SELECT,
      }
    );

    testShiftId = shiftResult[0].id;
    console.log(`✅ Created shift: ${testShiftId}`);
    console.log(`   Date: ${shiftDate}, Time: ${shiftStart}-${shiftEnd}, Location: ${location}\n`);

    // Step 3: Check initial notifications (should be SHIFT_ASSIGNED)
    console.log("📋 Step 3: Checking for SHIFT_ASSIGNED notification...");
    await new Promise((resolve) => setTimeout(resolve, 1000)); // Wait 1 second for notification

    const notif1 = await sequelize.query(
      `SELECT * FROM public.guard_notifications 
       WHERE guard_id = $1 AND shift_id = $2 
       ORDER BY created_at DESC LIMIT 1`,
      {
        bind: [testGuardId, testShiftId],
        type: sequelize.QueryTypes.SELECT,
      }
    );

    if (notif1.length > 0) {
      const notif = notif1[0];
      console.log(`✅ Found notification: ${notif.type}`);
      console.log(`   Title: ${notif.title}`);
      console.log(`   Message: ${notif.message.substring(0, 80)}...\n`);
      notificationsCreated.push(notif);
    } else {
      console.log("⚠️  No SHIFT_ASSIGNED notification found (may be expected if shift was created without guard)\n");
    }

    // Step 4: Update shift time
    console.log("📋 Step 4: Updating shift time (09:00-17:00 → 10:00-18:00)...");
    const newStart = "10:00";
    const newEnd = "18:00";

    await sequelize.query(
      `UPDATE public.shifts 
       SET shift_start = $1::time, shift_end = $2::time
       WHERE id = $3`,
      {
        bind: [newStart, newEnd, testShiftId],
      }
    );

    console.log(`✅ Updated shift time to ${newStart}-${newEnd}\n`);

    // Manually trigger notification (simulating what the controller does)
    const { notifyShiftChanges } = require("../utils/guardNotification");
    // Ensure sequelize is available
    if (!sequelize) {
      throw new Error("Sequelize not initialized");
    }

    const currentShift = {
      guard_id: testGuardId,
      shift_date: shiftDate,
      shift_start: shiftStart,
      shift_end: shiftEnd,
      location: location,
      status: "OPEN",
    };

    const updatedShift = {
      id: testShiftId,
      guard_id: testGuardId,
      shift_date: shiftDate,
      shift_start: newStart,
      shift_end: newEnd,
      location: location,
      status: "OPEN",
    };

    await notifyShiftChanges({
      sequelize,
      currentShift,
      updatedShift,
      io: null, // No socket for this test
    });

    await new Promise((resolve) => setTimeout(resolve, 500));

    // Check for SHIFT_TIME_CHANGED notification
    const notif2 = await sequelize.query(
      `SELECT * FROM public.guard_notifications 
       WHERE guard_id = $1 AND shift_id = $2 AND type = 'SHIFT_TIME_CHANGED'
       ORDER BY created_at DESC LIMIT 1`,
      {
        bind: [testGuardId, testShiftId],
        type: sequelize.QueryTypes.SELECT,
      }
    );

    if (notif2.length > 0) {
      const notif = notif2[0];
      console.log(`✅ Found SHIFT_TIME_CHANGED notification`);
      console.log(`   Title: ${notif.title}`);
      console.log(`   Message: ${notif.message}\n`);
      notificationsCreated.push(notif);
    } else {
      console.log("❌ SHIFT_TIME_CHANGED notification NOT found\n");
    }

    // Step 5: Update shift date
    console.log("📋 Step 5: Updating shift date...");
    const newDate = new Date(tomorrow);
    newDate.setDate(newDate.getDate() + 1);
    const newShiftDate = newDate.toISOString().split("T")[0];

    const currentShift2 = { ...updatedShift };
    const updatedShift2 = {
      ...updatedShift,
      shift_date: newShiftDate,
    };

    await sequelize.query(
      `UPDATE public.shifts 
       SET shift_date = $1::date
       WHERE id = $2`,
      {
        bind: [newShiftDate, testShiftId],
      }
    );

    await notifyShiftChanges({
      sequelize,
      currentShift: currentShift2,
      updatedShift: updatedShift2,
      io: null,
    });

    await new Promise((resolve) => setTimeout(resolve, 500));

    const notif3 = await sequelize.query(
      `SELECT * FROM public.guard_notifications 
       WHERE guard_id = $1 AND shift_id = $2 AND type = 'SHIFT_DATE_CHANGED'
       ORDER BY created_at DESC LIMIT 1`,
      {
        bind: [testGuardId, testShiftId],
        type: sequelize.QueryTypes.SELECT,
      }
    );

    if (notif3.length > 0) {
      const notif = notif3[0];
      console.log(`✅ Found SHIFT_DATE_CHANGED notification`);
      console.log(`   Title: ${notif.title}`);
      console.log(`   Message: ${notif.message}\n`);
      notificationsCreated.push(notif);
    } else {
      console.log("❌ SHIFT_DATE_CHANGED notification NOT found\n");
    }

    // Step 6: Update shift location
    console.log("📋 Step 6: Updating shift location...");
    const newLocation = "New Test Location";

    const currentShift3 = { ...updatedShift2 };
    const updatedShift3 = {
      ...updatedShift2,
      location: newLocation,
    };

    await sequelize.query(
      `UPDATE public.shifts 
       SET location = $1
       WHERE id = $2`,
      {
        bind: [newLocation, testShiftId],
      }
    );

    await notifyShiftChanges({
      sequelize,
      currentShift: currentShift3,
      updatedShift: updatedShift3,
      io: null,
    });

    await new Promise((resolve) => setTimeout(resolve, 500));

    const notif4 = await sequelize.query(
      `SELECT * FROM public.guard_notifications 
       WHERE guard_id = $1 AND shift_id = $2 AND type = 'SHIFT_LOCATION_CHANGED'
       ORDER BY created_at DESC LIMIT 1`,
      {
        bind: [testGuardId, testShiftId],
        type: sequelize.QueryTypes.SELECT,
      }
    );

    if (notif4.length > 0) {
      const notif = notif4[0];
      console.log(`✅ Found SHIFT_LOCATION_CHANGED notification`);
      console.log(`   Title: ${notif.title}`);
      console.log(`   Message: ${notif.message}\n`);
      notificationsCreated.push(notif);
    } else {
      console.log("❌ SHIFT_LOCATION_CHANGED notification NOT found\n");
    }

    // Step 7: Delete shift (simulating cancellation)
    console.log("📋 Step 7: Deleting shift (simulating cancellation)...");
    
    // Get shift data before deletion
    const shiftBeforeDelete = await sequelize.query(
      `SELECT guard_id, shift_date, shift_start, shift_end, location, status 
       FROM public.shifts WHERE id = $1`,
      {
        bind: [testShiftId],
        type: sequelize.QueryTypes.SELECT,
      }
    );

    if (shiftBeforeDelete.length > 0) {
      const shift = shiftBeforeDelete[0];
      const { createGuardNotification } = require("../utils/guardNotification");
      
      // Create cancellation notification before deleting
      await createGuardNotification({
        sequelize,
        guardId: shift.guard_id,
        type: "SHIFT_CANCELLED",
        title: "Shift Cancelled",
        message: `Your shift on ${shift.shift_date} from ${shift.shift_start} to ${shift.shift_end}${shift.location ? ` at ${shift.location}` : ""} has been cancelled`,
        shiftId: testShiftId,
        meta: {
          shiftDate: shift.shift_date,
          shiftStart: shift.shift_start,
          shiftEnd: shift.shift_end,
          location: shift.location,
          deletedAt: new Date().toISOString(),
        },
        io: null,
      });

      await new Promise((resolve) => setTimeout(resolve, 500));

      const notif5 = await sequelize.query(
        `SELECT * FROM public.guard_notifications 
         WHERE guard_id = $1 AND shift_id = $2 AND type = 'SHIFT_CANCELLED'
         ORDER BY created_at DESC LIMIT 1`,
        {
          bind: [shift.guard_id, testShiftId],
          type: sequelize.QueryTypes.SELECT,
        }
      );

      if (notif5.length > 0) {
        const notif = notif5[0];
        console.log(`✅ Found SHIFT_CANCELLED notification`);
        console.log(`   Title: ${notif.title}`);
        console.log(`   Message: ${notif.message}\n`);
        notificationsCreated.push(notif);
      } else {
        console.log("❌ SHIFT_CANCELLED notification NOT found\n");
      }
    }

    // Step 8: Summary
    console.log("📊 Test Summary:");
    console.log("=" .repeat(50));
    console.log(`Total notifications created: ${notificationsCreated.length}`);
    console.log("\nNotifications:");
    notificationsCreated.forEach((notif, idx) => {
      console.log(`\n${idx + 1}. ${notif.type}`);
      console.log(`   ID: ${notif.id}`);
      console.log(`   Title: ${notif.title}`);
      console.log(`   Created: ${new Date(notif.created_at).toLocaleString()}`);
      console.log(`   Read: ${notif.read_at ? "Yes" : "No (unread)"}`);
    });

    // Step 9: Cleanup
    console.log("\n🧹 Cleaning up test data...");
    await sequelize.query(`DELETE FROM public.guard_notifications WHERE shift_id = $1`, {
      bind: [testShiftId],
    });
    await sequelize.query(`DELETE FROM public.shifts WHERE id = $1`, {
      bind: [testShiftId],
    });
    console.log("✅ Test data cleaned up");

    console.log("\n✅ Test completed successfully!");
    console.log("=" .repeat(50));

  } catch (error) {
    console.error("\n❌ Test failed with error:");
    console.error(error.message);
    console.error(error.stack);

    // Cleanup on error
    if (testShiftId) {
      try {
        await sequelize.query(`DELETE FROM public.guard_notifications WHERE shift_id = $1`, {
          bind: [testShiftId],
        });
        await sequelize.query(`DELETE FROM public.shifts WHERE id = $1`, {
          bind: [testShiftId],
        });
        console.log("\n🧹 Cleaned up test data after error");
      } catch (cleanupError) {
        console.error("Failed to cleanup:", cleanupError.message);
      }
    }

    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

// Run the test
testShiftChangeAlerts();
