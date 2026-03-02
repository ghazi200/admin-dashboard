// Script to create a test shift for bob@abe.com
const { sequelize } = require("../config/db");
const { v4: uuidv4 } = require("uuid");

async function createTestShiftForBob() {
  try {
    console.log("🔍 Looking for guard with email: bob@abe.com");
    
    // Find the guard
    const [guardRows] = await sequelize.query(
      `SELECT id, name, email, tenant_id FROM guards WHERE LOWER(email) = LOWER($1) LIMIT 1`,
      { bind: ["bob@abe.com"] }
    );

    if (guardRows.length === 0) {
      console.error("❌ No guard found with email: bob@abe.com");
      console.log("💡 Available guards:");
      const [allGuards] = await sequelize.query(
        `SELECT id, name, email FROM guards LIMIT 10`
      );
      allGuards.forEach(g => {
        console.log(`   - ${g.name} (${g.email || 'no email'})`);
      });
      process.exit(1);
    }

    const guard = guardRows[0];
    console.log(`✅ Found guard: ${guard.name} (${guard.email})`);
    console.log(`   Guard ID: ${guard.id}`);
    console.log(`   Tenant ID: ${guard.tenant_id || 'none'}`);

    // Create a shift for today (or tomorrow if it's late in the day)
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Use tomorrow if it's after 2 PM today
    const shiftDate = now.getHours() >= 14 ? tomorrow : today;
    const shiftDateStr = shiftDate.toISOString().split('T')[0];

    // Set shift times (8 AM to 4 PM)
    const shiftStart = "08:00:00";
    const shiftEnd = "16:00:00";

    const shiftId = uuidv4();
    const status = "OPEN"; // OPEN status allows clock in/out

    console.log(`\n📅 Creating shift:`);
    console.log(`   Shift ID: ${shiftId}`);
    console.log(`   Date: ${shiftDateStr}`);
    console.log(`   Time: ${shiftStart} - ${shiftEnd}`);
    console.log(`   Status: ${status}`);
    console.log(`   Location: Test Location`);

    // Create the shift
    const [insertResult] = await sequelize.query(
      `INSERT INTO shifts (id, tenant_id, guard_id, shift_date, shift_start, shift_end, status, location, created_at)
       VALUES ($1, $2, $3, $4::date, $5::time, $6::time, $7, $8, NOW())
       RETURNING id, shift_date, shift_start, shift_end, status, location, guard_id`,
      {
        bind: [
          shiftId,
          guard.tenant_id || null,
          guard.id,
          shiftDateStr,
          shiftStart,
          shiftEnd,
          status,
          "Test Location"
        ]
      }
    );

    const createdShift = insertResult[0];
    console.log(`\n✅ Shift created successfully!`);
    console.log(`\n📋 Shift Details:`);
    console.log(`   Guard: ${guard.name} (${guard.email})`);
    console.log(`   Date: ${createdShift.shift_date}`);
    console.log(`   Time: ${createdShift.shift_start} - ${createdShift.shift_end}`);
    console.log(`   Status: ${createdShift.status}`);
    console.log(`   Location: ${createdShift.location || 'N/A'}`);
    
    console.log(`\n📋 COPY THIS SHIFT ID:`);
    console.log(`${createdShift.id}`);
    console.log(`\n🧪 You can now test clock in/out with this shift ID.`);
    console.log(`   The admin dashboard should update when bob@abe.com clocks in or out.`);

    await sequelize.close();
    process.exit(0);
  } catch (error) {
    console.error("❌ Error creating test shift:", error);
    console.error("Stack:", error.stack);
    await sequelize.close();
    process.exit(1);
  }
}

createTestShiftForBob();
