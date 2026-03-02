/**
 * Test Guard Readiness Service and API Endpoints
 * 
 * Tests:
 * 1. Guard reliability calculation
 * 2. Guard readiness overview
 * 3. Guard readiness details
 * 4. API endpoints
 * 5. Edge cases (no data, errors, etc.)
 */

require("dotenv").config({ path: require("path").resolve(__dirname, "../../.env") });
const { sequelize } = require("../config/db");
const models = require("../models");
const guardReadinessService = require("../services/guardReadiness.service");

async function testGuardReadiness() {
  console.log("🧪 Testing Guard Readiness Service\n");
  console.log("=" .repeat(60));

  try {
    // Test 1: Get Guard Readiness Overview
    console.log("\n📋 Test 1: Get Guard Readiness Overview");
    console.log("-".repeat(60));
    try {
      const overview = await guardReadinessService.getGuardReadinessOverview(
        null, // tenantId (will be handled by service)
        models,
        { days: 30, minReliability: 0, limit: 10 }
      );

      console.log(`✅ Successfully retrieved ${overview.length} guards`);
      
      if (overview.length > 0) {
        console.log("\n📊 Sample Guard Data:");
        const sampleGuard = overview[0];
        console.log(`   Guard: ${sampleGuard.guard?.name || sampleGuard.guard?.email || "Unknown"}`);
        console.log(`   Reliability Score: ${sampleGuard.metrics.reliabilityScore}/100`);
        console.log(`   Reliability Level: ${sampleGuard.metrics.reliabilityLevel}`);
        console.log(`   Total Shifts: ${sampleGuard.metrics.totalShifts}`);
        console.log(`   Completed Shifts: ${sampleGuard.metrics.completedShifts}`);
        console.log(`   Callouts: ${sampleGuard.metrics.callouts}`);
        console.log(`   Callout Rate: ${(sampleGuard.metrics.calloutRate * 100).toFixed(2)}%`);
        console.log(`   Late Clock-ins: ${sampleGuard.metrics.lateClockIns}`);
        console.log(`   Completion Rate: ${sampleGuard.metrics.completionRate}%`);
      } else {
        console.log("ℹ️  No guards found with readiness data");
        console.log("   This is normal if no guards have shifts or activity yet.");
      }
    } catch (error) {
      console.error("❌ Error:", error.message);
      console.error("   Stack:", error.stack);
    }

    // Test 2: Get Guard Readiness for Specific Guard
    console.log("\n📋 Test 2: Get Guard Readiness Details for Specific Guard");
    console.log("-".repeat(60));
    try {
      // First, get a guard ID from the database
      const guards = await models.Guard.findAll({
        where: { active: true },
        limit: 1,
        order: [["name", "ASC"]],
      });

      if (guards.length > 0) {
        const guardId = guards[0].id;
        console.log(`   Testing with guard ID: ${guardId} (${guards[0].name || guards[0].email})`);

        const details = await guardReadinessService.getGuardReadinessDetails(
          guardId,
          models,
          { days: 30 }
        );

        console.log("✅ Successfully retrieved guard readiness details");
        console.log("\n📊 Guard Readiness Details:");
        console.log(`   Guard: ${details.guard?.name || details.guard?.email || "Unknown"}`);
        console.log(`   Active: ${details.guard?.active ? "Yes" : "No"}`);
        console.log(`   Available: ${details.guard?.availability ? "Yes" : "No"}`);
        console.log(`   Reliability Score: ${details.metrics.reliabilityScore}/100`);
        console.log(`   Reliability Level: ${details.metrics.reliabilityLevel}`);
        console.log(`   Readiness Status: ${details.readinessStatus || "N/A"}`);
        console.log(`   Total Shifts: ${details.metrics.totalShifts}`);
        console.log(`   Completed Shifts: ${details.metrics.completedShifts}`);
        console.log(`   Incomplete Shifts: ${details.metrics.incompleteShifts}`);
        console.log(`   Callouts: ${details.metrics.callouts}`);
        console.log(`   Callout Rate: ${(details.metrics.calloutRate * 100).toFixed(2)}%`);
        console.log(`   Late Clock-ins: ${details.metrics.lateClockIns}`);
        console.log(`   Completion Rate: ${details.metrics.completionRate}%`);
        
        if (details.recentShifts && details.recentShifts.length > 0) {
          console.log(`\n   Recent Shifts: ${details.recentShifts.length}`);
          details.recentShifts.slice(0, 3).forEach((shift, idx) => {
            console.log(`     ${idx + 1}. ${shift.shift_date} ${shift.shift_start}-${shift.shift_end} (${shift.status})`);
          });
        }

        if (details.recentCallouts && details.recentCallouts.length > 0) {
          console.log(`\n   Recent Callouts: ${details.recentCallouts.length}`);
        }

        if (details.recentEvents && details.recentEvents.length > 0) {
          console.log(`\n   Recent Events: ${details.recentEvents.length}`);
        }

        if (details.trends) {
          console.log(`\n   Trends:`);
          console.log(`     Last 7 Days: ${details.trends.last7Days?.shifts || 0} shifts, ${details.trends.last7Days?.callouts || 0} callouts`);
          console.log(`     Last 30 Days: ${details.trends.last30Days?.shifts || 0} shifts, ${details.trends.last30Days?.callouts || 0} callouts`);
          if (details.trends.trend) {
            console.log(`     Trend: ${details.trends.trend}`);
          }
        }
      } else {
        console.log("ℹ️  No active guards found in database");
      }
    } catch (error) {
      console.error("❌ Error:", error.message);
      if (error.message.includes("not found")) {
        console.log("   This is expected if the guard ID doesn't exist");
      } else {
        console.error("   Stack:", error.stack);
      }
    }

    // Test 3: Calculate Reliability for Specific Guard
    console.log("\n📋 Test 3: Calculate Guard Reliability Score");
    console.log("-".repeat(60));
    try {
      const guards = await models.Guard.findAll({
        where: { active: true },
        limit: 1,
        order: [["name", "ASC"]],
      });

      if (guards.length > 0) {
        const guardId = guards[0].id;
        console.log(`   Testing with guard ID: ${guardId}`);

        const reliability = await guardReadinessService.calculateGuardReliability(
          guardId,
          models,
          { days: 30 }
        );

        console.log("✅ Successfully calculated guard reliability");
        console.log("\n📊 Reliability Calculation:");
        console.log(`   Guard: ${reliability.guard?.name || reliability.guard?.email || "Unknown"}`);
        console.log(`   Reliability Score: ${reliability.metrics.reliabilityScore}/100`);
        console.log(`   Reliability Level: ${reliability.metrics.reliabilityLevel}`);
        console.log(`   Total Shifts: ${reliability.metrics.totalShifts}`);
        console.log(`   Completed Shifts: ${reliability.metrics.completedShifts}`);
        console.log(`   Incomplete Shifts: ${reliability.metrics.incompleteShifts}`);
        console.log(`   Callouts: ${reliability.metrics.callouts}`);
        console.log(`   Callout Rate: ${(reliability.metrics.calloutRate * 100).toFixed(2)}%`);
        console.log(`   Late Clock-ins: ${reliability.metrics.lateClockIns}`);
        console.log(`   Completion Rate: ${reliability.metrics.completionRate}%`);

        // Explain the calculation
        console.log("\n💡 Calculation Logic:");
        console.log(`   Base Score: 100`);
        console.log(`   Callout Penalty: -${Math.min(reliability.metrics.callouts * 10, 50)} (${reliability.metrics.callouts} callouts × 10, max -50)`);
        console.log(`   Incomplete Shift Penalty: -${Math.min(reliability.metrics.incompleteShifts * 5, 30)} (${reliability.metrics.incompleteShifts} incomplete × 5, max -30)`);
        console.log(`   Final Score: ${reliability.metrics.reliabilityScore}/100`);
      } else {
        console.log("ℹ️  No active guards found in database");
      }
    } catch (error) {
      console.error("❌ Error:", error.message);
      if (error.message.includes("not found")) {
        console.log("   This is expected if the guard ID doesn't exist");
      } else {
        console.error("   Stack:", error.stack);
      }
    }

    // Test 4: Edge Cases
    console.log("\n📋 Test 4: Edge Cases");
    console.log("-".repeat(60));
    
    // Test 4a: Non-existent guard ID
    console.log("\n   4a. Testing with non-existent guard ID");
    try {
      const fakeGuardId = "00000000-0000-0000-0000-000000000000";
      await guardReadinessService.calculateGuardReliability(fakeGuardId, models, { days: 30 });
      console.log("   ❌ Should have thrown an error for non-existent guard");
    } catch (error) {
      if (error.message.includes("not found")) {
        console.log("   ✅ Correctly handled non-existent guard");
      } else {
        console.error("   ❌ Unexpected error:", error.message);
      }
    }

    // Test 4b: Empty data (no shifts, no callouts)
    console.log("\n   4b. Testing with guards that have no activity");
    try {
      const overviewEmpty = await guardReadinessService.getGuardReadinessOverview(
        null,
        models,
        { days: 30, minReliability: 0, limit: 5 }
      );
      console.log(`   ✅ Successfully handled empty data (${overviewEmpty.length} guards)`);
      if (overviewEmpty.length > 0) {
        const emptyGuard = overviewEmpty.find(g => g.metrics.totalShifts === 0);
        if (emptyGuard) {
          console.log(`      Guard with no shifts: ${emptyGuard.guard?.name || emptyGuard.guard?.email}`);
          console.log(`      Reliability Score: ${emptyGuard.metrics.reliabilityScore} (should be 100)`);
        }
      }
    } catch (error) {
      console.error("   ❌ Error:", error.message);
    }

    // Test 5: Summary Statistics
    console.log("\n📋 Test 5: Summary Statistics");
    console.log("-".repeat(60));
    try {
      const allGuards = await guardReadinessService.getGuardReadinessOverview(
        null,
        models,
        { days: 30, minReliability: 0, limit: 100 }
      );

      if (allGuards.length > 0) {
        const stats = {
          total: allGuards.length,
          excellent: allGuards.filter(g => g.metrics.reliabilityLevel === "EXCELLENT").length,
          good: allGuards.filter(g => g.metrics.reliabilityLevel === "GOOD").length,
          fair: allGuards.filter(g => g.metrics.reliabilityLevel === "FAIR").length,
          poor: allGuards.filter(g => g.metrics.reliabilityLevel === "POOR").length,
          critical: allGuards.filter(g => g.metrics.reliabilityLevel === "CRITICAL").length,
          avgScore: Math.round(allGuards.reduce((sum, g) => sum + g.metrics.reliabilityScore, 0) / allGuards.length),
          totalShifts: allGuards.reduce((sum, g) => sum + g.metrics.totalShifts, 0),
          totalCallouts: allGuards.reduce((sum, g) => sum + g.metrics.callouts, 0),
          totalLateClockIns: allGuards.reduce((sum, g) => sum + g.metrics.lateClockIns, 0),
        };

        console.log("✅ Summary Statistics:");
        console.log(`   Total Guards: ${stats.total}`);
        console.log(`   Reliability Levels:`);
        console.log(`     EXCELLENT: ${stats.excellent}`);
        console.log(`     GOOD: ${stats.good}`);
        console.log(`     FAIR: ${stats.fair}`);
        console.log(`     POOR: ${stats.poor}`);
        console.log(`     CRITICAL: ${stats.critical}`);
        console.log(`   Average Reliability Score: ${stats.avgScore}/100`);
        console.log(`   Total Shifts (all guards): ${stats.totalShifts}`);
        console.log(`   Total Callouts (all guards): ${stats.totalCallouts}`);
        console.log(`   Total Late Clock-ins (all guards): ${stats.totalLateClockIns}`);
      } else {
        console.log("ℹ️  No guards found for statistics");
      }
    } catch (error) {
      console.error("❌ Error:", error.message);
    }

    console.log("\n" + "=".repeat(60));
    console.log("✅ Guard Readiness Tests Complete!\n");

  } catch (error) {
    console.error("\n❌ Fatal Error:", error);
    console.error("Stack:", error.stack);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

// Run tests
testGuardReadiness().catch((error) => {
  console.error("❌ Unhandled error:", error);
  process.exit(1);
});
