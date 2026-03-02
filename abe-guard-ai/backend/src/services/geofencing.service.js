/**
 * Geofencing Service
 * 
 * Provides functions for geofencing validation and distance calculations
 * using the Haversine formula for accurate distance between coordinates.
 */

/**
 * Calculate distance between two coordinates using Haversine formula
 * @param {number} lat1 - Latitude of first point
 * @param {number} lng1 - Longitude of first point
 * @param {number} lat2 - Latitude of second point
 * @param {number} lng2 - Longitude of second point
 * @returns {number} Distance in meters
 */
function calculateDistance(lat1, lng1, lat2, lng2) {
  // Validate inputs
  if (
    typeof lat1 !== 'number' || typeof lng1 !== 'number' ||
    typeof lat2 !== 'number' || typeof lng2 !== 'number' ||
    isNaN(lat1) || isNaN(lng1) || isNaN(lat2) || isNaN(lng2)
  ) {
    throw new Error('Invalid coordinates: all values must be valid numbers');
  }

  // Validate latitude and longitude ranges
  if (lat1 < -90 || lat1 > 90 || lat2 < -90 || lat2 > 90) {
    throw new Error('Invalid latitude: must be between -90 and 90');
  }
  if (lng1 < -180 || lng1 > 180 || lng2 < -180 || lng2 > 180) {
    throw new Error('Invalid longitude: must be between -180 and 180');
  }

  // Earth's radius in meters
  const R = 6371000; // 6,371 km = 6,371,000 meters

  // Convert degrees to radians
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lng2 - lng1) * Math.PI) / 180;

  // Haversine formula
  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  // Distance in meters
  const distance = R * c;

  return Math.round(distance * 100) / 100; // Round to 2 decimal places
}

/**
 * Check if guard location is within geofence radius
 * @param {number} guardLat - Guard's current latitude
 * @param {number} guardLng - Guard's current longitude
 * @param {number} shiftLat - Shift location latitude
 * @param {number} shiftLng - Shift location longitude
 * @param {number} radiusM - Geofence radius in meters (default: 100)
 * @returns {Object} { within: boolean, distance: number }
 */
function isWithinGeofence(guardLat, guardLng, shiftLat, shiftLng, radiusM = 100) {
  // If shift doesn't have coordinates, allow clock-in (backward compatibility)
  if (!shiftLat || !shiftLng || isNaN(shiftLat) || isNaN(shiftLng)) {
    return { within: true, distance: null, reason: 'no_geofence_set' };
  }

  // If guard location is missing, cannot validate
  if (!guardLat || !guardLng || isNaN(guardLat) || isNaN(guardLng)) {
    return { within: false, distance: null, reason: 'missing_guard_location' };
  }

  try {
    const distance = calculateDistance(guardLat, guardLng, shiftLat, shiftLng);
    const within = distance <= radiusM;

    return {
      within,
      distance,
      radius: radiusM,
      reason: within ? 'within_geofence' : 'outside_geofence'
    };
  } catch (error) {
    // If calculation fails, log error but don't block clock-in (fail open for now)
    console.error('❌ Geofencing calculation error:', error.message);
    return { within: true, distance: null, reason: 'calculation_error' };
  }
}

/**
 * Get geofence status for a shift and guard location
 * Fetches shift data and validates geofence
 * @param {string} shiftId - Shift ID
 * @param {number} guardLat - Guard's current latitude
 * @param {number} guardLng - Guard's current longitude
 * @param {Object} models - Sequelize models
 * @returns {Promise<Object>} Geofence status object
 */
async function getGeofenceStatus(shiftId, guardLat, guardLng, models) {
  const { Shift } = models;

  try {
    const shift = await Shift.findByPk(shiftId);

    if (!shift) {
      return {
        valid: false,
        within: false,
        reason: 'shift_not_found',
        error: 'Shift not found'
      };
    }

    // If shift doesn't have geofence configured, allow clock-in
    if (!shift.location_lat || !shift.location_lng) {
      return {
        valid: true,
        within: true,
        reason: 'no_geofence_configured',
        hasGeofence: false,
        message: 'Geofence not configured for this shift'
      };
    }

    // Check if within geofence
    const geofenceResult = isWithinGeofence(
      guardLat,
      guardLng,
      shift.location_lat,
      shift.location_lng,
      shift.geofence_radius_m || 100
    );

    return {
      valid: true,
      within: geofenceResult.within,
      distance: geofenceResult.distance,
      radius: geofenceResult.radius,
      reason: geofenceResult.reason,
      hasGeofence: true,
      shiftLocation: {
        lat: shift.location_lat,
        lng: shift.location_lng,
        radiusM: shift.geofence_radius_m || 100
      },
      guardLocation: {
        lat: guardLat,
        lng: guardLng
      }
    };
  } catch (error) {
    console.error('❌ Error getting geofence status:', error);
    return {
      valid: false,
      within: false,
      reason: 'error',
      error: error.message
    };
  }
}

module.exports = {
  calculateDistance,
  isWithinGeofence,
  getGeofenceStatus
};
