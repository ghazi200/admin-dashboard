require("dotenv").config();
const { sequelize } = require("../config/db");
const { Guard, TimeEntry } = require("../models");

(async () => {
  try {
    await sequelize.authenticate();
    const guardEmail = process.argv[2] || "john@abesecurity.com";
    const shiftId = process.argv[3];

    if (!shiftId) {
      console.log("Usage: node src/scripts/clockOutTest.js [email] [shiftId]");
      process.exit(1);
    }

    const guard = await Guard.findOne({ where: { email: guardEmail } });
    if (!guard) {
      console.error("Guard not found");
      process.exit(1);
    }

    const te = await TimeEntry.findOne({
      where: { shift_id: shiftId, guard_id: guard.id }
    });

    if (te && te.clock_in_at && !te.clock_out_at) {
      te.clock_out_at = new Date();
      await te.save();
      console.log(`✅ Clocked out for shift ${shiftId}`);
    } else {
      console.log("No active clock-in found (or already clocked out)");
    }

    await sequelize.close();
  } catch (error) {
    console.error("Error:", error.message);
    process.exit(1);
  }
})();
