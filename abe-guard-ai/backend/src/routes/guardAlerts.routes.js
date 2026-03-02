/**
 * Guard Alerts Routes
 * 
 * API routes for weather, traffic, and transit alerts
 */

const express = require("express");
const router = express.Router();
const auth = require("../middleware/guardAuth");
const {
  getWeatherAlert,
  getTrafficAlert,
  getTransitAlert,
  getCombinedAlert,
  getUpcomingAlerts,
} = require("../controllers/guardAlerts.controller");

/**
 * All routes require guard authentication
 */
router.use(auth);

/**
 * GET /api/guard/alerts/weather/:shiftId
 * Get weather alerts for a specific shift
 */
router.get("/weather/:shiftId", getWeatherAlert);

/**
 * GET /api/guard/alerts/traffic/:shiftId
 * Get traffic alerts for a specific shift
 * Query params: origin (required) - guard's starting location
 */
router.get("/traffic/:shiftId", getTrafficAlert);

/**
 * GET /api/guard/alerts/transit/:shiftId
 * Get public transit options for a specific shift
 * Query params: origin (required) - guard's starting location
 */
router.get("/transit/:shiftId", getTransitAlert);

/**
 * GET /api/guard/alerts/combined/:shiftId
 * Get combined weather, traffic, and transit alerts
 * Query params: 
 *   - origin (optional) - guard's starting location
 *   - includeTransit (optional, default: true) - include transit options
 */
router.get("/combined/:shiftId", getCombinedAlert);

/**
 * GET /api/guard/alerts/upcoming
 * Get alerts for all upcoming shifts
 * Query params:
 *   - origin (optional) - guard's starting location
 *   - includeTransit (optional, default: true)
 *   - limit (optional, default: 5) - max number of shifts
 */
router.get("/upcoming", getUpcomingAlerts);

module.exports = router;
