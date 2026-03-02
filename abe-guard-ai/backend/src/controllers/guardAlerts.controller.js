/**
 * Guard Alerts Controller
 * 
 * API endpoints for weather, traffic, and transit alerts
 */

const { getWeatherForLocation, getWeatherWarnings } = require("../services/weatherAlerts.service");
const { getTrafficForRoute } = require("../services/trafficAlerts.service");
const { getTransitOptions, compareTransitVsDriving } = require("../services/transitAlerts.service");
const { getCombinedAlerts } = require("../services/combinedAlerts.service");
const { pool } = require("../config/db");
const { canGuardAccessResource } = require("../utils/guardTenantFilter");

/**
 * GET /api/guard/alerts/weather/:shiftId
 * Get weather alerts for a shift
 */
exports.getWeatherAlert = async (req, res) => {
  try {
    const guardId = req.user?.guardId || req.user?.id;
    const shiftId = req.params.shiftId;

    if (!guardId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Get shift details
    const shiftResult = await pool.query(
      `SELECT id, shift_date, shift_start, shift_end, location, guard_id
       FROM public.shifts
       WHERE id = $1
       LIMIT 1`,
      [shiftId]
    );
    const shiftRows = shiftResult.rows || [];

    if (shiftRows.length === 0) {
      return res.status(404).json({ error: "Shift not found" });
    }

    const shift = shiftRows[0];

    // Verify guard has access to this shift
    if (shift.guard_id && String(shift.guard_id) !== String(guardId)) {
      return res.status(403).json({ error: "Access denied" });
    }

    // ✅ Multi-tenant: Verify guard can access this shift's tenant
    if (!canGuardAccessResource(req.user, shift)) {
      return res.status(403).json({ 
        error: "Access denied - shift belongs to different tenant" 
      });
    }

    // Get weather
    const weather = await getWeatherForLocation(shift.location, shift.shift_date ? new Date(shift.shift_date) : null);

    return res.json({
      shiftId: shift.id,
      location: shift.location,
      weather: weather,
    });
  } catch (error) {
    console.error("Get weather alert error:", error);
    return res.status(500).json({
      error: "Server error",
      message: error.message,
    });
  }
};

/**
 * GET /api/guard/alerts/traffic/:shiftId
 * Get traffic alerts for a shift
 */
exports.getTrafficAlert = async (req, res) => {
  try {
    const guardId = req.user?.guardId || req.user?.id;
    const shiftId = req.params.shiftId;
    const origin = req.query.origin || null; // Guard's starting location

    if (!guardId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Get shift details
    const shiftResult = await pool.query(
      `SELECT id, shift_date, shift_start, shift_end, location, guard_id
       FROM public.shifts
       WHERE id = $1
       LIMIT 1`,
      [shiftId]
    );
    const shiftRows = shiftResult.rows || [];

    if (shiftRows.length === 0) {
      return res.status(404).json({ error: "Shift not found" });
    }

    const shift = shiftRows[0];

    // Verify guard has access to this shift
    if (shift.guard_id && String(shift.guard_id) !== String(guardId)) {
      return res.status(403).json({ error: "Access denied" });
    }

    // ✅ Multi-tenant: Verify guard can access this shift's tenant
    if (!canGuardAccessResource(req.user, shift)) {
      return res.status(403).json({ 
        error: "Access denied - shift belongs to different tenant" 
      });
    }

    if (!origin) {
      return res.status(400).json({
        error: "Origin location required",
        message: "Provide 'origin' query parameter with your starting location",
      });
    }

    // Calculate departure time (30 min before shift start)
    const shiftDate = shift.shift_date ? new Date(shift.shift_date) : new Date();
    const [hours, minutes] = (shift.shift_start || "09:00").split(":").map(Number);
    shiftDate.setHours(hours, minutes || 0, 0, 0);
    const leaveTime = new Date(shiftDate.getTime() - 30 * 60000);

    // Get traffic
    const traffic = await getTrafficForRoute(origin, shift.location, leaveTime);

    return res.json({
      shiftId: shift.id,
      origin: origin,
      destination: shift.location,
      traffic: traffic,
    });
  } catch (error) {
    console.error("Get traffic alert error:", error);
    return res.status(500).json({
      error: "Server error",
      message: error.message,
    });
  }
};

/**
 * GET /api/guard/alerts/transit/:shiftId
 * Get transit options for a shift
 */
exports.getTransitAlert = async (req, res) => {
  try {
    const guardId = req.user?.guardId || req.user?.id;
    const shiftId = req.params.shiftId;
    const origin = req.query.origin || null;

    if (!guardId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Get shift details
    const shiftResult = await pool.query(
      `SELECT id, shift_date, shift_start, shift_end, location, guard_id
       FROM public.shifts
       WHERE id = $1
       LIMIT 1`,
      [shiftId]
    );
    const shiftRows = shiftResult.rows || [];

    if (shiftRows.length === 0) {
      return res.status(404).json({ error: "Shift not found" });
    }

    const shift = shiftRows[0];

    // Verify guard has access to this shift
    if (shift.guard_id && String(shift.guard_id) !== String(guardId)) {
      return res.status(403).json({ error: "Access denied" });
    }

    // ✅ Multi-tenant: Verify guard can access this shift's tenant
    if (!canGuardAccessResource(req.user, shift)) {
      return res.status(403).json({ 
        error: "Access denied - shift belongs to different tenant" 
      });
    }

    if (!origin) {
      return res.status(400).json({
        error: "Origin location required",
        message: "Provide 'origin' query parameter with your starting location",
      });
    }

    // Calculate departure time
    const shiftDate = shift.shift_date ? new Date(shift.shift_date) : new Date();
    const [hours, minutes] = (shift.shift_start || "09:00").split(":").map(Number);
    shiftDate.setHours(hours, minutes || 0, 0, 0);
    const leaveTime = new Date(shiftDate.getTime() - 30 * 60000);

    // Get transit options
    const transit = await getTransitOptions(origin, shift.location, leaveTime);

    return res.json({
      shiftId: shift.id,
      origin: origin,
      destination: shift.location,
      transit: transit,
    });
  } catch (error) {
    console.error("Get transit alert error:", error);
    return res.status(500).json({
      error: "Server error",
      message: error.message,
    });
  }
};

/**
 * GET /api/guard/alerts/combined/:shiftId
 * Get combined weather, traffic, and transit alerts
 */
exports.getCombinedAlert = async (req, res) => {
  try {
    const guardId = req.user?.guardId || req.user?.id;
    const shiftId = req.params.shiftId;
    const origin = req.query.origin || null;
    const includeTransit = req.query.includeTransit !== "false"; // Default true

    if (!guardId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Get shift details
    const shiftResult = await pool.query(
      `SELECT id, shift_date, shift_start, shift_end, location, guard_id
       FROM public.shifts
       WHERE id = $1
       LIMIT 1`,
      [shiftId]
    );
    const shiftRows = shiftResult.rows || [];

    if (shiftRows.length === 0) {
      return res.status(404).json({ error: "Shift not found" });
    }

    const shift = shiftRows[0];

    // Verify guard has access to this shift
    if (shift.guard_id && String(shift.guard_id) !== String(guardId)) {
      return res.status(403).json({ error: "Access denied" });
    }

    // ✅ Multi-tenant: Verify guard can access this shift's tenant
    if (!canGuardAccessResource(req.user, shift)) {
      return res.status(403).json({ 
        error: "Access denied - shift belongs to different tenant" 
      });
    }

    // Get combined alerts
    const alerts = await getCombinedAlerts(shift, {
      origin: origin,
      includeTransit: includeTransit,
    });

    return res.json(alerts);
  } catch (error) {
    console.error("Get combined alert error:", error);
    return res.status(500).json({
      error: "Server error",
      message: error.message,
    });
  }
};

/**
 * GET /api/guard/alerts/upcoming
 * Get alerts for all upcoming shifts
 */
exports.getUpcomingAlerts = async (req, res) => {
  try {
    const guardId = req.user?.guardId || req.user?.id;
    const origin = req.query.origin || null;
    const includeTransit = req.query.includeTransit !== "false";
    const limit = parseInt(req.query.limit || "5", 10);

    if (!guardId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Get upcoming shifts for this guard
    const shiftResult = await pool.query(
      `SELECT id, shift_date, shift_start, shift_end, location, guard_id
       FROM public.shifts
       WHERE guard_id = $1
         AND shift_date >= CURRENT_DATE
         AND status = 'OPEN'
       ORDER BY shift_date ASC, shift_start ASC
       LIMIT $2`,
      [guardId, limit]
    );
    const shiftRows = shiftResult.rows || [];

    const alerts = [];

    // Get alerts for each shift
    for (const shift of shiftRows) {
      try {
        const alert = await getCombinedAlerts(shift, {
          origin: origin,
          includeTransit: includeTransit,
        });
        alerts.push(alert);
      } catch (err) {
        console.error(`Error getting alerts for shift ${shift.id}:`, err.message);
        // Continue with other shifts even if one fails
      }
    }

    return res.json({
      alerts: alerts,
      count: alerts.length,
    });
  } catch (error) {
    console.error("Get upcoming alerts error:", error);
    return res.status(500).json({
      error: "Server error",
      message: error.message,
    });
  }
};
