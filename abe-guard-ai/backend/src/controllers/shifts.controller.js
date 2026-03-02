const { Shift, Guard } = require('../models');

// Get all shifts for a tenant
async function getShifts(req, res) {
  try {
    const { tenant_id } = req.user; // assuming middleware sets req.user
    const shifts = await Shift.findAll({ where: { tenant_id }, include: Guard });
    res.json(shifts);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
}

// Assign guard to shift
async function assignGuard(req, res) {
  try {
    const { shiftId, guardId } = req.params;
    const shift = await Shift.findByPk(shiftId);
    if (!shift) return res.status(404).json({ error: 'Shift not found' });

    shift.guard_id = guardId;
    shift.status = 'SCHEDULED';
    await shift.save();

    res.json({ message: 'Guard assigned', shift });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
}

module.exports = { getShifts, assignGuard };
