/**
 * Create Test Shift Swaps
 * 
 * Creates pending shift swap requests for testing the admin UI
 */

require("dotenv").config({ path: require("path").join(__dirname, "../../.env") });
const { sequelize, ShiftSwap } = require("../models");

async function createTestShiftSwaps() {
  console.log("🔄 Creating Test Shift Swaps\n");
  console.log("=".repeat(60));

  try {
    await sequelize.authenticate();
    console.log("✅ Connected to database\n");

    // Get guards and shifts
    const [guards] = await sequelize.query(`
      SELECT id, name, email, tenant_id FROM guards LIMIT 2
    `);

    if (guards.length < 2) {
      console.log("❌ Need at least 2 guards. Creating test guards...");
      const [newGuard1] = await sequelize.query(`
        INSERT INTO guards (id, name, email, phone, is_active, created_at, updated_at)
        VALUES (gen_random_uuid(), 'Test Guard 1', 'testguard1@example.com', '555-0001', true, NOW(), NOW())
        RETURNING id, name, email, tenant_id
      `);
      guards.push(newGuard1[0]);
      
      const [newGuard2] = await sequelize.query(`
        INSERT INTO guards (id, name, email, phone, is_active, created_at, updated_at)
        VALUES (gen_random_uuid(), 'Test Guard 2', 'testguard2@example.com', '555-0002', true, NOW(), NOW())
        RETURNING id, name, email, tenant_id
      `);
      guards.push(newGuard2[0]);
      console.log("✅ Created test guards\n");
    }

    const guard1 = guards[0];
    const guard2 = guards[1];

    // Get or create shifts
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split('T')[0];

    const [existingShifts1] = await sequelize.query(`
      SELECT id, guard_id, shift_date, shift_start, shift_end, status, location, tenant_id
      FROM shifts
      WHERE guard_id = $1
      LIMIT 1
    `, { bind: [guard1.id] });

    let shift1;
    if (existingShifts1.length > 0) {
      shift1 = existingShifts1[0];
    } else {
      const [newShifts1] = await sequelize.query(`
        INSERT INTO shifts (id, guard_id, shift_date, shift_start, shift_end, status, location, tenant_id, created_at)
        VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, NOW())
        RETURNING id, guard_id, shift_date, shift_start, shift_end, status, location, tenant_id
      `, {
        bind: [guard1.id, todayStr, "09:00:00", "17:00:00", "SCHEDULED", "Main Office", guard1.tenant_id]
      });
      shift1 = newShifts1[0];
    }

    const [existingShifts2] = await sequelize.query(`
      SELECT id, guard_id, shift_date, shift_start, shift_end, status, location, tenant_id
      FROM shifts
      WHERE guard_id = $2 AND id != $1
      LIMIT 1
    `, { bind: [shift1.id, guard2.id] });

    let shift2;
    if (existingShifts2.length > 0) {
      shift2 = existingShifts2[0];
    } else {
      const [newShifts2] = await sequelize.query(`
        INSERT INTO shifts (id, guard_id, shift_date, shift_start, shift_end, status, location, tenant_id, created_at)
        VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, NOW())
        RETURNING id, guard_id, shift_date, shift_start, shift_end, status, location, tenant_id
      `, {
        bind: [guard2.id, todayStr, "18:00:00", "02:00:00", "SCHEDULED", "Secondary Site", guard2.tenant_id]
      });
      shift2 = newShifts2[0];
    }

    console.log("✅ Using shifts:");
    console.log(`   Shift 1: ${shift1.id.substring(0, 8)}... (${shift1.shift_date} ${shift1.shift_start} - ${shift1.shift_end})`);
    console.log(`   Shift 2: ${shift2.id.substring(0, 8)}... (${shift2.shift_date} ${shift2.shift_start} - ${shift2.shift_end})\n`);

    // Check existing pending swaps
    const [existingPending] = await sequelize.query(`
      SELECT COUNT(*) as count FROM shift_swaps WHERE status = 'pending'
    `);
    const pendingCount = parseInt(existingPending[0].count);

    if (pendingCount >= 3) {
      console.log(`✅ Already have ${pendingCount} pending swaps. That's enough for testing!`);
      console.log("\n📋 Current pending swaps:");
      const [pending] = await sequelize.query(`
        SELECT ss.id, ss.reason, rg.name as requester_name, s.shift_date, s.shift_start, s.location
        FROM shift_swaps ss
        LEFT JOIN guards rg ON ss.requester_guard_id = rg.id
        LEFT JOIN shifts s ON ss.shift_id = s.id
        WHERE ss.status = 'pending'
        ORDER BY ss.created_at DESC
        LIMIT 5
      `);
      pending.forEach((s, i) => {
        console.log(`   ${i + 1}. ${s.requester_name || 'N/A'} - ${s.shift_date} ${s.shift_start} at ${s.location || 'N/A'}`);
      });
      await sequelize.close();
      return;
    }

    // Create test swaps
    const swapsToCreate = 3 - pendingCount;
    console.log(`📝 Creating ${swapsToCreate} new pending shift swap(s)...\n`);

    const testReasons = [
      "Family emergency - need to swap this shift",
      "Doctor appointment scheduled for this time",
      "Personal commitment - requesting swap",
      "Need to attend important event",
      "Unexpected schedule conflict",
    ];

    for (let i = 0; i < swapsToCreate; i++) {
      const swapData = {
        shift_id: i % 2 === 0 ? shift1.id : shift2.id,
        requester_guard_id: i % 2 === 0 ? guard1.id : guard2.id,
        target_guard_id: i % 2 === 0 ? guard2.id : guard1.id,
        target_shift_id: i % 2 === 0 ? shift2.id : shift1.id,
        status: "pending",
        reason: testReasons[i % testReasons.length],
        tenant_id: (i % 2 === 0 ? guard1 : guard2).tenant_id || null,
      };

      const swap = await ShiftSwap.create(swapData);
      console.log(`✅ Created swap ${i + 1}: ${swap.id.substring(0, 8)}...`);
      console.log(`   Requester: ${i % 2 === 0 ? guard1.name : guard2.name}`);
      console.log(`   Reason: ${swapData.reason}`);
    }

    console.log("\n" + "=".repeat(60));
    console.log("✅ Test Shift Swaps Created!");
    console.log("=".repeat(60));
    console.log("\n📋 You should now see pending swaps in the frontend!");
    console.log("   Navigate to: http://localhost:3001/shift-swaps");

  } catch (error) {
    console.error("\n❌ Error:", error.message);
    console.error(error.stack);
  } finally {
    await sequelize.close();
  }
}

// Run
if (require.main === module) {
  createTestShiftSwaps()
    .then(() => {
      console.log("\n🎉 Done!");
      process.exit(0);
    })
    .catch((error) => {
      console.error("\n❌ Failed:", error);
      process.exit(1);
    });
}

module.exports = { createTestShiftSwaps };
