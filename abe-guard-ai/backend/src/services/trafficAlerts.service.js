/**
 * Traffic Alerts Service
 * 
 * Provides traffic information and route suggestions for guards
 * Calculates travel time and identifies delays
 */

const axios = require("axios");

const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;
const GOOGLE_MAPS_DIRECTIONS_URL = "https://maps.googleapis.com/maps/api/directions/json";
const GOOGLE_MAPS_GEOCODE_URL = "https://maps.googleapis.com/maps/api/geocode/json";

/**
 * Geocode an address to coordinates
 * @param {string} address - Address string
 * @returns {Promise<Object>} { lat, lng } or null
 */
async function geocodeAddress(address) {
  if (!GOOGLE_MAPS_API_KEY) {
    return null;
  }

  try {
    const response = await axios.get(GOOGLE_MAPS_GEOCODE_URL, {
      params: {
        address: address,
        key: GOOGLE_MAPS_API_KEY,
      },
    });

    if (response.data.status === "OK" && response.data.results.length > 0) {
      const location = response.data.results[0].geometry.location;
      return {
        lat: location.lat,
        lng: location.lng,
        formatted: response.data.results[0].formatted_address,
      };
    }

    return null;
  } catch (error) {
    console.error("Geocoding error:", error.message);
    return null;
  }
}

/**
 * Get traffic information for a route
 * @param {string} origin - Starting location (address or "lat,lng")
 * @param {string} destination - Shift location (address or "lat,lng")
 * @param {Date} departureTime - When guard needs to leave (optional)
 * @returns {Promise<Object>} Traffic and route information
 */
async function getTrafficForRoute(origin, destination, departureTime = null) {
  if (!GOOGLE_MAPS_API_KEY) {
    return {
      available: false,
      message: "Google Maps API key not configured",
    };
  }

  try {
    // Geocode addresses if needed
    let originCoords = origin;
    let destCoords = destination;

    // Check if already coordinates
    if (!origin.match(/^-?\d+\.?\d*,-?\d+\.?\d*$/)) {
      const originGeo = await geocodeAddress(origin);
      if (!originGeo) {
        return {
          available: false,
          message: "Could not geocode origin address",
        };
      }
      originCoords = `${originGeo.lat},${originGeo.lng}`;
    }

    if (!destination.match(/^-?\d+\.?\d*,-?\d+\.?\d*$/)) {
      const destGeo = await geocodeAddress(destination);
      if (!destGeo) {
        return {
          available: false,
          message: "Could not geocode destination address",
        };
      }
      destCoords = `${destGeo.lat},${destGeo.lng}`;
    }

    // Build request params
    const params = {
      origin: originCoords,
      destination: destCoords,
      mode: "driving",
      key: GOOGLE_MAPS_API_KEY,
      alternatives: true, // Get alternative routes
    };

    // Add departure time if provided (for traffic prediction)
    if (departureTime) {
      params.departure_time = Math.floor(departureTime.getTime() / 1000);
    } else {
      // Use current time for real-time traffic
      params.departure_time = Math.floor(Date.now() / 1000);
    }

    const response = await axios.get(GOOGLE_MAPS_DIRECTIONS_URL, { params });

    if (response.data.status !== "OK" || !response.data.routes.length) {
      return {
        available: false,
        message: response.data.status || "No routes found",
      };
    }

    // Process routes
    const routes = response.data.routes.map((route, index) => {
      const leg = route.legs[0];
      const duration = leg.duration.value; // seconds
      const durationInTraffic = leg.duration_in_traffic?.value || duration; // seconds
      const delay = durationInTraffic - duration;

      return {
        index: index,
        summary: route.summary,
        distance: leg.distance.text,
        distanceMeters: leg.distance.value,
        duration: Math.round(duration / 60), // minutes
        durationInTraffic: Math.round(durationInTraffic / 60), // minutes
        delay: Math.round(delay / 60), // minutes
        steps: leg.steps.map((step) => ({
          instruction: step.html_instructions,
          distance: step.distance.text,
          duration: Math.round(step.duration.value / 60),
        })),
        warnings: route.warnings || [],
      };
    });

    // Find best route (shortest time)
    const bestRoute = routes.reduce((best, current) => {
      return current.durationInTraffic < best.durationInTraffic ? current : best;
    }, routes[0]);

    // Determine alert level
    let alertLevel = "INFO";
    const issues = [];
    let recommendation = "";

    if (bestRoute.delay > 30) {
      alertLevel = "CRITICAL";
      issues.push(`Major traffic delay: +${bestRoute.delay} minutes`);
      recommendation = `Leave ${bestRoute.delay + 10} minutes earlier`;
    } else if (bestRoute.delay > 15) {
      alertLevel = "WARNING";
      issues.push(`Traffic delay: +${bestRoute.delay} minutes`);
      recommendation = `Leave ${bestRoute.delay + 5} minutes earlier`;
    } else if (bestRoute.delay > 0) {
      alertLevel = "INFO";
      issues.push(`Minor delay: +${bestRoute.delay} minutes`);
    }

    // Check for route warnings
    if (bestRoute.warnings.length > 0) {
      issues.push(...bestRoute.warnings);
    }

    return {
      available: true,
      origin: origin,
      destination: destination,
      routes: routes,
      bestRoute: bestRoute,
      alertLevel: alertLevel,
      issues: issues,
      recommendation: recommendation,
      currentTime: Math.round(Date.now() / 1000),
    };
  } catch (error) {
    console.error("Traffic API error:", error.message);
    return {
      available: false,
      message: error.response?.data?.error_message || error.message,
    };
  }
}

/**
 * Calculate route time without traffic (baseline)
 * @param {string} origin - Starting location
 * @param {string} destination - Destination location
 * @returns {Promise<number>} Normal travel time in minutes
 */
async function calculateNormalRouteTime(origin, destination) {
  const traffic = await getTrafficForRoute(origin, destination);
  if (!traffic.available) return null;
  return traffic.bestRoute.duration; // Duration without traffic
}

module.exports = {
  getTrafficForRoute,
  calculateNormalRouteTime,
  geocodeAddress,
};
