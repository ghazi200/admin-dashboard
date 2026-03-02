/**
 * Transit Alerts Service
 * 
 * OPTION A: Google Maps Directions API (Transit Mode)
 * 
 * Provides public transportation options (buses, trains, subways, light rail)
 * Shows routes, schedules, delays, and compares with driving
 * 
 * Features:
 * - Bus routes (BUS)
 * - Train routes (SUBWAY, HEAVY_RAIL, LIGHT_RAIL, TRAM)
 * - Walking directions to/from stations
 * - Transfer information
 * - Schedule-based arrival/departure times
 * - Route alternatives
 * 
 * API: Google Maps Directions API with mode=transit
 * Documentation: https://developers.google.com/maps/documentation/directions
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
 * Get public transit options for a route
 * @param {string} origin - Starting location (address or "lat,lng")
 * @param {string} destination - Shift location (address or "lat,lng")
 * @param {Date} departureTime - When guard needs to arrive
 * @returns {Promise<Object>} Transit options with delays
 */
async function getTransitOptions(origin, destination, departureTime = null) {
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

    // Build request params for transit
    const params = {
      origin: originCoords,
      destination: destCoords,
      mode: "transit",
      key: GOOGLE_MAPS_API_KEY,
      alternatives: true, // Get multiple route options
    };

    // Add departure time if provided
    if (departureTime) {
      params.departure_time = Math.floor(departureTime.getTime() / 1000);
    } else {
      // Use current time
      params.departure_time = Math.floor(Date.now() / 1000);
    }

    const response = await axios.get(GOOGLE_MAPS_DIRECTIONS_URL, { params });

    if (response.data.status !== "OK" || !response.data.routes.length) {
      return {
        available: false,
        message: response.data.status || "No transit routes found",
      };
    }

    // Process transit routes
    const transitOptions = [];

    for (const route of response.data.routes) {
      const leg = route.legs[0];
      const steps = leg.steps || [];

      // Extract transit details
      const transitSteps = steps.filter((step) => step.travel_mode === "TRANSIT");
      const walkingSteps = steps.filter((step) => step.travel_mode === "WALKING");

      let totalWalkingTime = 0;
      let totalTransitTime = 0;
      const stops = [];
      let primaryMode = "transit";
      let routeName = "Transit";

      // Process transit steps
      for (const step of transitSteps) {
        if (step.transit_details) {
          const transit = step.transit_details;
          totalTransitTime += step.duration.value;
          
          const line = transit.line;
          const vehicle = transit.vehicle;
          
          // OPTION A: Google Maps API vehicle types
          if (vehicle?.type === "BUS") {
            primaryMode = "bus";
            routeName = line?.short_name || line?.name || line?.long_name || "Bus";
          } else if (vehicle?.type === "SUBWAY" || vehicle?.type === "HEAVY_RAIL") {
            primaryMode = "train";
            routeName = line?.short_name || line?.name || line?.long_name || "Subway";
          } else if (vehicle?.type === "LIGHT_RAIL" || vehicle?.type === "TRAM") {
            primaryMode = "train";
            routeName = line?.short_name || line?.name || line?.long_name || "Light Rail";
          } else if (vehicle?.type === "COMMUTER_TRAIN" || vehicle?.type === "RAIL") {
            primaryMode = "train";
            routeName = line?.short_name || line?.name || line?.long_name || "Train";
          } else {
            // Fallback for other transit types
            primaryMode = "transit";
            routeName = line?.short_name || line?.name || line?.long_name || vehicle?.name || "Transit";
          }

          stops.push({
            name: transit.departure_stop?.name || "Station",
            time: new Date(transit.departure_time?.value * 1000),
            type: "departure",
            route: routeName,
          });

          stops.push({
            name: transit.arrival_stop?.name || "Station",
            time: new Date(transit.arrival_time?.value * 1000),
            type: "arrival",
            route: routeName,
          });
        }
      }

      // Calculate walking time
      for (const step of walkingSteps) {
        totalWalkingTime += step.duration.value;
      }

      const totalTime = Math.round(leg.duration.value / 60); // minutes
      const walkingTime = Math.round(totalWalkingTime / 60);
      const transitTime = Math.round(totalTransitTime / 60);
      const transfers = transitSteps.length - 1;

      // Check for delays (if real-time data available)
      // OPTION A: Google Maps API provides schedule-based times
      // For real-time delays, would need city-specific APIs (MTA, BART, etc.)
      let status = "on-time";
      let delays = 0;
      let alert = null;

      // Google Maps Directions API provides:
      // - Scheduled departure/arrival times (if available)
      // - Estimated duration based on schedules
      // - Real-time delays are NOT included in basic API
      // 
      // To add real-time delays (future enhancement):
      // - Option B: Integrate city-specific APIs (MTA API, BART API, etc.)
      // - Option C: Use TransitLand API for real-time data
      // - Option D: Use GTFS-RT feeds from transit agencies

      transitOptions.push({
        mode: primaryMode,
        routeName: routeName,
        departureTime: stops[0]?.time || departureTime,
        arrivalTime: stops[stops.length - 1]?.time || new Date(departureTime.getTime() + totalTime * 60000),
        totalTime: totalTime,
        walkingTime: walkingTime,
        transitTime: transitTime,
        transfers: transfers,
        status: status,
        delays: delays,
        alert: alert,
        stops: stops,
        summary: route.summary,
      });
    }

    // Sort by total time
    transitOptions.sort((a, b) => a.totalTime - b.totalTime);

    // Find best option
    const bestOption = transitOptions[0];

    return {
      available: true,
      origin: origin,
      destination: destination,
      options: transitOptions,
      bestOption: bestOption,
    };
  } catch (error) {
    console.error("Transit API error:", error.message);
    return {
      available: false,
      message: error.response?.data?.error_message || error.message,
    };
  }
}

/**
 * Compare transit vs driving
 * @param {Object} transitOptions - Transit route options
 * @param {Object} drivingRoute - Driving route info
 * @returns {Object} Comparison and recommendation
 */
function compareTransitVsDriving(transitOptions, drivingRoute) {
  if (!transitOptions.available || !drivingRoute.available) {
    return {
      available: false,
      message: "Cannot compare - missing route data",
    };
  }

  const bestTransit = transitOptions.bestOption;
  const bestDriving = drivingRoute.bestRoute;

  let bestMode = "driving";
  let reason = "";
  let recommendation = "";

  // Compare times
  if (bestTransit.totalTime < bestDriving.durationInTraffic) {
    bestMode = "transit";
    reason = `Transit is ${bestDriving.durationInTraffic - bestTransit.totalTime} minutes faster`;
    recommendation = `Take ${bestTransit.routeName} - fastest option`;
  } else if (bestTransit.totalTime <= bestDriving.durationInTraffic + 10) {
    bestMode = "transit";
    reason = "Similar time, but avoids traffic and parking";
    recommendation = `Consider ${bestTransit.routeName} - avoids traffic`;
  } else {
    bestMode = "driving";
    reason = `Driving is ${bestTransit.totalTime - bestDriving.durationInTraffic} minutes faster`;
    recommendation = "Driving is fastest option";
  }

  // Factor in delays
  if (bestTransit.delays > 15) {
    bestMode = "driving";
    reason = "Transit has significant delays";
    recommendation = "Driving recommended due to transit delays";
  }

  return {
    available: true,
    bestMode: bestMode,
    reason: reason,
    recommendation: recommendation,
    transit: {
      time: bestTransit.totalTime,
      mode: bestTransit.mode,
      route: bestTransit.routeName,
      delays: bestTransit.delays,
    },
    driving: {
      time: bestDriving.durationInTraffic,
      delay: bestDriving.delay,
    },
    timeDifference: Math.abs(bestTransit.totalTime - bestDriving.durationInTraffic),
  };
}

module.exports = {
  getTransitOptions,
  compareTransitVsDriving,
  geocodeAddress,
};
