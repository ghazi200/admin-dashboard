/**
 * Combined Alerts Service
 * 
 * Combines weather, traffic, and transit alerts for a shift
 * Provides comprehensive travel recommendations
 */

const { getWeatherForLocation, getWeatherWarnings } = require("./weatherAlerts.service");
const { getTrafficForRoute, calculateNormalRouteTime } = require("./trafficAlerts.service");
const { getTransitOptions, compareTransitVsDriving } = require("./transitAlerts.service");

/**
 * Get combined alerts for a shift
 * @param {Object} shift - Shift object with location, date, time
 * @param {Object} options - { origin, includeTransit }
 * @returns {Promise<Object>} Combined weather, traffic, and transit alerts
 */
async function getCombinedAlerts(shift, options = {}) {
  const { origin = null, includeTransit = true } = options;
  const location = shift.location || shift.site_name || shift.site || "Unknown";
  const shiftDate = shift.shift_date ? new Date(shift.shift_date) : new Date();
  const shiftStart = shift.shift_start || "09:00";
  
  // Combine date and time for shift start
  const [hours, minutes] = shiftStart.split(":").map(Number);
  const shiftDateTime = new Date(shiftDate);
  shiftDateTime.setHours(hours, minutes || 0, 0, 0);

  // Calculate when guard should leave (30 min before shift, or based on travel time)
  const leaveTime = new Date(shiftDateTime.getTime() - 30 * 60000); // 30 min before

  // Get weather alerts
  const weather = await getWeatherForLocation(location, shiftDateTime);
  
  // Get traffic alerts (if origin provided)
  let traffic = null;
  if (origin) {
    traffic = await getTrafficForRoute(origin, location, leaveTime);
  }

  // Get transit options (if origin provided and enabled)
  let transit = null;
  let comparison = null;
  if (origin && includeTransit) {
    transit = await getTransitOptions(origin, location, leaveTime);
    
    // Compare transit vs driving
    if (transit.available && traffic && traffic.available) {
      comparison = compareTransitVsDriving(transit, traffic);
    }
  }

  // Calculate overall recommendation
  let overallRecommendation = "";
  let leaveEarlyMinutes = 0;
  const allIssues = [];

  // Weather issues
  if (weather.available && weather.alertLevel !== "INFO") {
    allIssues.push(...weather.warnings);
    if (weather.alertLevel === "CRITICAL") {
      leaveEarlyMinutes += 20;
    } else if (weather.alertLevel === "WARNING") {
      leaveEarlyMinutes += 10;
    }
  }

  // Traffic issues
  if (traffic && traffic.available) {
    if (traffic.alertLevel === "CRITICAL") {
      leaveEarlyMinutes += traffic.bestRoute.delay + 10;
      allIssues.push(...traffic.issues);
    } else if (traffic.alertLevel === "WARNING") {
      leaveEarlyMinutes += traffic.bestRoute.delay + 5;
      allIssues.push(...traffic.issues);
    }
  }

  // Transit delays
  if (transit && transit.available && transit.bestOption.delays > 0) {
    leaveEarlyMinutes += transit.bestOption.delays;
    allIssues.push(`${transit.bestOption.routeName} delayed by ${transit.bestOption.delays} minutes`);
  }

  // Build recommendation
  if (leaveEarlyMinutes > 0) {
    overallRecommendation = `Leave ${leaveEarlyMinutes} minutes earlier due to weather and traffic conditions`;
  } else if (comparison && comparison.available) {
    overallRecommendation = comparison.recommendation;
  } else if (weather.available && weather.recommendation) {
    overallRecommendation = weather.recommendation;
  } else if (traffic && traffic.available && traffic.recommendation) {
    overallRecommendation = traffic.recommendation;
  }

  // Determine overall alert level
  let overallAlertLevel = "INFO";
  if (weather.available && weather.alertLevel === "CRITICAL") {
    overallAlertLevel = "CRITICAL";
  } else if (traffic && traffic.alertLevel === "CRITICAL") {
    overallAlertLevel = "CRITICAL";
  } else if (weather.available && weather.alertLevel === "WARNING") {
    overallAlertLevel = "WARNING";
  } else if (traffic && traffic.alertLevel === "WARNING") {
    overallAlertLevel = "WARNING";
  }

  return {
    shiftId: shift.id,
    shiftDate: shift.shift_date,
    shiftTime: shiftStart,
    location: location,
    weather: weather.available ? {
      condition: weather.condition,
      description: weather.description,
      temperature: weather.temperature,
      feelsLike: weather.feelsLike,
      windSpeed: weather.windSpeed,
      alertLevel: weather.alertLevel,
      warnings: weather.warnings,
      recommendation: weather.recommendation,
      icon: weather.icon,
    } : null,
    traffic: traffic && traffic.available ? {
      normalTime: traffic.bestRoute.duration,
      currentTime: traffic.bestRoute.durationInTraffic,
      delay: traffic.bestRoute.delay,
      alertLevel: traffic.alertLevel,
      issues: traffic.issues,
      recommendation: traffic.recommendation,
      routes: traffic.routes.map((r) => ({
        summary: r.summary,
        time: r.durationInTraffic,
        delay: r.delay,
      })),
    } : null,
    transit: transit && transit.available ? {
      options: transit.options.map((opt) => ({
        mode: opt.mode,
        routeName: opt.routeName,
        totalTime: opt.totalTime,
        walkingTime: opt.walkingTime,
        transitTime: opt.transitTime,
        transfers: opt.transfers,
        status: opt.status,
        delays: opt.delays,
        alert: opt.alert,
      })),
      bestOption: transit.bestOption ? {
        mode: transit.bestOption.mode,
        routeName: transit.bestOption.routeName,
        totalTime: transit.bestOption.totalTime,
        delays: transit.bestOption.delays,
      } : null,
    } : null,
    comparison: comparison,
    overallAlertLevel: overallAlertLevel,
    overallRecommendation: overallRecommendation,
    leaveEarlyMinutes: leaveEarlyMinutes,
    allIssues: allIssues,
  };
}

module.exports = {
  getCombinedAlerts,
};
