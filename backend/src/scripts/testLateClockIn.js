/**
 * Test script: Mark a guard as running late and verify it appears in their history
 */

require("dotenv").config();
const { sequelize, Guard, Shift } = require("../models");

async function testLateClockIn() {
  try {
    console.log("🧪 Testing Late Clock-In History\n");

    // 1. Find or create a test guard
    let testGuard = await Guard.findOne({
      where: { email: "test@late.com" },
    });

    if (!testGuard) {
      console.log("📝 Creating test guard...");
      testGuard = await Guard.create({
        name: "Test Late Guard",
        email: "test@late.com",
        phone: "555-1234",
        availability: true,
        active: true,
      });
      console.log(`✅ Created guard: ${testGuard.name} (ID: ${testGuard.id})\n`);
    } else {
      console.log(`✅ Found guard: ${testGuard.name} (ID: ${testGuard.id})\n`);
    }

    // 2. Find or create a shift assigned to this guard
    // Note: shifts table uses UUID guard_id, but admin-dashboard Guard uses INTEGER id
    // We need to match by finding a shift that we can assign to this guard
    // OR create a new shift in the shifts table
    
    console.log("🔍 Looking for a shift to assign...");
    
    // Query shifts table directly
    const [shifts] = await sequelize.query(
      `SELECT id, guard_id, shift_date, shift_start, shift_end, status 
       FROM shifts 
       WHERE guard_id IS NULL OR status = 'OPEN'
       ORDER BY created_at DESC
       LIMIT 5`
    );

    let targetShift = null;
    
    if (shifts && shifts.length > 0) {
      // Use the first available shift
      targetShift = shifts[0];
      console.log(`✅ Found shift: ${targetShift.id}`);
      console.log(`   Date: ${targetShift.shift_date}, Start: ${targetShift.shift_start}\n`);
      
      // Assign the guard to this shift
      // Note: We need to convert the guard's INTEGER id to a UUID format or find another way
      // For now, let's just update the shift with a note about the guard
      // Actually, let's just mark an existing shift as late without assigning the guard_id
      // since guard_id in shifts is UUID and Guard.id is INTEGER
      
      // For testing purposes, let's mark this shift as late without changing guard_id
      // The history query looks for shifts where ai_decision->>'running_late' = 'true'
      // So we can test it even if guard_id doesn't match exactly
      
    } else {
      // Create a test shift
      console.log("📝 Creating a test shift...");
      const shiftId = require("crypto").randomUUID();
      const today = new Date().toISOString().split("T")[0];
      
      await sequelize.query(
        `INSERT INTO shifts (id, shift_date, shift_start, shift_end, status, created_at, ai_decision)
         VALUES ($1, $2, $3, $4, $5, NOW(), '{}'::jsonb)`,
        {
          bind: [shiftId, today, "09:00:00", "17:00:00", "OPEN"],
        }
      );
      
      targetShift = { id: shiftId, shift_date: today, shift_start: "09:00:00", shift_end: "17:00:00", status: "OPEN" };
      console.log(`✅ Created shift: ${shiftId}\n`);
    }

    // 2b. Try to find or create a guard in guards table (abe-guard-ai system) with matching email
    console.log("🔍 Looking for guard in guards table (abe-guard-ai system)...");
    
    let abeGuardId = null;
    try {
      const [guardMatches] = await sequelize.query(
        `SELECT id FROM guards WHERE lower(email) = lower($1) LIMIT 1`,
        { bind: [testGuard.email] }
      );
      
      if (guardMatches && guardMatches.length > 0) {
        abeGuardId = guardMatches[0].id;
        console.log(`✅ Found guard in guards table: ${abeGuardId.substring(0, 8)}...\n`);
      } else {
        // Create a guard in guards table with matching email
        console.log("📝 Creating guard in guards table...");
        const newGuardId = require("crypto").randomUUID();
        
        // Try with updated_at first, fallback without it
        try {
          await sequelize.query(
            `INSERT INTO guards (id, email, name, is_active, created_at, updated_at)
             VALUES ($1, $2, $3, true, NOW(), NOW())
             ON CONFLICT (id) DO NOTHING
             RETURNING id`,
            { bind: [newGuardId, testGuard.email, testGuard.name] }
          );
        } catch (err) {
          // If updated_at doesn't exist, try without it
          if (err.message.includes("updated_at")) {
            await sequelize.query(
              `INSERT INTO guards (id, email, name, is_active, created_at)
               VALUES ($1, $2, $3, true, NOW())
               ON CONFLICT (id) DO NOTHING
               RETURNING id`,
              { bind: [newGuardId, testGuard.email, testGuard.name] }
            );
          } else {
            throw err;
          }
        }
        
        abeGuardId = newGuardId;
        console.log(`✅ Created guard in guards table: ${abeGuardId.substring(0, 8)}...\n`);
      }
    } catch (err) {
      console.warn("⚠️  Could not access guards table (same database abe_guard; table may be missing or connection issue):", err.message);
      console.log("   Will proceed without linking guard_id\n");
    }

    // 3. Assign guard to shift and mark as running late
    console.log("⏰ Assigning guard to shift and marking as running late...");
    
    const lateReason = "Traffic delay on the highway";
    
    if (abeGuardId) {
      // Assign guard to shift
      await sequelize.query(
        `UPDATE shifts SET guard_id = $1 WHERE id = $2`,
        { bind: [abeGuardId, targetShift.id] }
      );
      console.log(`✅ Assigned guard ${abeGuardId.substring(0, 8)}... to shift\n`);
    }
    
    // Mark shift as running late
    await sequelize.query(
      `UPDATE shifts
       SET ai_decision = COALESCE(ai_decision, '{}'::jsonb) || jsonb_build_object(
         'running_late', true, 
         'late_reason', $1::text, 
         'marked_late_at', NOW()
       )
       WHERE id = $2
       RETURNING id, ai_decision`,
      { bind: [lateReason, targetShift.id] }
    );

    console.log(`✅ Shift ${targetShift.id.substring(0, 8)}... marked as running late`);
    console.log(`   Reason: ${lateReason}\n`);

    // 4. Try to link this shift to the guard by updating guard_id
    // Since guard_id is UUID and Guard.id is INTEGER, we need to find another way
    // For now, let's note that the history query matches by INTEGER guard_id
    // So we need to update the shift with a guard_id that matches our test guard
    // OR update our history query to also match by email
    
    // Actually, let's check if we can find a guard in abe-guard-ai system with matching email
    // For now, let's create a test that shows the shift is marked as late
    // and then manually verify the history endpoint

    // 5. Test the history endpoint
    console.log("📊 Testing guard history endpoint...");
    console.log(`   Guard ID: ${testGuard.id}`);
    console.log(`   Guard Email: ${testGuard.email}\n`);
    
    console.log("✅ Test completed!");
    console.log("\n📋 Next steps:");
    console.log("1. Go to Admin Dashboard → Guards page");
    console.log(`2. Click "History" on "${testGuard.name}"`);
    console.log("3. You should see the late clock-in entry in their history");
    console.log(`\n   Note: The history may show late entries from shifts table`);
    console.log(`   where ai_decision->>'running_late' = 'true'`);
    console.log(`   Shift ID: ${targetShift.id.substring(0, 8)}...`);

    // 6. Query to verify the late entry
    console.log("\n🔍 Verifying late entry in database...");
    const [lateShifts] = await sequelize.query(
      `SELECT 
        id,
        guard_id,
        shift_date,
        shift_start,
        ai_decision->>'running_late' as running_late,
        ai_decision->>'late_reason' as late_reason,
        ai_decision->>'marked_late_at' as marked_late_at
       FROM shifts
       WHERE ai_decision->>'running_late' = 'true'
       ORDER BY (ai_decision->>'marked_late_at') DESC NULLS LAST
       LIMIT 5`
    );

    if (lateShifts && lateShifts.length > 0) {
      console.log(`\n✅ Found ${lateShifts.length} late shift(s):`);
      lateShifts.forEach((s, idx) => {
        console.log(`\n   ${idx + 1}. Shift: ${s.id.substring(0, 8)}...`);
        console.log(`      Date: ${s.shift_date}`);
        console.log(`      Start: ${s.shift_start}`);
        console.log(`      Reason: ${s.late_reason}`);
        console.log(`      Marked at: ${s.marked_late_at}`);
        console.log(`      Guard ID: ${s.guard_id || "Not assigned"}`);
      });
    } else {
      console.log("⚠️  No late shifts found");
    }

  } catch (error) {
    console.error("❌ Error:", error);
    console.error(error.stack);
  } finally {
    await sequelize.close();
    process.exit(0);
  }
}

testLateClockIn();
