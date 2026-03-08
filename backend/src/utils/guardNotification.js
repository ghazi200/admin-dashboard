/**
 * Guard Notification Helper
 * 
 * Creates notifications for guards when shifts change.
 * These notifications are stored in the abe-guard-ai database (guard_notifications table).
 */

/**
 * Create a guard notification
 * @param {Object} options
 * @param {Object} options.sequelize - Sequelize instance
 * @param {string} options.guardId - UUID of the guard
 * @param {string} options.type - Notification type (SHIFT_ASSIGNED, SHIFT_CANCELLED, etc.)
 * @param {string} options.title - Notification title
 * @param {string} options.message - Notification message
 * @param {string} options.shiftId - UUID of the shift (optional)
 * @param {Object} options.meta - Additional metadata (optional)
 * @param {Object} options.app - Express app for realtime publish (optional)
 */
async function createGuardNotification({ sequelize, guardId, type, title, message, shiftId = null, meta = {}, app = null }) {
  try {
    if (!guardId || !sequelize) {
      console.warn("⚠️ createGuardNotification: guardId and sequelize are required");
      return null;
    }

    // Insert notification into guard_notifications table
    const result = await sequelize.query(
      `INSERT INTO public.guard_notifications 
       (guard_id, type, title, message, shift_id, meta, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
       RETURNING id, guard_id, type, title, message, shift_id, read_at, created_at, meta`,
      {
        bind: [guardId, type, title, message, shiftId, JSON.stringify(meta)],
        type: sequelize.QueryTypes.SELECT,
      }
    );

    const notification = result[0];

    if (app?.locals?.emitToRealtime) {
      app.locals.emitToRealtime(app, `guard:${guardId}`, "guard:notification:new", notification).catch(() => {});
    }

    console.log(`✅ Created guard notification: ${notification.id} for guard ${guardId}`);
    return notification;
  } catch (err) {
    console.error("❌ Error creating guard notification:", err.message);
    // Don't throw - notification failure shouldn't break shift updates
    return null;
  }
}

/**
 * Detect shift changes and create appropriate notifications
 * @param {Object} options
 * @param {Object} options.sequelize - Sequelize instance
 * @param {Object} options.currentShift - Current shift data (before update)
 * @param {Object} options.updatedShift - Updated shift data (after update)
 * @param {Object} options.app - Express app for realtime (optional)
 */
async function notifyShiftChanges({ sequelize, currentShift, updatedShift, app = null }) {
  if (!currentShift || !updatedShift || !sequelize) {
    return;
  }

  const notifications = [];

  // Check if guard was assigned (new assignment)
  if (!currentShift.guard_id && updatedShift.guard_id) {
    const [guardRows] = await sequelize.query(
      `SELECT name, email FROM public.guards WHERE id = $1 LIMIT 1`,
      {
        bind: [updatedShift.guard_id],
        type: sequelize.QueryTypes.SELECT,
      }
    );
    const guardName = guardRows[0]?.name || guardRows[0]?.email || "Guard";

    const notification = await createGuardNotification({
      sequelize,
      guardId: updatedShift.guard_id,
      type: "SHIFT_ASSIGNED",
      title: "New Shift Assigned",
      message: `You have been assigned a shift on ${updatedShift.shift_date} from ${updatedShift.shift_start} to ${updatedShift.shift_end}${updatedShift.location ? ` at ${updatedShift.location}` : ""}`,
      shiftId: updatedShift.id,
      meta: {
        shiftDate: updatedShift.shift_date,
        shiftStart: updatedShift.shift_start,
        shiftEnd: updatedShift.shift_end,
        location: updatedShift.location,
      },
      app,
    });
    if (notification) notifications.push(notification);
  }

  // Check if guard was unassigned (removed from shift)
  if (currentShift.guard_id && !updatedShift.guard_id) {
    const notification = await createGuardNotification({
      sequelize,
      guardId: currentShift.guard_id,
      type: "SHIFT_UNASSIGNED",
      title: "Shift Assignment Removed",
      message: `You have been removed from the shift on ${currentShift.shift_date} from ${currentShift.shift_start} to ${currentShift.shift_end}`,
      shiftId: updatedShift.id,
      meta: {
        shiftDate: currentShift.shift_date,
        shiftStart: currentShift.shift_start,
        shiftEnd: currentShift.shift_end,
        location: currentShift.location,
      },
      app,
    });
    if (notification) notifications.push(notification);
  }

  // Check if shift was cancelled (status changed to CANCELLED)
  if (currentShift.status !== "CANCELLED" && updatedShift.status === "CANCELLED" && updatedShift.guard_id) {
    const notification = await createGuardNotification({
      sequelize,
      guardId: updatedShift.guard_id,
      type: "SHIFT_CANCELLED",
      title: "Shift Cancelled",
      message: `Your shift on ${updatedShift.shift_date} from ${updatedShift.shift_start} to ${updatedShift.shift_end} has been cancelled`,
      shiftId: updatedShift.id,
      meta: {
        shiftDate: updatedShift.shift_date,
        shiftStart: updatedShift.shift_start,
        shiftEnd: updatedShift.shift_end,
        location: updatedShift.location,
      },
      io,
    });
    if (notification) notifications.push(notification);
  }

  // Check if shift time changed (only notify if guard is assigned)
  if (updatedShift.guard_id) {
    const timeChanged = 
      (currentShift.shift_start !== updatedShift.shift_start) ||
      (currentShift.shift_end !== updatedShift.shift_end);

    if (timeChanged) {
      const notification = await createGuardNotification({
        sequelize,
        guardId: updatedShift.guard_id,
        type: "SHIFT_TIME_CHANGED",
        title: "Shift Time Updated",
        message: `Your shift on ${updatedShift.shift_date} has been updated. New time: ${updatedShift.shift_start} to ${updatedShift.shift_end}${updatedShift.location ? ` at ${updatedShift.location}` : ""}`,
        shiftId: updatedShift.id,
        meta: {
          shiftDate: updatedShift.shift_date,
          previousStart: currentShift.shift_start,
          previousEnd: currentShift.shift_end,
          newStart: updatedShift.shift_start,
          newEnd: updatedShift.shift_end,
          location: updatedShift.location,
        },
        io,
      });
      if (notification) notifications.push(notification);
    }

    // Check if shift date changed
    if (currentShift.shift_date !== updatedShift.shift_date) {
      const notification = await createGuardNotification({
        sequelize,
        guardId: updatedShift.guard_id,
        type: "SHIFT_DATE_CHANGED",
        title: "Shift Date Updated",
        message: `Your shift has been moved from ${currentShift.shift_date} to ${updatedShift.shift_date}. Time: ${updatedShift.shift_start} to ${updatedShift.shift_end}${updatedShift.location ? ` at ${updatedShift.location}` : ""}`,
        shiftId: updatedShift.id,
        meta: {
          previousDate: currentShift.shift_date,
          newDate: updatedShift.shift_date,
          shiftStart: updatedShift.shift_start,
          shiftEnd: updatedShift.shift_end,
          location: updatedShift.location,
        },
        io,
      });
      if (notification) notifications.push(notification);
    }

    // Check if location changed
    if (currentShift.location !== updatedShift.location) {
      const notification = await createGuardNotification({
        sequelize,
        guardId: updatedShift.guard_id,
        type: "SHIFT_LOCATION_CHANGED",
        title: "Shift Location Updated",
        message: `Your shift on ${updatedShift.shift_date} from ${updatedShift.shift_start} to ${updatedShift.shift_end} location has been changed${updatedShift.location ? ` to ${updatedShift.location}` : ""}`,
        shiftId: updatedShift.id,
        meta: {
          shiftDate: updatedShift.shift_date,
          shiftStart: updatedShift.shift_start,
          shiftEnd: updatedShift.shift_end,
          previousLocation: currentShift.location,
          newLocation: updatedShift.location,
        },
        io,
      });
      if (notification) notifications.push(notification);
    }
  }

  return notifications;
}

module.exports = {
  createGuardNotification,
  notifyShiftChanges,
};
