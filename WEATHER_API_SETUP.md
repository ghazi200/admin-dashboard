# Weather API Setup for External Risk Factors

## Overview

The External Risk Factors service now uses real weather data to accurately assess risk. Instead of always returning LOW risk in fallback mode, it checks actual weather conditions.

## Setup Instructions

### Option 1: OpenWeatherMap (Recommended - Free Tier Available)

1. **Sign up for free account**: https://openweathermap.org/api
2. **Get API key**: Go to API keys section
3. **Add to `.env`**:
   ```bash
   WEATHER_API_KEY=your_openweathermap_api_key_here
   ```
   OR
   ```bash
   OPENWEATHER_API_KEY=your_openweathermap_api_key_here
   ```

### Free Tier Limits
- 60 calls/minute
- 1,000,000 calls/month
- Perfect for this use case

## How It Works

### With Weather API Key

1. **Fetches real weather data** for the location (city, state)
2. **Analyzes conditions**:
   - **Snow/Ice** → HIGH risk (80 points)
   - **Storms/Heavy Rain** → MEDIUM risk (60 points)
   - **Extreme Cold** (<20°F) → MEDIUM risk (50 points)
   - **Extreme Heat** (>90°F) → MEDIUM risk (45 points)
   - **High Winds** (>25 mph) → MEDIUM risk (40 points)
   - **Low Visibility** (<1000m) → MEDIUM risk (50 points)
   - **Normal conditions** → LOW risk (0 points)

3. **Returns accurate risk assessment** based on actual weather

### Without Weather API Key

- Falls back to basic message
- Suggests configuring WEATHER_API_KEY
- Returns LOW risk (but warns that data is unavailable)

## Example Response (Snow Storm in NY)

```json
{
  "location": "New York, NY",
  "date": "Monday, January 26, 2026",
  "riskLevel": "HIGH",
  "riskScore": 80,
  "factors": ["weather"],
  "summary": "Severe weather conditions: heavy snow. High risk of delays and callouts.",
  "details": {
    "weather": "Snow/Ice conditions: heavy snow"
  },
  "source": "weather_api"
}
```

## Testing

Run the test script:
```bash
cd backend
node src/scripts/testExternalRiskFactors.js
```

This will:
1. Test location parsing
2. Test weather API integration (if key configured)
3. Show risk assessment for New York

## Current Status

✅ **Weather API integration complete**
✅ **Real-time weather checking**
✅ **Accurate risk assessment based on actual conditions**
✅ **Graceful fallback if API unavailable**

## Next Steps

1. **Get OpenWeatherMap API key** (free)
2. **Add to `.env` file**
3. **Restart backend server**
4. **Test with New York location** - should now detect snow storm!

## Alternative Weather APIs

If you prefer other weather APIs, you can modify `externalRiskFactors.service.js`:
- Weather.gov (free, US only)
- AccuWeather API
- WeatherAPI.com
- Custom weather service

The current implementation uses OpenWeatherMap as it's free and reliable.
