/**
 * Create OPEN shifts for a guard's tenant
 */

require("dotenv").config();
const { pool } = require("../config/db");
const { v4: uuidv4 } = require("uuid");

async function createOpenShiftsForGuard(guardEmail, count = 5) {
  try {
    // Get guard's tenant_id
    const guardResult = await pool.query(
      `SELECT id, tenant_id FROM guards WHERE email = $1 LIMIT 1`,
      [guardEmail]
    );

    if (guardResult.rows.length === 0) {
      console.log(`❌ Guard not found: ${guardEmail}`);
      return;
    }

    const guard = guardResult.rows[0];
    const tenantId = guard.tenant_id;

    if (!tenantId) {
      console.log(`❌ Guard has no tenant_id - cannot create tenant-specific shifts`);
      return;
    }

    console.log(`✅ Found guard: ${guardEmail}`);
    console.log(`   Tenant ID: ${tenantId}`);
    console.log(`   Creating ${count} OPEN shifts...\n`);

    // Create shifts for the next few days
    const today = new Date();
    const shifts = [];

    for (let i = 0; i < count; i++) {
      const shiftDate = new Date(today);
      shiftDate.setDate(today.getDate() + i + 1); // Start from tomorrow
      const dateStr = shiftDate.toISOString().split('T')[0];

      const shiftId = uuidv4();
      const shiftStart = "09:00:00";
      const shiftEnd = "17:00:00";
      const location = `Test Location ${i + 1}`;

      await pool.query(
        `INSERT INTO shifts (id, tenant_id, shift_date, shift_start, shift_end, location, status, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, 'OPEN', NOW())`,
        [shiftId, tenantId, dateStr, shiftStart, shiftEnd, location]
      );

      shifts.push({
        id: shiftId,
        date: dateStr,
        time: `${shiftStart} - ${shiftEnd}`,
        location: location,
      });

      console.log(`✅ Created shift ${i + 1}: ${dateStr} ${shiftStart}-${shiftEnd} at ${location}`);
    }

    console.log(`\n✅ Created ${count} OPEN shifts for tenant ${tenantId}`);
    console.log(`\n💡 Refresh the guard-ui Shifts page to see them!`);

    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error("❌ Error:", error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

const guardEmail = process.argv[2] || "john@abesecurity.com";
const count = parseInt(process.argv[3] || "5", 10);

createOpenShiftsForGuard(guardEmail, count);
