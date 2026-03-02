const express = require("express");
const router = express.Router();
const { Op } = require("sequelize");

const authAdmin = require("../middleware/authAdmin");
const smartNotificationService = require("../services/smartNotification.service");
const notificationPreferencesController = require("../controllers/adminNotificationPreferences.controller");

// Controller
router.get("/", authAdmin, async (req, res) => {
  try {
    const { Notification, NotificationRead } = req.app.locals.models;
    const limit = Math.min(parseInt(req.query.limit || "25", 10), 100);
    const adminId = req.admin?.id;

    // Filter by audience: "all", "admin", "supervisor", or user's role
    const userRole = req.admin?.role || "admin";
    const where = {
      [Op.or]: [
        { audience: "all" },
        { audience: userRole },
        { audience: "supervisor" } // Supervisors see supervisor notifications
      ]
    };

    const items = await Notification.findAll({
      where,
      order: [["createdAt", "DESC"]],
      limit,
    });

    // Read map for this admin
    const reads = await NotificationRead.findAll({
      where: { adminId },
      attributes: ["notificationId"],
    });
    const readSet = new Set(reads.map((r) => r.notificationId));

    const out = items.map((n) => ({
      ...n.toJSON(),
      read: readSet.has(n.id),
    }));

    res.json(out);
  } catch (e) {
    res.status(500).json({ message: "Failed to load notifications", error: e.message });
  }
});

router.get("/unread-count", authAdmin, async (req, res) => {
  try {
    const { Notification, NotificationRead } = req.app.locals.models;
    const adminId = req.admin?.id;

    const total = await Notification.count();

    const reads = await NotificationRead.count({
      where: { adminId },
    });

    const unread = Math.max(total - reads, 0);
    res.json({ unread });
  } catch (e) {
    res.status(500).json({ message: "Failed to load unread count", error: e.message });
  }
});

router.post("/:id/read", authAdmin, async (req, res) => {
  try {
    const { NotificationRead } = req.app.locals.models;

    const adminId = req.admin?.id;
    const notificationId = parseInt(req.params.id, 10);

    if (!notificationId) return res.status(400).json({ message: "Invalid notification id" });

    await NotificationRead.findOrCreate({
      where: { adminId, notificationId },
      defaults: { adminId, notificationId, readAt: new Date() },
    });

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ message: "Failed to mark read", error: e.message });
  }
});

/**
 * GET /api/admin/notifications/smart
 * Get notifications with smart grouping and prioritization
 * Query params: groupBy (priority|category|none), limit, priority, category
 */
router.get("/smart", authAdmin, async (req, res) => {
  try {
    const { Notification, NotificationRead, NotificationPreference } = req.app.locals.models;
    const adminId = req.admin?.id;
    
    if (!adminId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    
    const limit = Math.min(parseInt(req.query.limit || "50", 10), 200);
    const groupBy = req.query.groupBy || "priority"; // priority, category, none
    const priorityFilter = req.query.priority; // CRITICAL, HIGH, MEDIUM, LOW
    const categoryFilter = req.query.category; // COVERAGE, INCIDENT, etc.

    // Get user preferences (handle table not existing)
    let preferences = null;
    try {
      if (NotificationPreference) {
        preferences = await NotificationPreference.findOne({
          where: { adminId },
        }).catch(() => null); // Silently fail if table doesn't exist
      }
    } catch (prefError) {
      console.warn("⚠️ Could not load notification preferences:", prefError.message);
      // Continue without preferences
    }

    // Use preference groupBy if not overridden
    const effectiveGroupBy = groupBy !== "priority" ? groupBy : (preferences?.groupBy || "priority");

    // Build where clause - only use createdAt to avoid column errors
    const where = {};

    // Build order clause - use createdAt only to avoid errors if priority/urgency columns don't exist
    // We'll sort by priority in JavaScript after fetching
    const order = [["createdAt", "DESC"]];

    let items = [];
    try {
      items = await Notification.findAll({
        where,
        order,
        limit: limit * 2, // Get more to filter
      });
    } catch (dbError) {
      console.error("❌ Database error loading notifications:", dbError.message);
      // Try without any filters
      items = await Notification.findAll({
        order: [["createdAt", "DESC"]],
        limit: limit * 2,
      });
    }

    // Read map for this admin
    const reads = await NotificationRead.findAll({
      where: { adminId },
      attributes: ["notificationId"],
    });
    const readSet = new Set(reads.map((r) => r.notificationId));

    let notifications = items.map((n) => ({
      ...n.toJSON(),
      read: readSet.has(n.id),
    }));

    // Sort by priority in JavaScript (handles NULL values and missing columns)
    const priorityOrder = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
    notifications.sort((a, b) => {
      const aPriority = priorityOrder[a.priority] || 0;
      const bPriority = priorityOrder[b.priority] || 0;
      if (aPriority !== bPriority) {
        return bPriority - aPriority; // Higher priority first
      }
      // If same priority, sort by date
      return new Date(b.createdAt) - new Date(a.createdAt);
    });

    // Apply priority/category filters in JavaScript (in case columns don't exist in DB)
    if (priorityFilter) {
      notifications = notifications.filter((n) => n.priority === priorityFilter);
    }
    if (categoryFilter) {
      notifications = notifications.filter((n) => n.category === categoryFilter);
    }

    // Apply preferences filter (safely)
    try {
      if (notificationPreferencesController && notificationPreferencesController.applyPreferencesFilter) {
        notifications = notificationPreferencesController.applyPreferencesFilter(notifications, preferences);
      }
    } catch (filterError) {
      console.warn("⚠️ Could not apply preferences filter:", filterError.message);
      // Continue without filtering
    }
    
    notifications = notifications.slice(0, limit); // Apply limit after filtering

    // Group notifications if requested
    let grouped = null;
    try {
      if (effectiveGroupBy !== "none" && smartNotificationService && smartNotificationService.groupNotifications) {
        grouped = smartNotificationService.groupNotifications(notifications);
      }
    } catch (groupError) {
      console.warn("⚠️ Could not group notifications:", groupError.message);
      // Continue without grouping
    }

    res.json({
      notifications,
      grouped: grouped || null,
      total: notifications.length,
      unread: notifications.filter((n) => !n.read).length,
      preferences: preferences ? {
        groupBy: preferences.groupBy,
        showAIInsights: preferences.showAIInsights,
        showQuickActions: preferences.showQuickActions,
      } : null,
    });
  } catch (e) {
    console.error("❌ Error loading smart notifications:", e);
    console.error("❌ Error stack:", e.stack);
    res.status(500).json({
      message: "Failed to load smart notifications",
      error: process.env.NODE_ENV === "development" ? e.message : undefined,
      details: process.env.NODE_ENV === "development" ? e.stack : undefined,
    });
  }
});

/**
 * GET /api/admin/notifications/digest
 * Get digest summary of batched notifications
 * Query params: hours (default 24), category
 */
router.get("/digest", authAdmin, async (req, res) => {
  try {
    const { Notification, NotificationRead } = req.app.locals.models;
    const adminId = req.admin?.id;
    const hours = parseInt(req.query.hours || "24", 10);
    const categoryFilter = req.query.category;

    const since = new Date(Date.now() - hours * 60 * 60 * 1000);

    const where = {
      createdAt: { [require("sequelize").Op.gte]: since },
      priority: { [require("sequelize").Op.in]: ["MEDIUM", "LOW"] }, // Only batch non-critical
    };

    if (categoryFilter) {
      where.category = categoryFilter;
    }

    const items = await Notification.findAll({
      where,
      order: [["createdAt", "DESC"]],
      limit: 100,
    });

    // Read map
    const reads = await NotificationRead.findAll({
      where: { adminId },
      attributes: ["notificationId"],
    });
    const readSet = new Set(reads.map((r) => r.notificationId));

    const notifications = items.map((n) => ({
      ...n.toJSON(),
      read: readSet.has(n.id),
    }));

    // Create digest summary
    const digest = await smartNotificationService.createDigestSummary(notifications);

    res.json({
      digest,
      notifications,
      period: { hours, since: since.toISOString() },
    });
  } catch (e) {
    console.error("❌ Error loading notification digest:", e);
    res.status(500).json({ message: "Failed to load notification digest", error: e.message });
  }
});

/**
 * GET /api/admin/notifications/preferences
 * Get current user's notification preferences
 */
router.get("/preferences", authAdmin, notificationPreferencesController.getPreferences);

/**
 * PUT /api/admin/notifications/preferences
 * Update current user's notification preferences
 */
router.put("/preferences", authAdmin, notificationPreferencesController.updatePreferences);

/**
 * POST /api/admin/notifications/preferences/reset
 * Reset preferences to defaults
 */
router.post("/preferences/reset", authAdmin, notificationPreferencesController.resetPreferences);

module.exports = router;
