/**
 * Send a test message to bob@abe.com so they can see and reply from the Guard app (e.g. Android Studio).
 *
 * 1. Find guard with email bob@abe.com
 * 2. Login as admin (TEST_ADMIN_EMAIL / TEST_ADMIN_PASSWORD or admin@test.com / password123)
 * 3. Create a group conversation with Bob
 * 4. Post a test message to that conversation
 *
 * Usage (from backend directory):
 *   node src/scripts/sendTestMessageToBob.js
 *
 * Requires: Admin backend running (default http://localhost:5000); DB with guard bob@abe.com and admin with tenant_id.
 */

require("dotenv").config({ path: require("path").join(__dirname, "..", "..", ".env") });
const axios = require("axios");
const { Guard, sequelize } = require("../models");

const API_BASE = process.env.ADMIN_DASHBOARD_URL || "http://localhost:5000";
const ADMIN_EMAIL = process.env.TEST_ADMIN_EMAIL || "admin@test.com";
const ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD || "password123";
const BOB_EMAIL = "bob@abe.com";
const TEST_MESSAGE =
  "Test message – please reply from the Guard app on Android.";

async function main() {
  console.log("Send test message to bob@abe.com\n");

  await sequelize.authenticate();
  const bob = await Guard.findOne({ where: { email: BOB_EMAIL } });
  if (!bob) {
    console.error("Guard with email", BOB_EMAIL, "not found in database.");
    process.exit(1);
  }
  console.log("Found guard:", bob.email, "id:", bob.id);

  const loginRes = await axios.post(`${API_BASE}/api/admin/login`, {
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
  });
  if (!loginRes.data?.token) {
    console.error("Admin login failed:", loginRes.data?.message || "No token");
    process.exit(1);
  }
  console.log("Admin login OK");

  const headers = {
    Authorization: `Bearer ${loginRes.data.token}`,
    "Content-Type": "application/json",
  };

  const groupRes = await axios.post(
    `${API_BASE}/api/admin/messages/conversations/group`,
    {
      name: "Test for Bob",
      participantIds: [bob.id],
    },
    { headers }
  );
  if (groupRes.status !== 201 || !groupRes.data?.conversation?.id) {
    console.error(
      "Create conversation failed:",
      groupRes.status,
      groupRes.data?.message || groupRes.data
    );
    process.exit(1);
  }
  const convId = groupRes.data.conversation.id;
  console.log("Conversation created:", convId);

  const msgRes = await axios.post(
    `${API_BASE}/api/admin/messages/conversations/${convId}/messages`,
    { content: TEST_MESSAGE, messageType: "text" },
    { headers }
  );
  if (msgRes.status !== 201) {
    console.error(
      "Send message failed:",
      msgRes.status,
      msgRes.data?.message || msgRes.data
    );
    process.exit(1);
  }
  console.log("Message sent.");
  console.log("\nDone. Bob can open the Guard app (e.g. in Android Studio), go to Messages, and reply.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err?.response?.data || err?.message || err);
  process.exit(1);
});
