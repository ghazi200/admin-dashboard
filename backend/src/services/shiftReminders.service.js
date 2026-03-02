/**
 * Shift Reminders Service
 * 
 * Handles sending shift reminders to guards via notifications
 * - 24 hours before shift
 * - 2 hours before shift
 * - 30 minutes before shift
 */

const cron = require("node-cron");

/**
 * Schedule shift reminder notifications
 */
function scheduleShiftReminders(app) {
  const { Shift, Guard, Notification, sequelize } = app.locals.models;

  // Check for shifts 24 hours from now
  cron.schedule("0 * * * *", async () => {
    // Run every hour
    try {
      const now = new Date();
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(0, 0, 0, 0);

      const tomorrowEnd = new Date(tomorrow);
      tomorrowEnd.setHours(23, 59, 59, 999);

      // Find shifts starting tomorrow
      const [shifts] = await sequelize.query(`
        SELECT 
          s.id,
          s.shift_date,
          s.shift_start,
          s.shift_end,
          s.location,
          s.guard_id,
          g.name as guard_name,
          g.email as guard_email,
          g.tenant_id
        FROM shifts s
        INNER JOIN guards g ON s.guard_id = g.id
        WHERE s.status = 'OPEN'
          AND s.guard_id IS NOT NULL
          AND s.shift_date = CURRENT_DATE + INTERVAL '1 day'
          AND s.shift_start IS NOT NULL
      `);

      for (const shift of shifts) {
        // Parse shift start time
        const [hours, minutes] = shift.shift_start.split(":").map(Number);
        const shiftStartTime = new Date(shift.shift_date);
        shiftStartTime.setHours(hours, minutes, 0, 0);

        const hoursUntilShift = (shiftStartTime - now) / (1000 * 60 * 60);

        // Send 24-hour reminder (between 23-25 hours before)
        if (hoursUntilShift >= 23 && hoursUntilShift <= 25) {
          await Notification.create({
            type: "SHIFT_REMINDER_24H",
            title: "Shift Reminder: Tomorrow",
            message: `Your shift at ${shift.location} starts tomorrow at ${shift.shift_start}`,
            entityType: "shift",
            entityId: shift.id,
            audience: "guard",
            meta: {
              guard_id: shift.guard_id,
              shift_id: shift.id,
              reminder_type: "24h",
            },
            tenant_id: shift.tenant_id,
          });
        }
      }
    } catch (error) {
      console.error("Error in 24h shift reminder:", error);
    }
  });

  // Check for shifts 2 hours from now
  cron.schedule("*/15 * * * *", async () => {
    // Run every 15 minutes
    try {
      const now = new Date();
      const twoHoursFromNow = new Date(now.getTime() + 2 * 60 * 60 * 1000);

      const [shifts] = await sequelize.query(`
        SELECT 
          s.id,
          s.shift_date,
          s.shift_start,
          s.shift_end,
          s.location,
          s.guard_id,
          g.name as guard_name,
          g.email as guard_email,
          g.tenant_id
        FROM shifts s
        INNER JOIN guards g ON s.guard_id = g.id
        WHERE s.status = 'OPEN'
          AND s.guard_id IS NOT NULL
          AND s.shift_date = CURRENT_DATE
          AND s.shift_start IS NOT NULL
          AND (
            (s.shift_date = CURRENT_DATE AND 
             TO_TIMESTAMP(CURRENT_DATE || ' ' || s.shift_start, 'YYYY-MM-DD HH24:MI:SS') 
             BETWEEN NOW() + INTERVAL '1 hour 45 minutes' 
             AND NOW() + INTERVAL '2 hours 15 minutes')
          )
      `);

      for (const shift of shifts) {
        // Check if reminder already sent
        const existingReminder = await Notification.findOne({
          where: {
            type: "SHIFT_REMINDER_2H",
            entityId: shift.id,
          },
          // Check meta JSONB field
        });

        // Also check meta field for guard_id match
        const metaMatches = existingReminder && 
          existingReminder.meta && 
          existingReminder.meta.guard_id === shift.guard_id;

        if (!existingReminder || !metaMatches) {
          await Notification.create({
            type: "SHIFT_REMINDER_2H",
            title: "Shift Reminder: 2 Hours",
            message: `Your shift at ${shift.location} starts in 2 hours (${shift.shift_start})`,
            entityType: "shift",
            entityId: shift.id,
            audience: "guard",
            meta: {
              guard_id: shift.guard_id,
              shift_id: shift.id,
              reminder_type: "2h",
            },
            tenant_id: shift.tenant_id,
          });
        }
      }
    } catch (error) {
      console.error("Error in 2h shift reminder:", error);
    }
  });

  // Check for shifts 30 minutes from now
  cron.schedule("*/5 * * * *", async () => {
    // Run every 5 minutes
    try {
      const [shifts] = await sequelize.query(`
        SELECT 
          s.id,
          s.shift_date,
          s.shift_start,
          s.shift_end,
          s.location,
          s.guard_id,
          g.name as guard_name,
          g.email as guard_email,
          g.tenant_id
        FROM shifts s
        INNER JOIN guards g ON s.guard_id = g.id
        WHERE s.status = 'OPEN'
          AND s.guard_id IS NOT NULL
          AND s.shift_date = CURRENT_DATE
          AND s.shift_start IS NOT NULL
          AND (
            TO_TIMESTAMP(CURRENT_DATE || ' ' || s.shift_start, 'YYYY-MM-DD HH24:MI:SS') 
            BETWEEN NOW() + INTERVAL '25 minutes' 
            AND NOW() + INTERVAL '35 minutes'
          )
      `);

      for (const shift of shifts) {
        // Check if reminder already sent
        const existingReminder = await Notification.findOne({
          where: {
            type: "SHIFT_REMINDER_30M",
            entityId: shift.id,
          },
        });

        // Also check meta field for guard_id match
        const metaMatches = existingReminder && 
          existingReminder.meta && 
          existingReminder.meta.guard_id === shift.guard_id;

        if (!existingReminder || !metaMatches) {
          await Notification.create({
            type: "SHIFT_REMINDER_30M",
            title: "Shift Starting Soon!",
            message: `Your shift at ${shift.location} starts in 30 minutes (${shift.shift_start}) - Leave now!`,
            entityType: "shift",
            entityId: shift.id,
            audience: "guard",
            priority: "HIGH",
            meta: {
              guard_id: shift.guard_id,
              shift_id: shift.id,
              reminder_type: "30m",
            },
            tenant_id: shift.tenant_id,
          });
        }
      }
    } catch (error) {
      console.error("Error in 30m shift reminder:", error);
    }
  });

  console.log("✅ Shift reminders scheduler started");
}

module.exports = { scheduleShiftReminders };
