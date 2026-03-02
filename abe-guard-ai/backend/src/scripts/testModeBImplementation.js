/**
 * Test Mode B (Calculated Payroll) Implementation
 * 
 * Tests:
 * 1. Timesheet generation from time entries
 * 2. AI Payroll endpoint with calculated data
 * 3. Payroll adjustments creation and approval
 * 
 * Run: node src/scripts/testModeBImplementation.js
 */

require("dotenv").config();
const { pool } = require("../config/db");
const jwt = require("jsonwebtoken");
const http = require("http");

const BASE_URL = "http://localhost:4000";

// Helper: Make HTTP request
function httpRequest(method, path, token, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const data = body ? JSON.stringify(body) : null;

    const options = {
      method,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
    };

    const req = http.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => {
        data += chunk;
      });
      res.on("end", () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ status: res.statusCode, data: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, data: data });
        }
      });
    });

    req.on("error", (err) => {
      reject(new Error(`HTTP request failed: ${err.message}. Is the server running on ${BASE_URL}?`));
    });
    if (data) req.write(data);
    req.end();
  });
}

async function main() {
  try {
    console.log("\n🧪 Testing Mode B (Calculated Payroll) Implementation\n");
    console.log("=".repeat(60));

    // 1. Get admin and guard tokens
    console.log("\n1️⃣ Getting admin token...");
    const adminResult = await pool.query("SELECT id, email, tenant_id, role FROM admins LIMIT 1");
    if (adminResult.rows.length === 0) {
      console.error("❌ No admins found!");
      process.exit(1);
    }

    const admin = adminResult.rows[0];
    const adminToken = jwt.sign(
      {
        adminId: admin.id,
        tenant_id: admin.tenant_id,
        role: admin.role || "admin",
      },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );

    console.log(`   ✅ Admin: ${admin.email}`);
    console.log(`   ✅ Tenant ID: ${admin.tenant_id}`);

    console.log("\n2️⃣ Getting guard token...");
    const guardResult = await pool.query(
      "SELECT id, name, phone, tenant_id FROM guards WHERE tenant_id = $1 LIMIT 1",
      [admin.tenant_id]
    );
    if (guardResult.rows.length === 0) {
      console.error("❌ No guards found for this tenant!");
      process.exit(1);
    }

    const guard = guardResult.rows[0];
    const guardToken = jwt.sign(
      {
        guardId: guard.id,
        id: guard.id,
        tenant_id: guard.tenant_id,
        role: "guard",
      },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );

    console.log(`   ✅ Guard: ${guard.name}`);

    // 2. Check/create pay period
    console.log("\n3️⃣ Checking for active pay period...");
    const payPeriodResult = await pool.query(
      `SELECT id, period_start, period_end, status FROM pay_periods 
       WHERE tenant_id = $1 AND status IN ('OPEN', 'LOCKED')
       ORDER BY period_start DESC LIMIT 1`,
      [admin.tenant_id]
    );

    let payPeriodId;
    if (payPeriodResult.rows.length === 0) {
      console.log("   ⚠️  No active pay period found. Creating one...");
      const today = new Date();
      const periodStart = new Date(today);
      periodStart.setDate(periodStart.getDate() - 7); // 7 days ago
      const periodEnd = new Date(today);

      const createResult = await pool.query(
        `INSERT INTO pay_periods (id, tenant_id, period_start, period_end, period_type, status, created_at)
         VALUES (gen_random_uuid(), $1, $2, $3, 'WEEKLY', 'OPEN', NOW())
         RETURNING id, period_start, period_end`,
        [admin.tenant_id, periodStart.toISOString().split("T")[0], periodEnd.toISOString().split("T")[0]]
      );
      payPeriodId = createResult.rows[0].id;
      console.log(`   ✅ Created pay period: ${createResult.rows[0].period_start} to ${createResult.rows[0].period_end}`);
    } else {
      payPeriodId = payPeriodResult.rows[0].id;
      console.log(`   ✅ Found pay period: ${payPeriodResult.rows[0].period_start} to ${payPeriodResult.rows[0].period_end}`);
    }

    // 3. Test Timesheet Service (if time entries exist)
    console.log("\n4️⃣ Checking for time entries...");
    const timeEntryResult = await pool.query(
      `SELECT COUNT(*) as count FROM time_entries 
       WHERE guard_id = $1 
       AND clock_in_at >= (SELECT period_start FROM pay_periods WHERE id = $2)::timestamp
       AND clock_in_at <= (SELECT period_end FROM pay_periods WHERE id = $2)::timestamp + INTERVAL '1 day'`,
      [guard.id, payPeriodId]
    );

    const timeEntryCount = parseInt(timeEntryResult.rows[0].count);
    console.log(`   ${timeEntryCount > 0 ? "✅" : "⚠️ "} Found ${timeEntryCount} time entries`);

    if (timeEntryCount === 0) {
      console.log("   💡 Tip: Create time entries to test timesheet generation");
    }

    // 4. Test AI Payroll Endpoint (Mode B)
    console.log("\n5️⃣ Testing AI Payroll Endpoint (Mode B)...");
    
    // First, set tenant to HYBRID mode (so we can test both A and B)
    const tenantResult = await pool.query(
      "UPDATE tenants SET payroll_mode = 'HYBRID', ai_payroll_enabled = true WHERE id = $1 RETURNING payroll_mode",
      [admin.tenant_id]
    );
    console.log(`   ✅ Tenant payroll mode: ${tenantResult.rows[0].payroll_mode}`);

    const aiResponse = await httpRequest(
      "POST",
      "/api/ai/payroll/ask",
      guardToken,
      { question: "What are my hours for this pay period?" }
    );

    if (aiResponse.status === 200) {
      console.log("   ✅ AI endpoint responded successfully");
      const ctx = aiResponse.data.contextUsed;
      if (ctx.calculatedPayroll) {
        console.log(`   ✅ Calculated payroll data: ${ctx.calculatedPayroll.timesheet ? "Found" : "Not found"}`);
        if (ctx.calculatedPayroll.timesheet) {
          console.log(`      - Total hours: ${ctx.calculatedPayroll.timesheet.totalHours}`);
          console.log(`      - Regular: ${ctx.calculatedPayroll.timesheet.regularHours}`);
          console.log(`      - OT: ${ctx.calculatedPayroll.timesheet.overtimeHours}`);
        }
      }
    } else {
      console.log(`   ⚠️  AI endpoint returned status ${aiResponse.status}:`, aiResponse.data.message);
    }

    // 5. Test Adjustments Creation
    console.log("\n6️⃣ Testing Payroll Adjustments...");

    const adjustmentResponse = await httpRequest(
      "POST",
      "/api/admin/adjustments",
      adminToken,
      {
        guard_id: guard.id,
        pay_period_id: payPeriodId,
        adjustment_type: "BONUS",
        amount: 100.00,
        description: "Test bonus adjustment",
        status: "DRAFT",
      }
    );

    if (adjustmentResponse.status === 200) {
      const adjustmentId = adjustmentResponse.data.adjustment.id;
      console.log(`   ✅ Created adjustment: ${adjustmentId}`);

      // Test getting pending adjustments
      const pendingResponse = await httpRequest("GET", "/api/admin/adjustments/pending", adminToken);
      if (pendingResponse.status === 200) {
        console.log(`   ✅ Found ${pendingResponse.data.length} pending adjustment(s)`);
      }

      // Test approving adjustment
      const approveResponse = await httpRequest("POST", `/api/admin/adjustments/${adjustmentId}/approve`, adminToken);
      if (approveResponse.status === 200) {
        console.log("   ✅ Approved adjustment successfully");
      } else {
        console.log(`   ⚠️  Approval failed: ${approveResponse.data.message}`);
      }
    } else {
      console.log(`   ⚠️  Adjustment creation failed:`, adjustmentResponse.data?.message || JSON.stringify(adjustmentResponse.data) || `HTTP ${adjustmentResponse.status}`);
    }

    console.log("\n" + "=".repeat(60));
    console.log("✅ Mode B Implementation Test Complete!\n");

  } catch (error) {
    console.error("\n❌ Test failed:", error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await pool.end();
    process.exit(0);
  }
}

main();
