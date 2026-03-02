/**
 * Guard Shift Management Routes
 * 
 * Routes for guard shift management features:
 * - Shift Swap Marketplace
 * - Shift Availability Preferences
 * - Shift Notes & Reports
 * - Shift History & Analytics
 */

const express = require("express");
const router = express.Router();

const {
  // Shift Swap
  requestShiftSwap,
  getAvailableSwaps,
  acceptShiftSwap,
  cancelShiftSwap,
  
  // Availability Preferences
  getAvailabilityPreferences,
  updateAvailabilityPreferences,
  
  // Shift Reports
  submitShiftReport,
  getShiftReport,
  
  // Shift History & Analytics
  getShiftHistory,
  getShiftAnalytics,
} = require("../controllers/guardShiftManagement.controller");

// Guard authentication middleware
const authGuard = require("../middleware/authGuard");

// =====================
// SHIFT SWAP MARKETPLACE
// =====================

/**
 * POST /api/guards/shifts/swap/request
 * Request a shift swap
 */
router.post("/shifts/swap/request", authGuard, requestShiftSwap);

/**
 * GET /api/guards/shifts/swap/available
 * Get available shifts for swapping
 */
router.get("/shifts/swap/available", authGuard, getAvailableSwaps);

/**
 * POST /api/guards/shifts/swap/:id/accept
 * Accept a shift swap request
 */
router.post("/shifts/swap/:id/accept", authGuard, acceptShiftSwap);

/**
 * DELETE /api/guards/shifts/swap/:id/cancel
 * Cancel a shift swap request (only requester can cancel)
 */
router.delete("/shifts/swap/:id/cancel", authGuard, cancelShiftSwap);

// =====================
// SHIFT AVAILABILITY PREFERENCES
// =====================

/**
 * GET /api/guards/availability/preferences
 * Get guard availability preferences
 */
router.get("/availability/preferences", authGuard, getAvailabilityPreferences);

/**
 * PUT /api/guards/availability/preferences
 * Update guard availability preferences
 */
router.put("/availability/preferences", authGuard, updateAvailabilityPreferences);

// =====================
// SHIFT NOTES & REPORTS
// =====================

/**
 * POST /api/guards/shifts/:id/report
 * Submit a shift report/notes
 */
router.post("/shifts/:id/report", authGuard, submitShiftReport);

/**
 * GET /api/guards/shifts/:id/report
 * Get shift report
 */
router.get("/shifts/:id/report", authGuard, getShiftReport);

// =====================
// SHIFT HISTORY & ANALYTICS
// =====================

/**
 * GET /api/guards/shifts/history
 * Get guard's shift history with analytics
 */
router.get("/shifts/history", authGuard, getShiftHistory);

/**
 * GET /api/guards/shifts/analytics
 * Get detailed shift analytics for guard
 */
router.get("/shifts/analytics", authGuard, getShiftAnalytics);

module.exports = router;
