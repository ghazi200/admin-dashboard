/**
 * Create a test notification for a guard
 * Usage: node src/scripts/createTestNotification.js <guard-email>
 */

require("dotenv").config();
const { pool } = require("../config/db");
const { v4: uuidv4 } = require("uuid");

async function createTestNotification(guardEmail) {
  try {
    if (!guardEmail) {
      console.error("❌ Usage: node createTestNotification.js <guard-email>");
      process.exit(1);
    }

    // Find guard by email
    const result = await pool.query(
      "SELECT id, email, name, tenant_id FROM guards WHERE lower(email)=lower($1) LIMIT 1",
      [guardEmail]
    );

    if (!result.rows.length) {
      console.error(`❌ Guard not found: ${guardEmail}`);
      process.exit(1);
    }

    const guard = result.rows[0];

    console.log(`✅ Found guard: ${guard.name || guard.email}`);
    console.log(`   Guard ID: ${guard.id}`);
    console.log(`   Tenant ID: ${guard.tenant_id || 'None'}\n`);

    // Create test notification directly in database
    const notificationId = uuidv4();
    const notificationType = "SHIFT_ASSIGNED";
    const notificationTitle = "Test Notification - Shift Assigned";
    const notificationMessage = "This is a test notification to verify the alerts system is working. You have been assigned to a shift.";
    const meta = JSON.stringify({
      test: true,
      createdBy: "test-script"
    });

    const insertResult = await pool.query(
      `INSERT INTO public.guard_notifications 
       (id, guard_id, type, title, message, shift_id, meta, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
       RETURNING id, guard_id, type, title, message, shift_id, read_at, created_at, meta`,
      [notificationId, guard.id, notificationType, notificationTitle, notificationMessage, null, meta]
    );

    const notification = insertResult.rows[0];

    if (notification) {
      console.log("✅ Test notification created!");
      console.log(`   Notification ID: ${notification.id}`);
      console.log(`   Type: ${notification.type}`);
      console.log(`   Title: ${notification.title}`);
      console.log(`   Message: ${notification.message}`);
      console.log(`   Created: ${notification.created_at}`);
      console.log("\n💡 Check guard-ui notifications to see this alert!");
      console.log("   - Go to Home page or Dashboard page");
      console.log("   - Look for the notifications section");
    } else {
      console.error("❌ Failed to create notification");
    }

    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error("❌ Error:", error.message);
    console.error("Stack:", error.stack);
    process.exit(1);
  }
}

const guardEmail = process.argv[2] || "john@abesecurity.com";
createTestNotification(guardEmail);
