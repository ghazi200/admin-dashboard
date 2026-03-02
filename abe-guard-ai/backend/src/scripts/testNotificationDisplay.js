/**
 * Test Notification Display
 * 
 * Creates a test notification for a guard and displays it
 */

require("dotenv").config();
const { sequelize } = require("../config/db");
const { v4: uuidv4 } = require("uuid");

async function testNotificationDisplay() {
  try {
    console.log("🧪 Testing Notification Display...\n");

    // Step 1: Get a test guard
    console.log("📋 Step 1: Finding test guard...");
    const guardResult = await sequelize.query(
      `SELECT id, name, email FROM public.guards LIMIT 1`,
      { type: sequelize.QueryTypes.SELECT }
    );

    if (guardResult.length === 0) {
      console.error("❌ No guards found in database. Please create a guard first.");
      process.exit(1);
    }

    const guardId = guardResult[0].id;
    const guardName = guardResult[0].name || guardResult[0].email;
    console.log(`✅ Using guard: ${guardName} (${guardId})\n`);

    // Step 2: Create a test notification
    console.log("📋 Step 2: Creating test notification...");
    const notificationId = uuidv4();
    const notificationType = "SHIFT_TIME_CHANGED";
    const notificationTitle = "Shift Time Updated";
    const notificationMessage = "Your shift on 2026-02-01 has been updated. New time: 10:00 to 18:00 at Test Location";

    const insertResult = await sequelize.query(
      `INSERT INTO public.guard_notifications 
       (id, guard_id, type, title, message, shift_id, meta, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, NULL, $6, NOW(), NOW())
       RETURNING *`,
      {
        bind: [
          notificationId,
          guardId,
          notificationType,
          notificationTitle,
          notificationMessage,
          JSON.stringify({
            shiftDate: "2026-02-01",
            shiftStart: "10:00",
            shiftEnd: "18:00",
            location: "Test Location",
          }),
        ],
        type: sequelize.QueryTypes.SELECT,
      }
    );

    const notification = insertResult[0];
    console.log(`✅ Created notification: ${notification.id}\n`);

    // Step 3: Display the notification
    console.log("📋 Step 3: Displaying notification details...");
    console.log("=" .repeat(60));
    console.log("NOTIFICATION DETAILS");
    console.log("=" .repeat(60));
    console.log(`ID:          ${notification.id}`);
    console.log(`Guard ID:    ${notification.guard_id}`);
    console.log(`Type:        ${notification.type}`);
    console.log(`Title:       ${notification.title}`);
    console.log(`Message:     ${notification.message}`);
    console.log(`Shift ID:    ${notification.shift_id || "N/A"}`);
    console.log(`Read:        ${notification.read_at ? "Yes" : "No (unread)"}`);
    console.log(`Created:     ${new Date(notification.created_at).toLocaleString()}`);
    if (notification.meta) {
      const meta = typeof notification.meta === 'string' ? JSON.parse(notification.meta) : notification.meta;
      console.log(`Meta:        ${JSON.stringify(meta, null, 2)}`);
    }
    console.log("=" .repeat(60));

    // Step 4: Fetch all notifications for this guard
    console.log("\n📋 Step 4: Fetching all notifications for this guard...");
    const allNotifications = await sequelize.query(
      `SELECT 
        id,
        type,
        title,
        message,
        shift_id,
        read_at,
        created_at
       FROM public.guard_notifications 
       WHERE guard_id = $1 
       ORDER BY created_at DESC 
       LIMIT 10`,
      {
        bind: [guardId],
        type: sequelize.QueryTypes.SELECT,
      }
    );

    console.log(`\n✅ Found ${allNotifications.length} notification(s) for ${guardName}:`);
    console.log("-" .repeat(60));
    allNotifications.forEach((notif, idx) => {
      const isUnread = !notif.read_at;
      const status = isUnread ? "🔴 UNREAD" : "✅ READ";
      console.log(`\n${idx + 1}. ${notif.title} [${status}]`);
      console.log(`   Type: ${notif.type}`);
      console.log(`   Message: ${notif.message.substring(0, 80)}${notif.message.length > 80 ? "..." : ""}`);
      console.log(`   Created: ${new Date(notif.created_at).toLocaleString()}`);
    });
    console.log("-" .repeat(60));

    // Step 5: Count unread notifications
    const unreadCount = await sequelize.query(
      `SELECT COUNT(*) as count 
       FROM public.guard_notifications 
       WHERE guard_id = $1 AND read_at IS NULL`,
      {
        bind: [guardId],
        type: sequelize.QueryTypes.SELECT,
      }
    );

    const unread = parseInt(unreadCount[0]?.count || 0);
    console.log(`\n📊 Summary:`);
    console.log(`   Total notifications: ${allNotifications.length}`);
    console.log(`   Unread notifications: ${unread}`);
    console.log(`   Read notifications: ${allNotifications.length - unread}`);

    // Step 6: Ask if user wants to keep or delete the test notification
    console.log("\n" + "=" .repeat(60));
    console.log("✅ Test completed successfully!");
    console.log(`\n💡 The test notification has been created and is visible in the database.`);
    console.log(`   To view it in the guard-ui, make sure:`);
    console.log(`   1. The backend server is running (port 4000)`);
    console.log(`   2. The guard-ui is running (port 3000)`);
    console.log(`   3. Login as guard: ${guardName} (${guardId})`);
    console.log(`   4. Navigate to the Home page to see the Shift Alerts section`);
    console.log("=" .repeat(60));

  } catch (error) {
    console.error("\n❌ Test failed with error:");
    console.error(error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

// Run the test
testNotificationDisplay();
