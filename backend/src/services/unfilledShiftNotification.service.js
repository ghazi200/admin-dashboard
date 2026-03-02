/**
 * Unfilled Shift Notification Service
 * 
 * Checks for shifts that are not filled 30-60 minutes before they start
 * and sends notifications to supervisors
 */

const { notify } = require("../utils/notify");
const { Op } = require("sequelize");

/**
 * Check for unfilled shifts approaching their start time
 * @param {Object} models - Sequelize models
 * @param {Object} app - Express app instance (for notify function)
 * @returns {Promise<Array>} Array of notifications created
 */
async function checkUnfilledShifts(models, app) {
  const { sequelize, Notification } = models;
  const notifications = [];

  try {
    // Get current time
    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();

    // Calculate time windows (30-60 minutes before shift start)
    // We'll check shifts starting in the next 30-60 minutes
    const thirtyMinutesFromNow = new Date(now.getTime() + 30 * 60 * 1000);
    const sixtyMinutesFromNow = new Date(now.getTime() + 60 * 60 * 1000);

    // Query for unfilled shifts starting in 30-60 minutes
    const [unfilledShifts] = await sequelize.query(`
      SELECT 
        s.id,
        s.shift_date,
        s.shift_start,
        s.shift_end,
        s.location,
        s.tenant_id,
        s.status,
        s.guard_id,
        t.name as tenant_name
      FROM shifts s
      LEFT JOIN tenants t ON t.id = s.tenant_id
      WHERE s.status = 'OPEN'
        AND s.guard_id IS NULL
        AND s.shift_date = CURRENT_DATE
        AND s.shift_start::time >= $1::time
        AND s.shift_start::time <= $2::time
      ORDER BY s.shift_start ASC
    `, {
      bind: [
        thirtyMinutesFromNow.toTimeString().substring(0, 5), // HH:MM format
        sixtyMinutesFromNow.toTimeString().substring(0, 5)
      ]
    });

    if (unfilledShifts.length === 0) {
      return notifications;
    }

    console.log(`🔍 Found ${unfilledShifts.length} unfilled shift(s) starting in 30-60 minutes`);

    // Check for existing notifications to avoid duplicates
    const shiftIds = unfilledShifts.map(s => s.id);
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    
    // Use Sequelize model to query (handles column name mapping)
    const { Notification } = models;
    const existingNotifications = await Notification.findAll({
      where: {
        type: 'UNFILLED_SHIFT_WARNING',
        createdAt: {
          [Op.gte]: twoHoursAgo
        }
      },
      attributes: ['meta']
    });

    // Filter by shiftId in JavaScript
    const notifiedShiftIds = new Set(
      existingNotifications
        .map(n => (n.meta || {}).shiftId)
        .filter(id => id && shiftIds.includes(id))
    );

    // Create notifications for shifts that haven't been notified yet
    for (const shift of unfilledShifts) {
      if (notifiedShiftIds.has(shift.id)) {
        continue; // Skip if already notified
      }

      const shiftDate = new Date(shift.shift_date);
      const shiftStart = shift.shift_start;
      const shiftEnd = shift.shift_end;
      const location = shift.location || 'Unknown Location';
      const tenantName = shift.tenant_name || 'Unknown Tenant';

      // Calculate minutes until shift starts
      const shiftDateTime = new Date(shiftDate);
      const [hours, minutes] = shiftStart.split(':').map(Number);
      shiftDateTime.setHours(hours, minutes, 0, 0);
      const minutesUntilStart = Math.round((shiftDateTime - now) / (1000 * 60));

      // Create notification
      try {
        await notify(app, {
          type: 'UNFILLED_SHIFT_WARNING',
          title: `⚠️ Unfilled Shift Alert`,
          message: `Shift starting in ${minutesUntilStart} minutes at ${location} (${shiftStart} - ${shiftEnd}) has no guard assigned. Please assign a guard immediately.`,
          entityType: 'shift',
          entityId: null, // Using UUID, so storing in meta
          audience: 'all', // Show to all (supervisors will see it, can filter later if needed)
          meta: {
            shiftId: shift.id,
            tenantId: shift.tenant_id,
            tenantName: tenantName,
            shiftDate: shift.shift_date,
            shiftStart: shiftStart,
            shiftEnd: shiftEnd,
            location: location,
            minutesUntilStart: minutesUntilStart,
            status: 'UNFILLED'
          }
        });

        notifications.push({
          shiftId: shift.id,
          location: location,
          shiftTime: `${shiftStart} - ${shiftEnd}`,
          minutesUntilStart: minutesUntilStart
        });

        console.log(`✅ Created UNFILLED_SHIFT_WARNING notification for shift ${shift.id} (${minutesUntilStart} min until start)`);
      } catch (error) {
        console.error(`❌ Failed to create notification for shift ${shift.id}:`, error.message);
      }
    }

    return notifications;
  } catch (error) {
    console.error('❌ Error checking unfilled shifts:', error);
    return notifications;
  }
}

/**
 * Start the unfilled shift checker scheduler
 * @param {Object} models - Sequelize models
 * @param {Object} app - Express app instance
 * @param {number} intervalMinutes - How often to check (default: 5 minutes)
 */
function startUnfilledShiftChecker(models, app, intervalMinutes = 5) {
  const intervalMs = intervalMinutes * 60 * 1000;

  // Run immediately on startup
  setTimeout(async () => {
    try {
      await checkUnfilledShifts(models, app);
    } catch (error) {
      console.error('❌ Unfilled shift checker startup error:', error);
    }
  }, 10000); // Wait 10 seconds after server starts

  // Set up interval
  const intervalId = setInterval(async () => {
    try {
      await checkUnfilledShifts(models, app);
    } catch (error) {
      console.error('❌ Unfilled shift checker error:', error);
    }
  }, intervalMs);

  console.log(`✅ Unfilled shift checker started (runs every ${intervalMinutes} minutes)`);

  return intervalId;
}

module.exports = {
  checkUnfilledShifts,
  startUnfilledShiftChecker
};
