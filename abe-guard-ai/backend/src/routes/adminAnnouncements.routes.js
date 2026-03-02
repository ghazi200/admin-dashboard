const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const announcementsController = require("../controllers/adminAnnouncements.controller");

/**
 * POST /api/admin/announcements
 * Create a new announcement
 */
router.post("/", auth, announcementsController.createAnnouncement);

/**
 * GET /api/admin/announcements
 * Get all announcements
 */
router.get("/", auth, announcementsController.getAnnouncements);

/**
 * PUT /api/admin/announcements/:id
 * Update an announcement
 */
router.put("/:id", auth, announcementsController.updateAnnouncement);

/**
 * DELETE /api/admin/announcements/:id
 * Delete an announcement
 */
router.delete("/:id", auth, announcementsController.deleteAnnouncement);

module.exports = router;
