/**
 * Test Script for Weather & Traffic Alerts (Upgrade #33)
 * 
 * Tests all alert services and API endpoints
 */

require("dotenv").config();
const { pool } = require("../config/db");
const { getWeatherForLocation, getWeatherWarnings } = require("../services/weatherAlerts.service");
const { getTrafficForRoute } = require("../services/trafficAlerts.service");
const { getTransitOptions, compareTransitVsDriving } = require("../services/transitAlerts.service");
const { getCombinedAlerts } = require("../services/combinedAlerts.service");

// Test configuration
const TEST_LOCATION = "New York, NY";
const TEST_ORIGIN = "Brooklyn, NY";
const TEST_DESTINATION = "Manhattan, NY";

async function testWeatherAlerts() {
  console.log("\n🌤️  TESTING WEATHER ALERTS");
  console.log("=" .repeat(50));

  try {
    // Test 1: Get weather for a location
    console.log("\n1. Testing getWeatherForLocation...");
    const weather = await getWeatherForLocation(TEST_LOCATION);
    
    if (weather.available) {
      console.log("✅ Weather data retrieved successfully");
      console.log(`   Location: ${weather.location}`);
      console.log(`   Condition: ${weather.condition} (${weather.description})`);
      console.log(`   Temperature: ${weather.temperature}°F (feels like ${weather.feelsLike}°F)`);
      console.log(`   Wind: ${weather.windSpeed} mph`);
      console.log(`   Alert Level: ${weather.alertLevel}`);
      if (weather.warnings.length > 0) {
        console.log(`   Warnings: ${weather.warnings.join(", ")}`);
      }
      if (weather.recommendation) {
        console.log(`   Recommendation: ${weather.recommendation}`);
      }
    } else {
      console.log("⚠️  Weather data not available");
      console.log(`   Reason: ${weather.message || "Unknown"}`);
    }

    // Test 2: Get weather warnings
    console.log("\n2. Testing getWeatherWarnings...");
    const warnings = await getWeatherWarnings(TEST_LOCATION, new Date());
    
    if (warnings.hasWarnings) {
      console.log("✅ Weather warnings detected");
      console.log(`   Alert Level: ${warnings.alertLevel}`);
      console.log(`   Warnings: ${warnings.warnings.join(", ")}`);
      console.log(`   Recommendation: ${warnings.recommendation}`);
    } else {
      console.log("ℹ️  No weather warnings");
      console.log(`   Condition: ${warnings.condition || "Unknown"}`);
      console.log(`   Temperature: ${warnings.temperature || "N/A"}°F`);
    }

  } catch (error) {
    console.error("❌ Weather alerts test failed:", error.message);
    console.error("   Stack:", error.stack);
  }
}

async function testTrafficAlerts() {
  console.log("\n🚗 TESTING TRAFFIC ALERTS");
  console.log("=" .repeat(50));

  try {
    // Test traffic for a route
    console.log("\n1. Testing getTrafficForRoute...");
    const traffic = await getTrafficForRoute(TEST_ORIGIN, TEST_DESTINATION);
    
    if (traffic.available) {
      console.log("✅ Traffic data retrieved successfully");
      console.log(`   Origin: ${traffic.origin}`);
      console.log(`   Destination: ${traffic.destination}`);
      console.log(`   Best Route: ${traffic.bestRoute.summary}`);
      console.log(`   Normal Time: ${traffic.bestRoute.duration} minutes`);
      console.log(`   Current Time: ${traffic.bestRoute.durationInTraffic} minutes`);
      console.log(`   Delay: ${traffic.bestRoute.delay} minutes`);
      console.log(`   Alert Level: ${traffic.alertLevel}`);
      
      if (traffic.issues.length > 0) {
        console.log(`   Issues: ${traffic.issues.join(", ")}`);
      }
      if (traffic.recommendation) {
        console.log(`   Recommendation: ${traffic.recommendation}`);
      }
      
      console.log(`\n   Available Routes: ${traffic.routes.length}`);
      traffic.routes.slice(0, 3).forEach((route, idx) => {
        console.log(`   Route ${idx + 1}: ${route.summary} - ${route.durationInTraffic} min (${route.delay > 0 ? `+${route.delay} min delay` : "no delay"})`);
      });
    } else {
      console.log("⚠️  Traffic data not available");
      console.log(`   Reason: ${traffic.message || "Unknown"}`);
    }

  } catch (error) {
    console.error("❌ Traffic alerts test failed:", error.message);
    console.error("   Stack:", error.stack);
  }
}

async function testTransitAlerts() {
  console.log("\n🚌 TESTING TRANSIT ALERTS");
  console.log("=" .repeat(50));

  try {
    // Test transit options
    console.log("\n1. Testing getTransitOptions...");
    const transit = await getTransitOptions(TEST_ORIGIN, TEST_DESTINATION);
    
    if (transit.available) {
      console.log("✅ Transit data retrieved successfully");
      console.log(`   Origin: ${transit.origin}`);
      console.log(`   Destination: ${transit.destination}`);
      console.log(`   Options Available: ${transit.options.length}`);
      
      if (transit.bestOption) {
        console.log(`\n   Best Option:`);
        console.log(`   Route: ${transit.bestOption.routeName} (${transit.bestOption.mode})`);
        console.log(`   Total Time: ${transit.bestOption.totalTime} minutes`);
        console.log(`   Walking: ${transit.bestOption.walkingTime} min, Transit: ${transit.bestOption.transitTime} min`);
        console.log(`   Transfers: ${transit.bestOption.transfers}`);
        console.log(`   Status: ${transit.bestOption.status}`);
        if (transit.bestOption.delays > 0) {
          console.log(`   Delays: ${transit.bestOption.delays} minutes`);
        }
      }
      
      console.log(`\n   All Options:`);
      transit.options.slice(0, 5).forEach((opt, idx) => {
        console.log(`   ${idx + 1}. ${opt.routeName} (${opt.mode}) - ${opt.totalTime} min, ${opt.transfers} transfer(s)`);
      });
    } else {
      console.log("⚠️  Transit data not available");
      console.log(`   Reason: ${transit.message || "Unknown"}`);
    }

  } catch (error) {
    console.error("❌ Transit alerts test failed:", error.message);
    console.error("   Stack:", error.stack);
  }
}

async function testCombinedAlerts() {
  console.log("\n📊 TESTING COMBINED ALERTS");
  console.log("=" .repeat(50));

  try {
    // Get a test shift from database
    console.log("\n1. Fetching test shift from database...");
    const result = await pool.query(
      `SELECT id, shift_date, shift_start, shift_end, location, guard_id
       FROM public.shifts
       WHERE location IS NOT NULL
         AND shift_date >= CURRENT_DATE
       ORDER BY shift_date ASC
       LIMIT 1`
    );
    const shiftRows = result.rows || [];

    if (shiftRows.length === 0) {
      console.log("⚠️  No shifts found in database for testing");
      console.log("   Creating mock shift for testing...");
      
      // Create mock shift
      const mockShift = {
        id: "test-shift-id",
        shift_date: new Date(),
        shift_start: "09:00",
        shift_end: "17:00",
        location: TEST_LOCATION,
      };

      console.log("\n2. Testing getCombinedAlerts with mock shift...");
      const alerts = await getCombinedAlerts(mockShift, {
        origin: TEST_ORIGIN,
        includeTransit: true,
      });

      displayCombinedAlerts(alerts);
    } else {
      const shift = shiftRows[0];
      console.log(`✅ Found shift: ${shift.id}`);
      console.log(`   Location: ${shift.location || "Unknown"}`);
      console.log(`   Date: ${shift.shift_date}`);
      console.log(`   Time: ${shift.shift_start} - ${shift.shift_end}`);

      console.log("\n2. Testing getCombinedAlerts...");
      const alerts = await getCombinedAlerts(shift, {
        origin: TEST_ORIGIN,
        includeTransit: true,
      });

      displayCombinedAlerts(alerts);
    }

  } catch (error) {
    console.error("❌ Combined alerts test failed:", error.message);
    console.error("   Stack:", error.stack);
  }
}

function displayCombinedAlerts(alerts) {
  console.log("\n✅ Combined alerts generated:");
  console.log(`   Shift ID: ${alerts.shiftId}`);
  console.log(`   Location: ${alerts.location}`);
  console.log(`   Overall Alert Level: ${alerts.overallAlertLevel}`);
  
  if (alerts.overallRecommendation) {
    console.log(`   Recommendation: ${alerts.overallRecommendation}`);
  }
  
  if (alerts.leaveEarlyMinutes > 0) {
    console.log(`   Leave Early: ${alerts.leaveEarlyMinutes} minutes`);
  }

  if (alerts.weather) {
    console.log(`\n   Weather:`);
    console.log(`   - Condition: ${alerts.weather.condition} (${alerts.weather.description})`);
    console.log(`   - Temperature: ${alerts.weather.temperature}°F`);
    console.log(`   - Alert Level: ${alerts.weather.alertLevel}`);
    if (alerts.weather.warnings.length > 0) {
      console.log(`   - Warnings: ${alerts.weather.warnings.join(", ")}`);
    }
  }

  if (alerts.traffic) {
    console.log(`\n   Traffic:`);
    console.log(`   - Normal Time: ${alerts.traffic.normalTime} min`);
    console.log(`   - Current Time: ${alerts.traffic.currentTime} min`);
    console.log(`   - Delay: ${alerts.traffic.delay} min`);
    console.log(`   - Alert Level: ${alerts.traffic.alertLevel}`);
    if (alerts.traffic.issues.length > 0) {
      console.log(`   - Issues: ${alerts.traffic.issues.join(", ")}`);
    }
  }

  if (alerts.transit && alerts.transit.options.length > 0) {
    console.log(`\n   Transit:`);
    console.log(`   - Options Available: ${alerts.transit.options.length}`);
    if (alerts.transit.bestOption) {
      console.log(`   - Best: ${alerts.transit.bestOption.routeName} (${alerts.transit.bestOption.mode}) - ${alerts.transit.bestOption.totalTime} min`);
    }
  }

  if (alerts.comparison && alerts.comparison.available) {
    console.log(`\n   Comparison:`);
    console.log(`   - Best Mode: ${alerts.comparison.bestMode}`);
    console.log(`   - Reason: ${alerts.comparison.reason}`);
    console.log(`   - Recommendation: ${alerts.comparison.recommendation}`);
  }

  if (alerts.allIssues.length > 0) {
    console.log(`\n   All Issues:`);
    alerts.allIssues.forEach((issue, idx) => {
      console.log(`   ${idx + 1}. ${issue}`);
    });
  }
}

async function testAPIEndpoints() {
  console.log("\n🌐 TESTING API ENDPOINTS");
  console.log("=" .repeat(50));

  try {
    // Get a guard token (if available)
    const guardResult = await pool.query(
      `SELECT id, email FROM public.guards LIMIT 1`
    );
    const guardRows = guardResult.rows || [];

    if (guardRows.length === 0) {
      console.log("⚠️  No guards found in database");
      console.log("   Skipping API endpoint tests (requires guard authentication)");
      return;
    }

    const shiftResult = await pool.query(
      `SELECT id FROM public.shifts
       WHERE location IS NOT NULL
         AND shift_date >= CURRENT_DATE
       LIMIT 1`
    );
    const shiftRows = shiftResult.rows || [];

    if (shiftRows.length === 0) {
      console.log("⚠️  No shifts found in database");
      console.log("   Skipping API endpoint tests");
      return;
    }

    console.log("\n⚠️  API endpoint tests require:");
    console.log("   1. Guard authentication token");
    console.log("   2. Running backend server");
    console.log("   3. Valid API keys");
    console.log("\n   To test API endpoints manually:");
    console.log(`   curl -H "Authorization: Bearer <token>" http://localhost:5000/api/guard/alerts/combined/${shiftRows[0].id}?origin=${encodeURIComponent(TEST_ORIGIN)}`);

  } catch (error) {
    console.error("❌ API endpoint test setup failed:", error.message);
  }
}

async function checkConfiguration() {
  console.log("\n⚙️  CHECKING CONFIGURATION");
  console.log("=" .repeat(50));

  const weatherKey = process.env.WEATHER_API_KEY || process.env.OPENWEATHER_API_KEY;
  const mapsKey = process.env.GOOGLE_MAPS_API_KEY;

  console.log(`\nWeather API Key: ${weatherKey ? "✅ Configured" : "❌ Missing"}`);
  if (!weatherKey) {
    console.log("   Set WEATHER_API_KEY or OPENWEATHER_API_KEY in .env");
    console.log("   Get key from: https://openweathermap.org/api");
  }

  console.log(`\nGoogle Maps API Key: ${mapsKey ? "✅ Configured" : "❌ Missing"}`);
  if (!mapsKey) {
    console.log("   Set GOOGLE_MAPS_API_KEY in .env");
    console.log("   Get key from: https://console.cloud.google.com/");
    console.log("   Required APIs: Directions, Geocoding, Maps JavaScript");
  }

  return {
    weatherConfigured: !!weatherKey,
    mapsConfigured: !!mapsKey,
  };
}

async function runAllTests() {
  console.log("\n" + "=".repeat(50));
  console.log("🧪 WEATHER & TRAFFIC ALERTS TEST SUITE");
  console.log("=".repeat(50));

  // Check configuration
  const config = await checkConfiguration();

  // Run tests
  await testWeatherAlerts();
  await testTrafficAlerts();
  await testTransitAlerts();
  await testCombinedAlerts();
  await testAPIEndpoints();

  // Summary
  console.log("\n" + "=".repeat(50));
  console.log("📋 TEST SUMMARY");
  console.log("=".repeat(50));
  console.log(`\nConfiguration:`);
  console.log(`  Weather API: ${config.weatherConfigured ? "✅" : "❌"}`);
  console.log(`  Google Maps API: ${config.mapsConfigured ? "✅" : "❌"}`);
  
  if (!config.weatherConfigured || !config.mapsConfigured) {
    console.log("\n⚠️  Some tests may have failed due to missing API keys.");
    console.log("   Configure API keys in .env file to test all features.");
  }

  console.log("\n✅ Test suite completed!");
  console.log("=".repeat(50) + "\n");

  process.exit(0);
}

// Run tests
runAllTests().catch((error) => {
  console.error("\n❌ Test suite failed:", error);
  console.error("Stack:", error.stack);
  process.exit(1);
});
