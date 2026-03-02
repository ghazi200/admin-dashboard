const express = require("express");
const router = express.Router();
const auth = require("../middleware/guardAuth");
const {
  getGuardNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
} = require("../controllers/guardNotifications.controller");

/**
 * All routes require guard authentication
 */
router.use(auth);

/**
 * GET /api/guard/notifications
 * Get all notifications for the authenticated guard
 */
router.get("/", getGuardNotifications);

/**
 * GET /api/guard/notifications/unread-count
 * Get count of unread notifications
 */
router.get("/unread-count", getUnreadCount);

/**
 * POST /api/guard/notifications/:id/read
 * Mark a notification as read
 */
router.post("/:id/read", markAsRead);

/**
 * POST /api/guard/notifications/mark-all-read
 * Mark all notifications as read
 */
router.post("/mark-all-read", markAllAsRead);

module.exports = router;
