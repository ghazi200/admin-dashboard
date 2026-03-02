const express = require("express");
const router = express.Router();
const auth = require("../middleware/guardAuth");
const announcementsController = require("../controllers/announcements.controller");

/**
 * GET /announcements
 * Get all active announcements for the authenticated guard
 */
router.get("/", auth, announcementsController.getAnnouncements);

/**
 * GET /announcements/unread-count
 * Get count of unread announcements
 */
router.get("/unread-count", auth, announcementsController.getUnreadCount);

/**
 * POST /announcements/:id/read
 * Mark an announcement as read
 */
router.post("/:id/read", auth, announcementsController.markAsRead);

module.exports = router;
