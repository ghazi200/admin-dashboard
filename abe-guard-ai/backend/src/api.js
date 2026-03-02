// api.js
const axios = require("axios");

const BASE_URL = process.env.API_URL || "http://localhost:4000";


/* ----------------------------
   GUARD / SHIFTS API
----------------------------- */

/**
 * Get all shifts
 */
async function getShifts() {
  try {
    const res = await axios.get(`${BASE_URL}/shifts`);
    return res.data;
  } catch (err) {
    console.error("Error fetching shifts:", err.response?.data || err.message);
    throw err;
  }
}

/**
 * Get shift by ID
 */
async function getShiftById(shiftId) {
  try {
    const res = await axios.get(`${BASE_URL}/shifts/${shiftId}`);
    return res.data;
  } catch (err) {
    console.error("Error fetching shift:", err.response?.data || err.message);
    throw err;
  }
}

/**
 * Accept a shift
 */
async function acceptShift(shiftId, guardId) {
  try {
    const res = await axios.post(`${BASE_URL}/shifts/accept/${shiftId}/${guardId}`);
    return res.data;
  } catch (err) {
    console.error("Error accepting shift:", err.response?.data || err.message);
    throw err;
  }
}

/**
 * List open shifts
 */
async function getOpenShifts() {
  try {
    const res = await axios.get(`${BASE_URL}/shifts/open`);
    return res.data;
  } catch (err) {
    console.error("Error fetching open shifts:", err.response?.data || err.message);
    throw err;
  }
}

/* ----------------------------
   CALLOUT API
----------------------------- */

/**
 * Trigger test callout (simulate a guard callout)
 */
async function triggerCallout(shiftId, reason, callerGuardId) {
  try {
    const res = await axios.post(`${BASE_URL}/callouts/trigger`, {
      shiftId,
      reason,          // "SICK" | "EMERGENCY" | "PERSONAL"
      callerGuardId,   // exclude this guard from notifications
    });
    return res.data;
  } catch (err) {
    console.error("Error triggering callout:", err.response?.data || err.message);
    throw err;
  }
}

async function callOutShift(shiftId, guardId, reason) {
  // alias for clarity — uses same endpoint
  return triggerCallout(shiftId, reason, guardId);
}


/**
 * Guard calls out
 */
async function callOutShift(shiftId, guardId, reason) {
  try {
    const res = await axios.post(`${BASE_URL}/callouts`, {
      shiftId,
      guardId,
      reason, // "SICK", "EMERGENCY", "PERSONAL"
    });
    return res.data;
  } catch (err) {
    console.error("Error calling out:", err.response?.data || err.message);
    throw err;
  }
}

/* ----------------------------
   ADMIN API
----------------------------- */

/**
 * Get admin health/status
 */
async function getAdminHealth() {
  try {
    const res = await axios.get(`${BASE_URL}/admin/health`);
    return res.data;
  } catch (err) {
    console.error("Error getting admin health:", err.response?.data || err.message);
    throw err;
  }
}

/**
 * List all guards (admin)
 */
async function getAllGuards() {
  try {
    const res = await axios.get(`${BASE_URL}/admin/guards`);
    return res.data;
  } catch (err) {
    console.error("Error fetching guards:", err.response?.data || err.message);
    throw err;
  }
}

/**
 * List all notifications (admin)
 */
async function getAllNotifications() {
  try {
    const res = await axios.get(`${BASE_URL}/admin/notifications`);
    return res.data;
  } catch (err) {
    console.error("Error fetching notifications:", err.response?.data || err.message);
    throw err;
  }
}

/* ----------------------------
   EXPORT ALL FUNCTIONS
----------------------------- */
module.exports = {
  getShifts,
  getShiftById,
  acceptShift,
  getOpenShifts,
  triggerCallout,
  callOutShift,
  getAdminHealth,
  getAllGuards,
  getAllNotifications,
};
