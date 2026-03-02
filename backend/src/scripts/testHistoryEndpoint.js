/**
 * Test the getGuardHistory controller function directly
 */

require("dotenv").config();
const { sequelize, Guard } = require("../models");
const { getGuardHistory } = require("../controllers/adminGuards.controller");

// Mock req and res objects
async function testHistory() {
  try {
    const guard = await Guard.findOne({ where: { email: "test@late.com" } });
    if (!guard) {
      console.log("❌ Test guard not found");
      process.exit(1);
    }

    console.log(`🧪 Testing history for guard: ${guard.name} (ID: ${guard.id})\n`);

    // Create mock req and res
    const req = {
      params: { id: String(guard.id) },
      app: {
        locals: {
          models: {
            sequelize,
            Guard,
            AvailabilityLog: require("../models").AvailabilityLog,
          },
        },
      },
    };

    const res = {
      json: (data) => {
        console.log("\n📊 History Response:");
        console.log(`   Guard: ${data.guard.name} (${data.guard.email})`);
        console.log(`   Summary:`);
        console.log(`     Availability: ${data.summary.totalAvailabilityChanges}`);
        console.log(`     Callouts: ${data.summary.totalCallouts}`);
        console.log(`     Late: ${data.summary.totalLate}`);
        console.log(`     AI Rankings: ${data.summary.totalAIRankings}`);
        console.log(`   Total history items: ${data.history.length}`);
        
        if (data.history.length > 0) {
          console.log("\n📋 History items:");
          data.history.forEach((item, idx) => {
            console.log(`   ${idx + 1}. ${item.type} - ${item.timestamp || item.createdAt}`);
            if (item.reason) console.log(`      Reason: ${item.reason}`);
            if (item.shiftDate) console.log(`      Shift: ${item.shiftDate} ${item.shiftStart || ""}`);
          });
        }
      },
      status: (code) => ({
        json: (data) => {
          console.error(`❌ Error ${code}:`, data);
        },
      }),
    };

    await getGuardHistory(req, res);
  } catch (error) {
    console.error("❌ Test error:", error);
    console.error(error.stack);
  } finally {
    await sequelize.close();
    process.exit(0);
  }
}

testHistory();
