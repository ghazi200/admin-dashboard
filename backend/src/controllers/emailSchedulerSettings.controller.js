/**
 * Email Scheduler Settings Controller
 * Manages configuration for automated email scheduling
 */

exports.getSettings = async (req, res) => {
  try {
    const { EmailSchedulerSettings } = req.app.locals.models;
    const tenantId = req.admin?.tenant_id || null;

    // Get settings for both types
    const [scheduledReports, scheduleEmails] = await Promise.all([
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

    // Create defaults if they don't exist
    const defaultScheduledReports = {
      settingType: "scheduled_reports",
      enabled: true,
      intervalMinutes: 60,
      runTimes: [],
      timezone: "America/New_York",
    };

    const defaultScheduleEmails = {
      settingType: "schedule_emails",
      enabled: true,
      intervalMinutes: 360,
      runTimes: [],
      timezone: "America/New_York",
    };

    return res.json({
      scheduledReports: scheduledReports || defaultScheduledReports,
      scheduleEmails: scheduleEmails || defaultScheduleEmails,
    });
  } catch (e) {
    console.error("getEmailSchedulerSettings error:", e);
    return res.status(500).json({
      message: "Failed to get email scheduler settings",
      error: e.message,
    });
  }
};

exports.updateSettings = async (req, res) => {
  try {
    const { EmailSchedulerSettings } = req.app.locals.models;
    const tenantId = req.admin?.tenant_id || null;
    const { settingType, enabled, intervalMinutes, runTimes, timezone } = req.body;

    if (!settingType || !["scheduled_reports", "schedule_emails"].includes(settingType)) {
      return res.status(400).json({
        message: "settingType must be 'scheduled_reports' or 'schedule_emails'",
      });
    }

    // Find or create settings
    let settings = await EmailSchedulerSettings.findOne({
      where: {
        settingType,
        ...(tenantId ? { tenantId } : { tenantId: null }),
      },
    });

    const updateData = {};
    if (enabled !== undefined) updateData.enabled = enabled;
    if (intervalMinutes !== undefined) updateData.intervalMinutes = parseInt(intervalMinutes) || 60;
    if (runTimes !== undefined) {
      updateData.runTimes = Array.isArray(runTimes) ? runTimes : [];
    }
    if (timezone !== undefined) updateData.timezone = timezone;

    if (settings) {
      await settings.update(updateData);
    } else {
      settings = await EmailSchedulerSettings.create({
        settingType,
        tenantId: tenantId || null,
        enabled: enabled !== undefined ? enabled : true,
        intervalMinutes: intervalMinutes !== undefined ? parseInt(intervalMinutes) : 60,
        runTimes: Array.isArray(runTimes) ? runTimes : [],
        timezone: timezone || "America/New_York",
      });
    }

    // Reload schedulers with new settings
    const emailSchedulerManager = req.app.get("emailSchedulerManager");
    if (emailSchedulerManager) {
      await emailSchedulerManager.reloadSchedulers(req.app.locals.models);
    }

    // Emit socket event for real-time updates
    const io = req.app.get("io");
    if (io) {
      io.to("role:all").emit("email_scheduler_settings_updated", {
        settingType,
        settings: settings.toJSON(),
      });
    }

    return res.json({
      message: "Email scheduler settings updated successfully",
      settings,
    });
  } catch (e) {
    console.error("updateEmailSchedulerSettings error:", e);
    return res.status(500).json({
      message: "Failed to update email scheduler settings",
      error: e.message,
    });
  }
};
