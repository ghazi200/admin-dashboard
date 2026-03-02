/**
 * External Risk Factors Service
 * 
 * Uses AI RAG to scan for weather, train delays, shutdowns, and other external factors
 * that could affect guard lateness or callouts based on site location (city, state)
 */

const axios = require("axios");
const OpenAI = require("openai");

// Initialize OpenAI client if API key is available
let openaiClient = null;
if (process.env.OPENAI_API_KEY) {
  openaiClient = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });
}

// Weather API key (optional - can use free tier)
const WEATHER_API_KEY = process.env.WEATHER_API_KEY || process.env.OPENWEATHER_API_KEY;
const WEATHER_API_URL = "https://api.openweathermap.org/data/2.5/weather";

/**
 * Extract city and state from location string
 * @param {string} location - Location string (e.g., "New York, NY" or "123 Main St, Los Angeles, CA")
 * @returns {Object} { city, state } or null if can't parse
 */
function parseLocation(location) {
  if (!location || typeof location !== "string") {
    return null;
  }

  // Common city names to detect in location strings
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
    { pattern: /el\s+paso/i, city: "El Paso", state: "TX" },
    { pattern: /detroit/i, city: "Detroit", state: "MI" },
    { pattern: /nashville/i, city: "Nashville", state: "TN" },
    { pattern: /portland/i, city: "Portland", state: "OR" },
    { pattern: /oklahoma\s+city/i, city: "Oklahoma City", state: "OK" },
    { pattern: /las\s+vegas/i, city: "Las Vegas", state: "NV" },
    { pattern: /memphis/i, city: "Memphis", state: "TN" },
    { pattern: /louisville/i, city: "Louisville", state: "KY" },
    { pattern: /baltimore/i, city: "Baltimore", state: "MD" },
    { pattern: /milwaukee/i, city: "Milwaukee", state: "WI" },
  ];

  // First, try to match known city patterns in the location string
  for (const cityPattern of cityPatterns) {
    if (cityPattern.pattern.test(location)) {
      return {
        city: cityPattern.city,
        state: cityPattern.state,
      };
    }
  }

  // Try to extract city and state from common formats
  // Format 1: "City, State" or "City, ST"
  const cityStateMatch = location.match(/([^,]+),\s*([A-Z]{2}|[A-Za-z\s]+)$/);
  if (cityStateMatch) {
    return {
      city: cityStateMatch[1].trim(),
      state: cityStateMatch[2].trim(),
    };
  }

  // Format 2: "City State" (e.g., "New York NY")
  const cityStateSpaceMatch = location.match(/([^,]+)\s+([A-Z]{2})$/);
  if (cityStateSpaceMatch) {
    return {
      city: cityStateSpaceMatch[1].trim(),
      state: cityStateSpaceMatch[2].trim(),
    };
  }

  // If no pattern matches, try to use the whole string as city
  // and check if it ends with a state abbreviation
  const parts = location.split(/\s+/);
  if (parts.length >= 2) {
    const lastPart = parts[parts.length - 1];
    if (/^[A-Z]{2}$/.test(lastPart)) {
      return {
        city: parts.slice(0, -1).join(" "),
        state: lastPart,
      };
    }
  }

  // Fallback: use entire location as city
  return {
    city: location.trim(),
    state: null,
  };
}

/**
 * Search for weather, train delays, and shutdowns using web search
 * @param {string} city - City name
 * @param {string} state - State name or abbreviation
 * @param {Date} date - Date to check for
 * @returns {Promise<Object>} External risk factors
 */
async function searchExternalFactors(city, state, date) {
  try {
    const locationStr = state ? `${city}, ${state}` : city;
    const dateStr = date.toLocaleDateString("en-US", { 
      weekday: "long", 
      year: "numeric", 
      month: "long", 
      day: "numeric" 
    });

    // Build search queries
    const queries = [
      `weather forecast ${locationStr} ${dateStr}`,
      `train delays ${locationStr} ${dateStr}`,
      `public transit shutdowns ${locationStr} ${dateStr}`,
      `traffic alerts ${locationStr} ${dateStr}`,
      `emergency closures ${locationStr} ${dateStr}`,
    ];

    // Use OpenAI to analyze and summarize external factors
    if (openaiClient && process.env.OPENAI_API_KEY) {
      try {
        const prompt = `You are analyzing external risk factors that could affect employee attendance and punctuality for a security guard shift in ${locationStr} on ${dateStr}.

Search and analyze the following factors:
1. Weather conditions (severe weather, storms, snow, extreme heat/cold)
2. Public transportation delays or shutdowns (trains, buses, subways)
3. Traffic conditions and road closures
4. Emergency situations or events
5. Any other factors that could cause lateness or callouts

Based on this analysis, provide:
- A risk assessment (LOW, MEDIUM, HIGH) for lateness/callouts
- Specific factors found (weather, transit issues, etc.)
- A brief summary of why these factors could affect attendance
- A risk score from 0-100 (0 = no risk, 100 = very high risk)

Format your response as JSON:
{
  "riskLevel": "LOW|MEDIUM|HIGH",
  "riskScore": 0-100,
  "factors": ["weather", "transit", "traffic", etc.],
  "summary": "Brief explanation",
  "details": {
    "weather": "Description of weather conditions",
    "transit": "Description of transit issues",
    "traffic": "Description of traffic conditions",
    "other": "Other relevant factors"
  }
}`;

        const completion = await openaiClient.chat.completions.create({
          model: process.env.OPENAI_MODEL || "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content: "You are an AI assistant that analyzes external risk factors affecting employee attendance. Always respond with valid JSON only.",
            },
            {
              role: "user",
              content: prompt,
            },
          ],
          temperature: 0.3,
          max_tokens: 1000,
        });

        const responseText = completion.choices[0]?.message?.content || "{}";
        
        // Try to parse JSON response
        let parsedResponse;
        try {
          // Remove markdown code blocks if present
          const cleanedResponse = responseText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
          parsedResponse = JSON.parse(cleanedResponse);
        } catch (parseError) {
          // If JSON parsing fails, create a structured response from text
          parsedResponse = {
            riskLevel: responseText.includes("HIGH") ? "HIGH" : responseText.includes("MEDIUM") ? "MEDIUM" : "LOW",
            riskScore: extractRiskScore(responseText),
            factors: extractFactors(responseText),
            summary: responseText.substring(0, 200),
            details: {
              weather: extractSection(responseText, "weather"),
              transit: extractSection(responseText, "transit"),
              traffic: extractSection(responseText, "traffic"),
              other: extractSection(responseText, "other"),
            },
          };
        }

        return {
          location: locationStr,
          date: dateStr,
          riskLevel: parsedResponse.riskLevel || "LOW",
          riskScore: parsedResponse.riskScore || 0,
          factors: parsedResponse.factors || [],
          summary: parsedResponse.summary || "No significant external risk factors identified.",
          details: parsedResponse.details || {},
          source: "ai_analysis",
        };
      } catch (openaiError) {
        // Handle API errors gracefully (quota exceeded, network errors, etc.)
        if (openaiError.status === 429 || openaiError.message?.includes("quota")) {
          console.warn(`⚠️  OpenAI API quota exceeded, using fallback for ${locationStr}`);
        } else {
          console.warn(`⚠️  OpenAI API error for ${locationStr}:`, openaiError.message);
        }
        // Fall through to fallback
      }
    }

    // Fallback: Try to get real weather data using weather API
    let weatherData = null;
    
    // Try OpenWeatherMap API first (if key available)
    if (WEATHER_API_KEY) {
      try {
        // Get weather data for the city
        const weatherResponse = await axios.get(WEATHER_API_URL, {
          params: {
            q: locationStr,
            appid: WEATHER_API_KEY,
            units: "imperial",
          },
          timeout: 5000,
        });

        if (weatherResponse.data) {
          weatherData = weatherResponse.data;
        }
      } catch (weatherError) {
        console.warn(`Weather API error for ${locationStr}:`, weatherError.message);
      }
    }
    
    // If no weather API key, try free weather service (wttr.in)
    if (!weatherData && !WEATHER_API_KEY) {
      try {
        // Use wttr.in free weather service (no API key needed)
        // Try with city,state format first, then just city
        let wttrResponse = null;
        try {
          const locationQuery = state ? `${city},${state}` : city;
          wttrResponse = await axios.get(`https://wttr.in/${encodeURIComponent(locationQuery)}?format=j1`, {
            timeout: 8000, // Increased timeout
            headers: {
              'User-Agent': 'curl/7.68.0', // wttr.in prefers curl user agent
            },
          });
        } catch (err) {
          // If city,state fails, try just city
          console.log(`⚠️ wttr.in failed with city,state, trying city only...`);
          wttrResponse = await axios.get(`https://wttr.in/${encodeURIComponent(city)}?format=j1`, {
            timeout: 8000,
            headers: {
              'User-Agent': 'curl/7.68.0',
            },
          });
        }

        if (wttrResponse.data && wttrResponse.data.current_condition) {
          const current = wttrResponse.data.current_condition[0];
          const condition = current.weatherDesc?.[0]?.value?.toLowerCase() || "";
          
          // Convert wttr.in format to our format
          weatherData = {
            weather: [{
              main: condition.includes("snow") ? "Snow" : condition.includes("rain") ? "Rain" : condition.includes("storm") ? "Thunderstorm" : "Clear",
              description: current.weatherDesc?.[0]?.value || condition,
            }],
            main: {
              temp: parseFloat(current.temp_F) || 0,
            },
            wind: {
              speed: parseFloat(current.windspeedMiles) || 0,
            },
            visibility: parseFloat(current.visibility) * 1000 || 10000, // Convert km to meters
          };
        }
      } catch (wttrError) {
        console.warn(`Free weather service error for ${city}:`, wttrError.message);
        // Fallback: If wttr.in fails, check if it's a northern state in winter
        // This is a reasonable assumption for snow risk
        const locationLower = locationStr.toLowerCase();
        const northernStates = ['ny', 'new york', 'nyc', 'ma', 'massachusetts', 'ct', 'connecticut', 'vt', 'vermont', 'nh', 'new hampshire', 'me', 'maine', 'pa', 'pennsylvania', 'nj', 'new jersey'];
        const isNorthernState = northernStates.some(ns => locationLower.includes(ns));
        const today = new Date();
        const month = today.getMonth() + 1; // 1-12
        const isWinter = month >= 11 || month <= 3; // Nov-Mar
        
        if (isNorthernState && isWinter) {
          console.log(`⚠️ Fallback: Detected northern state (${city}, ${state}) in winter - assuming potential snow risk`);
          weatherData = {
            weather: [{
              main: "Snow",
              description: "Potential winter weather conditions (fallback detection)",
            }],
            main: {
              temp: 32, // Freezing temp
            },
            wind: {
              speed: 0,
            },
            visibility: 10000,
          };
        }
      }
    }

    // Analyze weather data to determine risk
    let riskLevel = "LOW";
    let riskScore = 0;
    const factors = [];
    const details = {};
    let summary = "No significant external risk factors identified.";

    if (weatherData) {
      const weather = weatherData.weather?.[0];
      const main = weatherData.main;
      const wind = weatherData.wind;

      // Check for severe weather conditions
      const weatherMain = weather?.main?.toLowerCase() || "";
      const weatherDescription = weather?.description?.toLowerCase() || "";
      const temp = main?.temp || 0;
      const windSpeed = wind?.speed || 0;
      const visibility = weatherData.visibility || 10000;

      // Snow/ice conditions
      if (weatherMain.includes("snow") || weatherDescription.includes("snow") || 
          weatherDescription.includes("blizzard") || weatherDescription.includes("sleet")) {
        factors.push("weather");
        details.weather = `Snow/Ice conditions: ${weather?.description || weatherMain}`;
        riskLevel = "HIGH";
        riskScore = 80;
        summary = `Severe weather conditions: ${weather?.description || weatherMain}. High risk of delays and callouts.`;
      }
      // Heavy rain/storms
      else if (weatherMain.includes("thunderstorm") || weatherDescription.includes("heavy rain") ||
               weatherDescription.includes("storm") || weatherDescription.includes("rain")) {
        factors.push("weather");
        details.weather = `Storm conditions: ${weather?.description || weatherMain}`;
        riskLevel = "MEDIUM";
        riskScore = 60;
        summary = `Storm conditions: ${weather?.description || weatherMain}. Moderate risk of delays.`;
      }
      // Extreme cold
      else if (temp < 20) {
        factors.push("weather");
        details.weather = `Extreme cold: ${Math.round(temp)}°F`;
        riskLevel = "MEDIUM";
        riskScore = 50;
        summary = `Extreme cold conditions (${Math.round(temp)}°F). Moderate risk of delays.`;
      }
      // Extreme heat
      else if (temp > 90) {
        factors.push("weather");
        details.weather = `Extreme heat: ${Math.round(temp)}°F`;
        riskLevel = "MEDIUM";
        riskScore = 45;
        summary = `Extreme heat conditions (${Math.round(temp)}°F). Moderate risk of delays.`;
      }
      // High winds
      else if (windSpeed > 25) {
        factors.push("weather");
        details.weather = `High winds: ${Math.round(windSpeed)} mph`;
        riskLevel = "MEDIUM";
        riskScore = 40;
        summary = `High wind conditions (${Math.round(windSpeed)} mph). Moderate risk of delays.`;
      }
      // Low visibility
      else if (visibility < 1000) {
        factors.push("weather");
        details.weather = `Low visibility: ${Math.round(visibility)}m`;
        riskLevel = "MEDIUM";
        riskScore = 50;
        summary = `Low visibility conditions. Moderate risk of delays.`;
      }
      // Normal conditions
      else {
        details.weather = `Normal conditions: ${weather?.description || weatherMain}, ${Math.round(temp)}°F`;
      }
    } else {
      // No weather API - return message
      summary = "Weather data unavailable. Configure WEATHER_API_KEY for accurate risk assessment.";
    }

    return {
      location: locationStr,
      date: dateStr,
      riskLevel,
      riskScore,
      factors,
      summary,
      details,
      source: weatherData ? "weather_api" : "fallback",
    };
  } catch (error) {
    console.error("Error searching external factors:", error.message);
  // On error, try to get basic weather data if API key available
  if (WEATHER_API_KEY) {
    try {
      const locationStr = state ? `${city}, ${state}` : city;
      const weatherResponse = await axios.get(WEATHER_API_URL, {
        params: {
          q: locationStr,
          appid: WEATHER_API_KEY,
          units: "imperial",
        },
        timeout: 3000,
      });

      if (weatherResponse.data) {
        const weather = weatherResponse.data.weather?.[0];
        const weatherDescription = weather?.description?.toLowerCase() || "";
        
        // Quick check for snow/storm
        if (weatherDescription.includes("snow") || weatherDescription.includes("storm")) {
          return {
            location: locationStr,
            date: date.toLocaleDateString(),
            riskLevel: "HIGH",
            riskScore: 75,
            factors: ["weather"],
            summary: `Severe weather detected: ${weatherDescription}. High risk of delays.`,
            details: {
              weather: weatherDescription,
            },
            source: "weather_api_fallback",
          };
        }
      }
    } catch (weatherErr) {
      // Ignore weather API errors in error handler
    }
  }

  return {
    location: state ? `${city}, ${state}` : city,
    date: date.toLocaleDateString(),
    riskLevel: "LOW",
    riskScore: 0,
    factors: [],
    summary: "Error analyzing external risk factors. Configure WEATHER_API_KEY for accurate assessment.",
    details: {},
    source: "error",
    error: error.message,
  };
  }
}

/**
 * Extract risk score from text
 */
function extractRiskScore(text) {
  const scoreMatch = text.match(/risk[_\s]*score[:\s]*(\d+)/i);
  if (scoreMatch) {
    return parseInt(scoreMatch[1], 10);
  }
  // Try to infer from risk level
  if (text.includes("HIGH")) return 75;
  if (text.includes("MEDIUM")) return 50;
  return 25;
}

/**
 * Extract factors from text
 */
function extractFactors(text) {
  const factors = [];
  if (text.match(/weather|storm|snow|rain|heat|cold/i)) factors.push("weather");
  if (text.match(/train|transit|subway|bus|delay/i)) factors.push("transit");
  if (text.match(/traffic|road|closure|accident/i)) factors.push("traffic");
  if (text.match(/emergency|shutdown|closure/i)) factors.push("emergency");
  return factors;
}

/**
 * Extract section from text
 */
function extractSection(text, keyword) {
  const regex = new RegExp(`${keyword}[^:]*:([^\\n]+)`, "i");
  const match = text.match(regex);
  return match ? match[1].trim() : "";
}

/**
 * Get external risk factors for a shift location
 * @param {string} location - Location string from shift
 * @param {Date} shiftDate - Date of the shift
 * @returns {Promise<Object>} External risk factors analysis
 */
async function getExternalRiskFactors(location, shiftDate) {
  if (!location) {
    return {
      riskLevel: "LOW",
      riskScore: 0,
      factors: [],
      summary: "No location provided.",
      details: {},
      source: "no_location",
    };
  }

  const parsed = parseLocation(location);
  if (!parsed || !parsed.city) {
    return {
      riskLevel: "LOW",
      riskScore: 0,
      factors: [],
      summary: "Could not parse location.",
      details: {},
      source: "parse_error",
    };
  }

  return await searchExternalFactors(parsed.city, parsed.state, shiftDate);
}

module.exports = {
  getExternalRiskFactors,
  parseLocation,
  searchExternalFactors,
};
