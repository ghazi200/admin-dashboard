/**
 * Email Scheduler Manager Service
 * Manages dynamic scheduling of email jobs based on database settings
 */

let reportSchedulerInterval = null;
let scheduleEmailInterval = null;

/**
 * Start or update report scheduler based on settings
 */
function startReportScheduler(models, settings) {
  // Clear existing interval
  if (reportSchedulerInterval) {
    clearInterval(reportSchedulerInterval);
    reportSchedulerInterval = null;
  }

  if (!settings || !settings.enabled) {
    console.log("⚠️  Scheduled reports emailing is DISABLED");
    return;
  }

  const reportSchedulerService = require("./reportScheduler.service");
  const intervalMs = (settings.intervalMinutes || 60) * 60 * 1000;

  // Set up interval
  reportSchedulerInterval = setInterval(async () => {
    try {
      await reportSchedulerService.processScheduledReports(models);
    } catch (error) {
      console.error("❌ Report scheduler error:", error);
    }
  }, intervalMs);

  // Run immediately on startup (if enabled)
  setTimeout(async () => {
    try {
      await reportSchedulerService.processScheduledReports(models);
    } catch (error) {
      console.error("❌ Report scheduler startup error:", error);
    }
  }, 5000);

  console.log(`✅ Report scheduler started (runs every ${settings.intervalMinutes || 60} minutes)`);
}

/**
 * Start or update schedule email scheduler based on settings
 */
function startScheduleEmailScheduler(models, settings) {
  // Clear existing interval
  if (scheduleEmailInterval) {
    clearInterval(scheduleEmailInterval);
    scheduleEmailInterval = null;
  }

  if (!settings || !settings.enabled) {
    console.log("⚠️  Schedule emails are DISABLED");
    return;
  }

  const scheduleEmailService = require("./scheduleEmail.service");
  const intervalMs = (settings.intervalMinutes || 360) * 60 * 1000;

  // Set up interval
  scheduleEmailInterval = setInterval(async () => {
    try {
      await scheduleEmailService.processScheduledEmails(models);
    } catch (error) {
      console.error("❌ Schedule email scheduler error:", error);
    }
  }, intervalMs);

  // Run immediately on startup (if enabled)
  setTimeout(async () => {
    try {
      await scheduleEmailService.processScheduledEmails(models);
    } catch (error) {
      console.error("❌ Schedule email scheduler startup error:", error);
    }
  }, 15000);

  console.log(`✅ Schedule email scheduler started (runs every ${settings.intervalMinutes || 360} minutes)`);
}

/**
 * Initialize schedulers from database settings
 */
async function initializeSchedulers(models) {
  try {
    const { EmailSchedulerSettings } = models;
    const tenantId = null; // Global settings for now

    // Get settings
    const [scheduledReportsSettings, scheduleEmailsSettings] = await Promise.all([
      EmailSchedulerSettings.findOne({
        where: {
          settingType: "scheduled_reports",
          ...(tenantId ? { tenantId } : { tenantId: null }),
        },
      }),
      EmailSchedulerSettings.findOne({
        where: {
          settingType: "schedule_emails",
          ...(tenantId ? { tenantId } : { tenantId: null }),
        },
      }),
    ]);

    // Start schedulers with settings
    startReportScheduler(models, scheduledReportsSettings);
    startScheduleEmailScheduler(models, scheduleEmailsSettings);
  } catch (error) {
    console.error("❌ Error initializing email schedulers:", error);
  }
}

/**
 * Reload schedulers (called when settings are updated)
 */
async function reloadSchedulers(models) {
  console.log("🔄 Reloading email schedulers...");
  await initializeSchedulers(models);
}

/**
 * Stop all schedulers
 */
function stopAllSchedulers() {
  if (reportSchedulerInterval) {
    clearInterval(reportSchedulerInterval);
    reportSchedulerInterval = null;
  }
  if (scheduleEmailInterval) {
    clearInterval(scheduleEmailInterval);
    scheduleEmailInterval = null;
  }
  console.log("🛑 All email schedulers stopped");
}

module.exports = {
  initializeSchedulers,
  reloadSchedulers,
  startReportScheduler,
  startScheduleEmailScheduler,
  stopAllSchedulers,
};
