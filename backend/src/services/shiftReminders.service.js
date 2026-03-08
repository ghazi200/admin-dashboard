/**
 * Shift Reminders Service
 *
 * Handles sending shift reminders to guards via notifications
 * - 24 hours before shift
 * - 2 hours before shift
 * - 30 minutes before shift
 *
 * Cron runs work in setImmediate() so the scheduler callback returns immediately
 * and does not block the next cron tick (avoids "missed execution" when IO is slow).
 * Optional: call GET /api/cron/shift-reminders from external cron so reminders
 * still run when the process was sleeping (e.g. Railway).
 */

const cron = require("node-cron");

async function runReminders24h(app) {
  const { Notification, sequelize } = app.locals.models;
  try {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    const tomorrowEnd = new Date(tomorrow);
    tomorrowEnd.setHours(23, 59, 59, 999);

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
      const [hours, minutes] = shift.shift_start.split(":").map(Number);
      const shiftStartTime = new Date(shift.shift_date);
      shiftStartTime.setHours(hours, minutes, 0, 0);
      const hoursUntilShift = (shiftStartTime - now) / (1000 * 60 * 60);
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
}

async function runReminders2h(app) {
  const { Notification, sequelize } = app.locals.models;
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
          (s.shift_date = CURRENT_DATE AND 
           TO_TIMESTAMP(CURRENT_DATE || ' ' || s.shift_start, 'YYYY-MM-DD HH24:MI:SS') 
           BETWEEN NOW() + INTERVAL '1 hour 45 minutes' 
           AND NOW() + INTERVAL '2 hours 15 minutes')
        )
    `);

    for (const shift of shifts) {
      const existingReminder = await Notification.findOne({
        where: { type: "SHIFT_REMINDER_2H", entityId: shift.id },
      });
      const metaMatches =
        existingReminder &&
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
}

async function runReminders30m(app) {
  const { Notification, sequelize } = app.locals.models;
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
      const existingReminder = await Notification.findOne({
        where: { type: "SHIFT_REMINDER_30M", entityId: shift.id },
      });
      const metaMatches =
        existingReminder &&
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
}

/**
 * Run all three reminder jobs. Used by in-process cron and by HTTP cron endpoint.
 */
async function runAllShiftReminders(app) {
  await runReminders24h(app);
  await runReminders2h(app);
  await runReminders30m(app);
}

/**
 * Schedule shift reminder notifications.
 * Each cron callback returns immediately; work runs in setImmediate to avoid blocking the scheduler.
 */
function scheduleShiftReminders(app) {
  // Every hour at :00 — 24h reminders
  cron.schedule("0 * * * *", () => {
    setImmediate(() => runReminders24h(app));
  });

  // Every 15 minutes — 2h reminders
  cron.schedule("*/15 * * * *", () => {
    setImmediate(() => runReminders2h(app));
  });

  // Every 5 minutes — 30m reminders
  cron.schedule("*/5 * * * *", () => {
    setImmediate(() => runReminders30m(app));
  });

  console.log("✅ Shift reminders scheduler started");
}

module.exports = {
  scheduleShiftReminders,
  runAllShiftReminders,
  runReminders24h,
  runReminders2h,
  runReminders30m,
};
