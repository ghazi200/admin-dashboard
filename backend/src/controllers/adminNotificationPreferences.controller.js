/**
 * Notification Preferences Controller
 * 
 * Handles CRUD operations for user notification preferences
 */

const { Op } = require("sequelize");

/**
 * GET /api/admin/notifications/preferences
 * Get current user's notification preferences
 */
exports.getPreferences = async (req, res) => {
  try {
    const { NotificationPreference, sequelize } = req.app.locals.models;
    const adminId = req.admin?.id;

    if (!adminId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    // Check if table exists, if not create it
    try {
      await NotificationPreference.findOne({ limit: 1 });
    } catch (tableError) {
      if (tableError.name === "SequelizeDatabaseError" && tableError.message.includes("does not exist")) {
        console.log("⚠️ notification_preferences table does not exist, creating...");
        await NotificationPreference.sync({ force: false });
        console.log("✅ notification_preferences table created");
      } else {
        throw tableError;
      }
    }

    // Get or create default preferences
    let preferences = await NotificationPreference.findOne({
      where: { adminId },
    });

    if (!preferences) {
      // Create default preferences
      preferences = await NotificationPreference.create({
        adminId,
        // Defaults are set in model
      });
    }

    return res.json({
      data: preferences.toJSON(),
    });
  } catch (e) {
    console.error("❌ Error getting notification preferences:", e);
    console.error("❌ Error stack:", e.stack);
    return res.status(500).json({
      message: "Failed to load notification preferences",
      error: process.env.NODE_ENV === "development" ? e.message : undefined,
      details: process.env.NODE_ENV === "development" ? e.stack : undefined,
    });
  }
};

/**
 * PUT /api/admin/notifications/preferences
 * Update current user's notification preferences
 * Body: { minPriority?, allowedCategories?, allowedTypes?, blockedTypes?, enableRealtime?, etc. }
 */
exports.updatePreferences = async (req, res) => {
  try {
    const { NotificationPreference } = req.app.locals.models;
    const adminId = req.admin?.id;

    if (!adminId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    // Check if table exists, if not create it
    try {
      await NotificationPreference.findOne({ limit: 1 });
    } catch (tableError) {
      if (tableError.name === "SequelizeDatabaseError" && tableError.message.includes("does not exist")) {
        console.log("⚠️ notification_preferences table does not exist, creating...");
        await NotificationPreference.sync({ force: false });
        console.log("✅ notification_preferences table created");
      } else {
        throw tableError;
      }
    }

    // Get or create preferences
    let preferences = await NotificationPreference.findOne({
      where: { adminId },
    });

    if (!preferences) {
      preferences = await NotificationPreference.create({ adminId });
    }

    // Update allowed fields
    const allowedFields = [
      "minPriority",
      "allowedCategories",
      "allowedTypes",
      "blockedTypes",
      "enableRealtime",
      "enableDigest",
      "digestFrequency",
      "groupBy",
      "showAIInsights",
      "showQuickActions",
      "enableSound",
      "soundForPriority",
      "customFilters",
    ];

    const updates = {};
    allowedFields.forEach((field) => {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    });

    await preferences.update(updates);

    return res.json({
      message: "Preferences updated successfully",
      data: preferences.toJSON(),
    });
  } catch (e) {
    console.error("❌ Error updating notification preferences:", e);
    return res.status(500).json({
      message: "Failed to update notification preferences",
      error: process.env.NODE_ENV === "development" ? e.message : undefined,
    });
  }
};

/**
 * POST /api/admin/notifications/preferences/reset
 * Reset preferences to defaults
 */
exports.resetPreferences = async (req, res) => {
  try {
    const { NotificationPreference } = req.app.locals.models;
    const adminId = req.admin?.id;

    if (!adminId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    // Delete existing preferences (will be recreated on next get)
    await NotificationPreference.destroy({
      where: { adminId },
    });

    return res.json({
      message: "Preferences reset to defaults",
    });
  } catch (e) {
    console.error("❌ Error resetting notification preferences:", e);
    return res.status(500).json({
      message: "Failed to reset notification preferences",
      error: process.env.NODE_ENV === "development" ? e.message : undefined,
    });
  }
};

/**
 * Apply preferences filter to notifications
 * @param {Array} notifications - Array of notifications
 * @param {Object} preferences - NotificationPreference object
 * @returns {Array} Filtered notifications
 */
exports.applyPreferencesFilter = (notifications, preferences) => {
  if (!preferences) {
    return notifications; // No preferences = show all
  }

  return notifications.filter((notif) => {
    // Priority filter
    if (preferences.minPriority) {
      const priorityOrder = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
      const notifPriority = notif.priority || "MEDIUM";
      const minPriority = priorityOrder[preferences.minPriority] || 0;
      const notifPriorityValue = priorityOrder[notifPriority] || 0;
      
      if (notifPriorityValue < minPriority) {
        return false;
      }
    }

    // Category filter
    if (preferences.allowedCategories && Array.isArray(preferences.allowedCategories)) {
      const category = notif.category || "GENERAL";
      if (!preferences.allowedCategories.includes(category)) {
        return false;
      }
    }

    // Type filter
    if (preferences.allowedTypes && Array.isArray(preferences.allowedTypes)) {
      if (!preferences.allowedTypes.includes(notif.type)) {
        return false;
      }
    }

    // Blocked types
    if (preferences.blockedTypes && Array.isArray(preferences.blockedTypes)) {
      if (preferences.blockedTypes.includes(notif.type)) {
        return false;
      }
    }

    return true;
  });
};

module.exports = exports;
