const { Shift, Guard } = require("../models");

// Test AI callout controller
exports.triggerCalloutTest = async (req, res) => {
  const { shiftId } = req.body;

  // Find shift
  const shift = await Shift.findByPk(shiftId);
  if (!shift) return res.status(404).json({ message: "Shift not found" });

  // Simulate opening shift
  shift.status = "OPEN";
  shift.assignedGuardId = null;
  // DON'T save to DB if you want pure simulation
  // await shift.save();

  // Get eligible guards
  const guards = await Guard.findAll({ where: { approvedForCoverage: true } });

  // Simulate notifications
  guards.forEach(g => {
    console.log(`[TEST] Notify guard: ${g.name} to take shift ${shift.id}`);
  });

  // Emit Socket.IO events if io exists
  const io = req.app.get("io");
  if (io) {
    io.to("guards").emit("shift_opened", shift);
    io.to("admin").emit("callout_started", shift);
  }

  res.json({
    message: "Test callout triggered (simulation)",
    shift,
    notifiedGuards: guards.map(g => g.name),
  });
};
