/**
 * Weather Alerts Service
 * 
 * Provides weather information and alerts for shift locations
 * Used by guards to prepare for weather conditions
 */

const axios = require("axios");

const WEATHER_API_KEY = process.env.WEATHER_API_KEY || process.env.OPENWEATHER_API_KEY;
const WEATHER_API_URL = "https://api.openweathermap.org/data/2.5/weather";
const WEATHER_FORECAST_URL = "https://api.openweathermap.org/data/2.5/forecast";

/**
 * Extract city and state from location string
 * @param {string} location - Location string (e.g., "New York, NY" or "123 Main St, Los Angeles, CA")
 * @returns {Object} { city, state } or null if can't parse
 */
function parseLocation(location) {
  if (!location || typeof location !== "string") {
    return null;
  }

  // Try to extract city, state pattern
  const cityStateMatch = location.match(/([^,]+),\s*([A-Z]{2})$/i);
  if (cityStateMatch) {
    return {
      city: cityStateMatch[1].trim(),
      state: cityStateMatch[2].trim().toUpperCase(),
    };
  }

  // Common city patterns
  const cityPatterns = [
    { pattern: /new\s+york/i, city: "New York", state: "NY" },
    { pattern: /los\s+angeles|la\s+warehouse/i, city: "Los Angeles", state: "CA" },
    { pattern: /chicago/i, city: "Chicago", state: "IL" },
    { pattern: /houston/i, city: "Houston", state: "TX" },
    { pattern: /phoenix/i, city: "Phoenix", state: "AZ" },
    { pattern: /philadelphia/i, city: "Philadelphia", state: "PA" },
    { pattern: /san\s+antonio/i, city: "San Antonio", state: "TX" },
    { pattern: /san\s+diego/i, city: "San Diego", state: "CA" },
    { pattern: /dallas/i, city: "Dallas", state: "TX" },
    { pattern: /san\s+jose/i, city: "San Jose", state: "CA" },
    { pattern: /austin/i, city: "Austin", state: "TX" },
    { pattern: /jacksonville/i, city: "Jacksonville", state: "FL" },
    { pattern: /san\s+francisco/i, city: "San Francisco", state: "CA" },
    { pattern: /columbus/i, city: "Columbus", state: "OH" },
    { pattern: /fort\s+worth/i, city: "Fort Worth", state: "TX" },
    { pattern: /charlotte/i, city: "Charlotte", state: "NC" },
    { pattern: /seattle/i, city: "Seattle", state: "WA" },
    { pattern: /denver/i, city: "Denver", state: "CO" },
    { pattern: /washington/i, city: "Washington", state: "DC" },
    { pattern: /boston/i, city: "Boston", state: "MA" },
  ];

  for (const { pattern, city, state } of cityPatterns) {
    if (pattern.test(location)) {
      return { city, state };
    }
  }

  return null;
}

/**
 * Get weather for a location
 * @param {string} location - Location string
 * @param {Date} date - Date to check weather (optional, defaults to current)
 * @returns {Promise<Object>} Weather data with alerts
 */
async function getWeatherForLocation(location, date = null) {
  if (!WEATHER_API_KEY) {
    return {
      available: false,
      message: "Weather API key not configured",
      location: location,
    };
  }

  try {
    const parsed = parseLocation(location);
    if (!parsed) {
      return {
        available: false,
        message: "Could not parse location",
        location: location,
      };
    }

    // Build query string for OpenWeatherMap
    const query = `${parsed.city},${parsed.state},US`;
    
    // Get current weather
    const currentResponse = await axios.get(WEATHER_API_URL, {
      params: {
        q: query,
        appid: WEATHER_API_KEY,
        units: "imperial", // Fahrenheit
      },
    });

    const weather = currentResponse.data;
    
    // Get forecast if date is in future
    let forecast = null;
    if (date && new Date(date) > new Date()) {
      try {
        const forecastResponse = await axios.get(WEATHER_FORECAST_URL, {
          params: {
            q: query,
            appid: WEATHER_API_KEY,
            units: "imperial",
          },
        });
        forecast = forecastResponse.data;
      } catch (err) {
        console.warn("Forecast API error:", err.message);
      }
    }

    // Analyze weather conditions
    const condition = weather.weather[0]?.main || "Clear";
    const description = weather.weather[0]?.description || "";
    const temp = Math.round(weather.main?.temp || 0);
    const feelsLike = Math.round(weather.main?.feels_like || 0);
    const windSpeed = weather.wind?.speed || 0;
    const visibility = weather.visibility ? weather.visibility / 1000 : 10; // Convert to km
    const humidity = weather.main?.humidity || 0;

    // Determine alert level and warnings
    let alertLevel = "INFO";
    const warnings = [];
    let recommendation = "";

    // Check for severe conditions
    if (condition === "Snow" || description.includes("snow")) {
      alertLevel = "CRITICAL";
      warnings.push("Heavy snow expected");
      recommendation = "Dress warmly, allow extra travel time, consider public transit";
    } else if (condition === "Rain" && description.includes("heavy")) {
      alertLevel = "WARNING";
      warnings.push("Heavy rain expected");
      recommendation = "Bring rain gear, allow extra travel time";
    } else if (condition === "Thunderstorm") {
      alertLevel = "CRITICAL";
      warnings.push("Thunderstorms expected");
      recommendation = "Avoid outdoor work if possible, seek shelter if needed";
    } else if (temp < 20) {
      alertLevel = "WARNING";
      warnings.push("Extreme cold");
      recommendation = "Dress in layers, protect exposed skin";
    } else if (temp > 95) {
      alertLevel = "WARNING";
      warnings.push("Extreme heat");
      recommendation = "Stay hydrated, take breaks in shade";
    } else if (windSpeed > 25) {
      alertLevel = "WARNING";
      warnings.push("High winds");
      recommendation = "Be cautious outdoors, secure loose items";
    } else if (visibility < 1) {
      alertLevel = "WARNING";
      warnings.push("Low visibility");
      recommendation = "Drive carefully, allow extra time";
    }

    return {
      available: true,
      location: location,
      parsedLocation: parsed,
      condition: condition,
      description: description,
      temperature: temp,
      feelsLike: feelsLike,
      windSpeed: Math.round(windSpeed),
      visibility: visibility.toFixed(1),
      humidity: humidity,
      alertLevel: alertLevel,
      warnings: warnings,
      recommendation: recommendation,
      icon: weather.weather[0]?.icon,
      forecast: forecast ? formatForecast(forecast, date) : null,
    };
  } catch (error) {
    console.error("Weather API error:", error.message);
    return {
      available: false,
      message: error.response?.data?.message || error.message,
      location: location,
    };
  }
}

/**
 * Format forecast data for specific date
 * @param {Object} forecastData - Forecast API response
 * @param {Date} targetDate - Target date
 * @returns {Object} Formatted forecast
 */
function formatForecast(forecastData, targetDate) {
  if (!forecastData || !forecastData.list) return null;

  const targetDateStr = new Date(targetDate).toISOString().split("T")[0];
  
  // Find forecast closest to target date
  const closest = forecastData.list.find((item) => {
    const itemDate = new Date(item.dt * 1000).toISOString().split("T")[0];
    return itemDate === targetDateStr;
  });

  if (!closest) return null;

  return {
    condition: closest.weather[0]?.main || "Clear",
    description: closest.weather[0]?.description || "",
    temperature: Math.round(closest.main?.temp || 0),
    windSpeed: Math.round(closest.wind?.speed || 0),
    date: new Date(closest.dt * 1000),
  };
}

/**
 * Get weather warnings for shift
 * @param {string} location - Shift location
 * @param {Date} shiftDate - Shift date/time
 * @returns {Promise<Object>} Weather warnings
 */
async function getWeatherWarnings(location, shiftDate) {
  const weather = await getWeatherForLocation(location, shiftDate);
  
  if (!weather.available) {
    return {
      hasWarnings: false,
      message: weather.message || "Weather data unavailable",
    };
  }

  return {
    hasWarnings: weather.alertLevel !== "INFO",
    alertLevel: weather.alertLevel,
    warnings: weather.warnings,
    recommendation: weather.recommendation,
    condition: weather.condition,
    temperature: weather.temperature,
    description: weather.description,
  };
}

module.exports = {
  getWeatherForLocation,
  getWeatherWarnings,
  parseLocation,
};
