/**
 * Test Pay Stub Upload
 * 
 * Tests POST /api/admin/paystubs endpoint
 * 
 * Run: node src/scripts/testPayStubUpload.js
 */

require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { pool } = require("../config/db");
const jwt = require("jsonwebtoken");

async function testPayStubUpload() {
  try {
    console.log("\n🧪 Testing Pay Stub Upload...\n");

    // 1. Get admin token
    console.log("1️⃣ Getting admin token...");
    const adminResult = await pool.query("SELECT id, email, tenant_id FROM admins LIMIT 1");
    if (adminResult.rows.length === 0) {
      console.error("❌ No admins found!");
      process.exit(1);
    }

    const admin = adminResult.rows[0];
    const adminToken = jwt.sign(
      {
        adminId: admin.id,
        tenant_id: admin.tenant_id,
        role: "admin", // Default role (role column may not exist yet)
      },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );

    console.log(`   ✅ Admin: ${admin.email}`);
    console.log(`   ✅ Tenant ID: ${admin.tenant_id}`);

    // 2. Get a guard for this tenant
    console.log("\n2️⃣ Finding a guard...");
    const guardResult = await pool.query(
      "SELECT id, name, email FROM guards WHERE tenant_id = $1 LIMIT 1",
      [admin.tenant_id]
    );

    if (guardResult.rows.length === 0) {
      console.error("❌ No guards found for this tenant!");
      process.exit(1);
    }

    const guard = guardResult.rows[0];
    console.log(`   ✅ Guard: ${guard.name} (${guard.email})`);

    // 3. Check tenant payroll mode
    console.log("\n3️⃣ Checking tenant payroll mode...");
    const tenantResult = await pool.query(
      "SELECT id, name, payroll_mode FROM tenants WHERE id = $1",
      [admin.tenant_id]
    );
    const tenant = tenantResult.rows[0];
    console.log(`   Tenant: ${tenant.name}`);
    console.log(`   Payroll mode: ${tenant.payroll_mode || "NOT SET"}`);

    if (tenant.payroll_mode && !["PAYSTUB_UPLOAD", "HYBRID"].includes(tenant.payroll_mode)) {
      console.error(
        `❌ Tenant payroll mode must be PAYSTUB_UPLOAD or HYBRID (currently: ${tenant.payroll_mode})`
      );
      console.log(`💡 Set it using: PATCH /api/admin/tenants/${tenant.id}/payroll-settings`);
      process.exit(1);
    }

    // 4. Create a test PDF file
    console.log("\n4️⃣ Creating test pay stub file...");
    const testDir = path.join(process.cwd(), "uploads", "paystubs");
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }

    const testPdfPath = path.join(testDir, "test_paystub.txt");
    const testPdfContent = "TEST PAY STUB\nThis is a test pay stub file for upload testing.";
    fs.writeFileSync(testPdfPath, testPdfContent);
    console.log(`   ✅ Created test file: ${testPdfPath}`);

    // 5. Prepare form data
    console.log("\n5️⃣ Preparing upload request...");
    const today = new Date();
    const payPeriodStart = new Date(today);
    payPeriodStart.setDate(today.getDate() - 14); // 2 weeks ago
    const payPeriodEnd = new Date(today);
    payPeriodEnd.setDate(today.getDate() - 1); // Yesterday

    const formData = {
      guard_id: guard.id,
      pay_period_start: payPeriodStart.toISOString().split("T")[0],
      pay_period_end: payPeriodEnd.toISOString().split("T")[0],
      pay_date: today.toISOString().split("T")[0],
      payment_method: "DIRECT_DEPOSIT",
      hours_worked: "80",
      gross_amount: "2000.00",
      tax_amount: "400.00",
      deductions_amount: "100.00",
      net_amount: "1500.00",
    };

    console.log("   Form data:", JSON.stringify(formData, null, 2));

    // 6. Make the upload request (using curl command)
    console.log("\n6️⃣ Upload request command:");
    console.log(`
curl -X POST "http://localhost:4000/api/admin/paystubs" \\
  -H "Authorization: Bearer ${adminToken}" \\
  -F "file=@${testPdfPath}" \\
  -F "guard_id=${formData.guard_id}" \\
  -F "pay_period_start=${formData.pay_period_start}" \\
  -F "pay_period_end=${formData.pay_period_end}" \\
  -F "pay_date=${formData.pay_date}" \\
  -F "payment_method=${formData.payment_method}" \\
  -F "hours_worked=${formData.hours_worked}" \\
  -F "gross_amount=${formData.gross_amount}" \\
  -F "tax_amount=${formData.tax_amount}" \\
  -F "deductions_amount=${formData.deductions_amount}" \\
  -F "net_amount=${formData.net_amount}"
    `);

    console.log("\n✅ Test preparation complete!");
    console.log("\n💡 Next step: Run the curl command above to test the upload.");

    process.exit(0);
  } catch (err) {
    console.error("\n❌ Error:", err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

// Connect and run
const { sequelize } = require("../config/db");
sequelize
  .authenticate()
  .then(() => {
    console.log("✅ Database connected");
    return testPayStubUpload();
  })
  .catch((err) => {
    console.error("❌ Database connection failed:", err.message);
    process.exit(1);
  });
