/**
 * Test: Full report on guard Bob from tenant Abe
 * 1. Login as admin
 * 2. Chat: "full report on guard bob from tenant abe"
 * 3. Verify response + download_report_pdf action
 * 4. Export PDF and verify buffer size
 */

require("dotenv").config();
const axios = require("axios");
const fs = require("fs");
const path = require("path");

const API_BASE = process.env.ADMIN_DASHBOARD_URL || "http://localhost:5000";
const TEST_ADMIN_EMAIL = process.env.TEST_ADMIN_EMAIL || "admin@test.com";
const TEST_ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD || "password123";

async function run() {
  console.log("📋 Test: Full report on guard Bob from tenant Abe\n");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  try {
    // 1. Login
    console.log("1. Logging in...");
    const loginRes = await axios.post(`${API_BASE}/api/admin/login`, {
      email: TEST_ADMIN_EMAIL,
      password: TEST_ADMIN_PASSWORD,
    });
    if (!loginRes.data?.token) {
      console.error("❌ Login failed:", loginRes.data?.message || "No token");
      process.exit(1);
    }
    const token = loginRes.data.token;
    console.log("   ✅ Login OK\n");

    const headers = {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    };

    // 2. Request full report via chat
    console.log("2. Sending: \"full report on guard bob from tenant abe\"");
    const chatRes = await axios.post(
      `${API_BASE}/api/admin/assistant/chat`,
      { message: "full report on guard bob from tenant abe", history: [] },
      { headers }
    );

    if (!chatRes.data?.ok) {
      console.error("   ❌ Chat failed:", chatRes.data?.message || chatRes.data);
      process.exit(1);
    }

    const response = chatRes.data.response || chatRes.data.answer || "";
    const actions = chatRes.data.actions || [];
    const data = chatRes.data.data || null;

    console.log("   ✅ Chat OK");
    console.log("   Response preview:", response.substring(0, 200) + (response.length > 200 ? "…" : ""));
    console.log("   Actions:", actions.length);
    console.log("   Data keys:", data ? Object.keys(data).join(", ") : "—");

    const pdfAction = actions.find((a) => a.type === "download_report_pdf");
    if (!pdfAction?.guardId) {
      console.error("   ❌ No download_report_pdf action with guardId in response");
      console.log("   Full response:", response);
      console.log("   Actions:", JSON.stringify(actions, null, 2));
      console.log("\n   💡 If you see 'Based on the operational data', restart the backend (node server.js) and run this test again.");
      process.exit(1);
    }
    console.log("   ✅ Found action: guardId =", pdfAction.guardId, "tenantId =", pdfAction.tenantId || "(any)");
    console.log("");

    // 3. Export PDF
    console.log("3. Exporting PDF...");
    const pdfRes = await axios.get(`${API_BASE}/api/admin/assistant/report/export-pdf`, {
      params: { guardId: pdfAction.guardId, tenantId: pdfAction.tenantId },
      responseType: "arraybuffer",
      headers: { Authorization: `Bearer ${token}` },
    });

    const buffer = Buffer.from(pdfRes.data);
    if (buffer.length < 100) {
      console.error("   ❌ PDF too small:", buffer.length, "bytes");
      process.exit(1);
    }
    console.log("   ✅ PDF received:", buffer.length, "bytes");

    // Optional: write to file
    const outPath = path.join(__dirname, "../../test-report-bob-abe.pdf");
    fs.writeFileSync(outPath, buffer);
    console.log("   ✅ Written to:", outPath);
    console.log("");

    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("✅ Full report test passed (Bob, tenant Abe)");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  } catch (err) {
    console.error("❌ Test failed:", err.message);
    if (err.response) {
      console.error("   Status:", err.response.status);
      console.error("   Data:", err.response.data?.message || err.response.data);
    }
    process.exit(1);
  }
}

run();
