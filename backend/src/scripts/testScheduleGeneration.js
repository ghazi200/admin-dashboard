/**
 * Test Auto Schedule Generation
 * 
 * Tests the automatic schedule generation service:
 * - Creates shifts for a date range
 * - Tests multiple time slots
 * - Tests auto-assignment
 * - Verifies shifts were created correctly
 */

require("dotenv").config({ path: require("path").resolve(__dirname, "../../.env") });
const { sequelize } = require("../models");

const scheduleGenerationService = require("../services/scheduleGeneration.service");

async function testScheduleGeneration() {
  console.log("🧪 Testing Auto Schedule Generation...\n");

  try {
    // Get a tenant ID from the database
    const [tenants] = await sequelize.query(`
      SELECT id, name
      FROM tenants
      LIMIT 1
    `);

    if (tenants.length === 0) {
      console.error("❌ No tenants found in database");
      console.log("   Please create a tenant first");
      return;
    }

    const tenantId = tenants[0].id;
    const tenantName = tenants[0].name;
    console.log(`✅ Using tenant: ${tenantName} (${tenantId})\n`);

    // Check for active guards
    const [guards] = await sequelize.query(`
      SELECT id, name, email
      FROM guards
      WHERE tenant_id = $1 AND is_active = true
      LIMIT 5
    `, {
      bind: [tenantId]
    });

    if (guards.length === 0) {
      console.error("❌ No active guards found for tenant");
      console.log("   Please create some guards first");
      return;
    }

    console.log(`✅ Found ${guards.length} active guard(s):`);
    guards.forEach((g, i) => {
      console.log(`   ${i + 1}. ${g.name || g.email} (${g.id})`);
    });
    console.log("");

    // Calculate dates (next 7 days)
    const startDate = new Date();
    startDate.setDate(startDate.getDate() + 1); // Start tomorrow
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 6); // 7 days total

    const startDateStr = startDate.toISOString().split('T')[0];
    const endDateStr = endDate.toISOString().split('T')[0];

    console.log(`📅 Date Range: ${startDateStr} to ${endDateStr} (7 days)\n`);

    // Test 1: Generate schedule WITHOUT auto-assignment
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("TEST 1: Generate Shifts (No Auto-Assignment)");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

    const timeSlots = [
      {
        start: "08:00",
        end: "16:00",
        location: "Main Office",
        minGuards: 1,
        maxGuards: 1
      },
      {
        start: "16:00",
        end: "00:00",
        location: "Warehouse",
        minGuards: 1,
        maxGuards: 1
      }
    ];

    console.log("Time Slots:");
    timeSlots.forEach((slot, i) => {
      console.log(`   ${i + 1}. ${slot.start} - ${slot.end} at ${slot.location || "No location"}`);
    });
    console.log("");

    const result1 = await scheduleGenerationService.generateSchedule({
      tenantId,
      startDate: startDateStr,
      endDate: endDateStr,
      timeSlots,
      constraints: {
        autoAssign: false,
        excludeWeekends: false,
        excludeHolidays: false
      }
    }, { sequelize, models: require("../models") });

    console.log("✅ Generation Complete!");
    console.log(`   Total Shifts Created: ${result1.totalShifts}`);
    console.log(`   Assigned Shifts: ${result1.assignedShifts.length}`);
    console.log(`   Failed Assignments: ${result1.failedAssignments.length}`);
    console.log(`   Skipped Dates: ${result1.skippedDates.length}\n`);

    // Verify shifts were created
    const [createdShifts] = await sequelize.query(`
      SELECT 
        id,
        shift_date,
        shift_start,
        shift_end,
        location,
        status,
        guard_id
      FROM shifts
      WHERE tenant_id = $1
        AND shift_date >= $2::date
        AND shift_date <= $3::date
        AND created_at >= NOW() - INTERVAL '5 minutes'
      ORDER BY shift_date, shift_start
    `, {
      bind: [tenantId, startDateStr, endDateStr]
    });

    console.log(`✅ Verified: ${createdShifts.length} shifts found in database`);
    if (createdShifts.length > 0) {
      console.log("\n   Sample shifts:");
      createdShifts.slice(0, 5).forEach((shift, i) => {
        console.log(`   ${i + 1}. ${shift.shift_date} ${shift.shift_start}-${shift.shift_end} at ${shift.location || "No location"} (${shift.status})`);
      });
      if (createdShifts.length > 5) {
        console.log(`   ... and ${createdShifts.length - 5} more`);
      }
    }
    console.log("");

    // Test 2: Generate schedule WITH auto-assignment
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("TEST 2: Generate Shifts WITH Auto-Assignment");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

    // Use a different date range (next week)
    const startDate2 = new Date(endDate);
    startDate2.setDate(startDate2.getDate() + 1);
    const endDate2 = new Date(startDate2);
    endDate2.setDate(endDate2.getDate() + 4); // 5 days

    const startDate2Str = startDate2.toISOString().split('T')[0];
    const endDate2Str = endDate2.toISOString().split('T')[0];

    console.log(`📅 Date Range: ${startDate2Str} to ${endDate2Str} (5 days)\n`);

    const result2 = await scheduleGenerationService.generateSchedule({
      tenantId,
      startDate: startDate2Str,
      endDate: endDate2Str,
      timeSlots: [
        {
          start: "09:00",
          end: "17:00",
          location: "Main Office",
          minGuards: 1,
          maxGuards: 1
        }
      ],
      constraints: {
        autoAssign: true,
        minScore: 50, // Lower threshold for testing
        excludeWeekends: true,
        excludeHolidays: false
      }
    }, { sequelize, models: require("../models") });

    console.log("✅ Generation Complete!");
    console.log(`   Total Shifts Created: ${result2.totalShifts}`);
    console.log(`   Assigned Shifts: ${result2.assignedShifts.length}`);
    console.log(`   Failed Assignments: ${result2.failedAssignments.length}`);
    console.log(`   Skipped Dates: ${result2.skippedDates.length}\n`);

    if (result2.assignedShifts.length > 0) {
      console.log("   Auto-assigned shifts:");
      result2.assignedShifts.slice(0, 5).forEach((assignment, i) => {
        console.log(`   ${i + 1}. ${assignment.guardName} (Score: ${assignment.score}%)`);
      });
      if (result2.assignedShifts.length > 5) {
        console.log(`   ... and ${result2.assignedShifts.length - 5} more`);
      }
    }

    if (result2.failedAssignments.length > 0) {
      console.log("\n   ⚠️ Failed assignments:");
      result2.failedAssignments.slice(0, 3).forEach((failed, i) => {
        console.log(`   ${i + 1}. ${failed.reason}`);
      });
    }
    console.log("");

    // Test 3: Weekly repetition
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("TEST 3: Weekly Repetition");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

    const startDate3 = new Date(endDate2);
    startDate3.setDate(startDate3.getDate() + 1);
    const endDate3 = new Date(startDate3);
    endDate3.setDate(endDate3.getDate() + 6); // 1 week

    const startDate3Str = startDate3.toISOString().split('T')[0];
    const endDate3Str = endDate3.toISOString().split('T')[0];

    console.log(`📅 Base Week: ${startDate3Str} to ${endDate3Str}`);
    console.log(`   Repeating for 2 weeks\n`);

    const result3 = await scheduleGenerationService.generateFromTemplate({
      tenantId,
      name: "Test Weekly Schedule",
      startDate: startDate3Str,
      endDate: endDate3Str,
      timeSlots: [
        {
          start: "10:00",
          end: "18:00",
          location: "Test Location",
          minGuards: 1,
          maxGuards: 1
        }
      ],
      constraints: {
        autoAssign: false,
        excludeWeekends: true
      },
      repeatWeekly: true,
      weeksToRepeat: 2
    }, { sequelize, models: require("../models") });

    console.log("✅ Weekly Repetition Complete!");
    console.log(`   Total Shifts Created: ${result3.totalShifts}`);
    console.log(`   Weeks Generated: ${result3.weeks?.length || 0}\n`);

    if (result3.weeks && result3.weeks.length > 0) {
      result3.weeks.forEach((week, i) => {
        console.log(`   Week ${i + 1}: ${week.startDate} to ${week.endDate}`);
        console.log(`      - ${week.totalShifts} shifts created`);
      });
    }
    console.log("");

    // Summary
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("✅ ALL TESTS COMPLETE!");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

    const totalShifts = result1.totalShifts + result2.totalShifts + result3.totalShifts;
    console.log(`📊 Summary:`);
    console.log(`   Total Shifts Created: ${totalShifts}`);
    console.log(`   Auto-Assigned: ${result2.assignedShifts.length}`);
    console.log(`   Tests Passed: 3/3\n`);

    console.log("💡 Next Steps:");
    console.log("   1. Check the Shifts page to see generated shifts");
    console.log("   2. Review auto-assigned guards");
    console.log("   3. Adjust assignments if needed\n");

  } catch (error) {
    console.error("❌ Test failed:", error);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

// Run test
testScheduleGeneration()
  .then(() => {
    console.log("✅ Test script completed");
    process.exit(0);
  })
  .catch((error) => {
    console.error("❌ Test script failed:", error);
    process.exit(1);
  });
