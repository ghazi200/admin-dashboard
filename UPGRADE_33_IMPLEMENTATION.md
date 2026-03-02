# Upgrade #33: Weather & Traffic Alerts - Implementation Guide

## Overview

This upgrade implements comprehensive weather, traffic, and public transit alerts for guards. Guards can see real-time conditions for their shift locations and get recommendations on when to leave, which route to take, and whether to use public transportation.

## Features Implemented

### 1. Weather Alerts
- Real-time weather conditions for shift locations
- Temperature, wind speed, visibility, humidity
- Weather warnings (snow, rain, extreme temperatures, high winds)
- Recommendations for weather conditions
- Forecast data for future shifts

### 2. Traffic Alerts
- Real-time traffic conditions for routes to shift locations
- Normal vs. current travel time comparison
- Traffic delay calculations
- Multiple route options with alternatives
- Recommendations on when to leave

### 3. Public Transit Alerts
- Bus and train route options
- Transit schedules and arrival times
- Walking time to/from stations
- Transfer information
- Delay detection (when available)
- Comparison with driving time

### 4. Combined Alerts
- Unified view of weather, traffic, and transit
- Overall alert level (INFO, WARNING, CRITICAL)
- Comprehensive recommendations
- "Leave early" calculations based on all factors

## Backend Implementation

### Services Created

1. **`weatherAlerts.service.js`**
   - Integrates with OpenWeatherMap API
   - Parses location strings to city/state
   - Analyzes weather conditions and generates warnings
   - Provides recommendations based on conditions

2. **`trafficAlerts.service.js`**
   - Integrates with Google Maps Directions API
   - Calculates routes and travel times
   - Detects traffic delays
   - Provides alternative routes

3. **`transitAlerts.service.js`**
   - Integrates with Google Maps Transit API
   - Finds bus and train routes
   - Calculates transit times and walking distances
   - Compares transit vs. driving

4. **`combinedAlerts.service.js`**
   - Combines all alert types
   - Calculates overall recommendations
   - Determines when guards should leave early

### API Endpoints

All endpoints require guard authentication:

- `GET /api/guard/alerts/weather/:shiftId` - Get weather for a shift
- `GET /api/guard/alerts/traffic/:shiftId?origin=<address>` - Get traffic for a route
- `GET /api/guard/alerts/transit/:shiftId?origin=<address>` - Get transit options
- `GET /api/guard/alerts/combined/:shiftId?origin=<address>&includeTransit=true` - Get all alerts
- `GET /api/guard/alerts/upcoming?origin=<address>&limit=5` - Get alerts for upcoming shifts

## Frontend Implementation

### Components Created

1. **`ShiftAlerts.jsx`**
   - Displays weather, traffic, and transit alerts
   - Shows overall alert banner for critical conditions
   - Provides recommendations and warnings
   - Handles loading and error states

2. **`ShiftAlerts.css`**
   - Styling for alert cards
   - Color-coded alert levels
   - Responsive design

### Integration Points

1. **Home Page (`Home.jsx`)**
   - Shows alerts for current shift
   - Displays below shift information

2. **Dashboard Page (`Dashboard.jsx`)**
   - Shows alerts for each upcoming shift
   - Integrated into shift cards

## Environment Variables Required

### OpenWeatherMap API
```env
WEATHER_API_KEY=your_openweathermap_api_key
# OR
OPENWEATHER_API_KEY=your_openweathermap_api_key
```

Get your API key from: https://openweathermap.org/api

### Google Maps API (Option A - Transit)
```env
GOOGLE_MAPS_API_KEY=your_google_maps_api_key
```

Get your API key from: https://console.cloud.google.com/

**Required APIs:**
- **Directions API** ✅ (Required for transit routing)
- **Geocoding API** ✅ (Required for address conversion)
- Maps JavaScript API (Optional, for future map display)

**Transit Support:**
- ✅ Buses (BUS)
- ✅ Trains (SUBWAY, HEAVY_RAIL, LIGHT_RAIL, TRAM, COMMUTER_TRAIN, RAIL)
- ✅ Walking directions to/from stations
- ✅ Transfer information
- ✅ Multiple route alternatives
- ⚠️ Schedule-based times (no real-time delays)

**Note**: We're using **Option A: Google Maps Directions API** for transit. This provides comprehensive bus and train routing for most major cities. For real-time delays, would need to integrate city-specific APIs (Option B) in the future.

## Usage

### For Guards

1. **View Current Shift Alerts**
   - Go to Home page
   - Alerts automatically appear below current shift information
   - If origin location is not provided, browser will request geolocation

2. **View Upcoming Shift Alerts**
   - Go to Dashboard page
   - Each shift card shows its alerts
   - Alerts include weather, traffic, and transit options

3. **Understanding Alert Levels**
   - **INFO** (Blue): Normal conditions, no action needed
   - **WARNING** (Yellow): Minor issues, consider leaving a few minutes early
   - **CRITICAL** (Red): Severe conditions, significant delays expected

### For Developers

#### Adding Alerts to a New Component

```jsx
import ShiftAlerts from "../components/ShiftAlerts";

// In your component
<ShiftAlerts 
  shiftId={shift.id} 
  shift={shift} 
  origin="123 Main St, City, State" // Optional
/>
```

#### Customizing Alert Display

The `ShiftAlerts` component accepts:
- `shiftId` (required): The shift ID
- `shift` (optional): Full shift object
- `origin` (optional): Guard's starting location (address or "lat,lng")

If `origin` is not provided, the component will attempt to use browser geolocation.

## API Response Examples

### Combined Alerts Response

```json
{
  "shiftId": "uuid",
  "location": "123 Main St, New York, NY",
  "weather": {
    "condition": "Rain",
    "description": "heavy rain",
    "temperature": 45,
    "alertLevel": "WARNING",
    "warnings": ["Heavy rain expected"],
    "recommendation": "Bring rain gear, allow extra travel time"
  },
  "traffic": {
    "normalTime": 25,
    "currentTime": 40,
    "delay": 15,
    "alertLevel": "WARNING",
    "issues": ["Traffic delay: +15 minutes"],
    "recommendation": "Leave 20 minutes earlier"
  },
  "transit": {
    "options": [
      {
        "mode": "bus",
        "routeName": "M15",
        "totalTime": 35,
        "walkingTime": 5,
        "transitTime": 30,
        "transfers": 0,
        "delays": 0,
        "status": "on-time"
      }
    ],
    "bestOption": { ... }
  },
  "comparison": {
    "bestMode": "transit",
    "reason": "Similar time, but avoids traffic and parking",
    "recommendation": "Consider M15 - avoids traffic"
  },
  "overallAlertLevel": "WARNING",
  "overallRecommendation": "Leave 20 minutes earlier due to weather and traffic conditions",
  "leaveEarlyMinutes": 20
}
```

## Error Handling

The system gracefully handles:
- Missing API keys (shows "not configured" message)
- API failures (falls back to basic information)
- Invalid locations (shows "could not parse location")
- Network errors (shows error message to user)

## Future Enhancements

1. **Real-time Transit Delays**
   - Integrate with city-specific transit APIs (MTA, BART, etc.)
   - Show real-time bus/train delays

2. **Map Visualization**
   - Display routes on interactive maps
   - Show traffic conditions visually

3. **Location Preferences**
   - Save guard's home address
   - Auto-populate origin location

4. **Push Notifications**
   - Alert guards of severe weather/traffic before shift
   - Notify of transit delays

5. **Historical Data**
   - Track typical travel times
   - Learn guard's preferred routes

## Testing

### Test Weather Alerts
```bash
curl -H "Authorization: Bearer <guard_token>" \
  http://localhost:5000/api/guard/alerts/weather/<shift_id>
```

### Test Traffic Alerts
```bash
curl -H "Authorization: Bearer <guard_token>" \
  "http://localhost:5000/api/guard/alerts/traffic/<shift_id>?origin=123+Main+St,+New+York,+NY"
```

### Test Combined Alerts
```bash
curl -H "Authorization: Bearer <guard_token>" \
  "http://localhost:5000/api/guard/alerts/combined/<shift_id>?origin=123+Main+St,+New+York,+NY"
```

## Notes

- Weather API uses OpenWeatherMap free tier (1000 calls/day)
- Google Maps API requires billing enabled (but has free tier)
- Transit data availability depends on location (better in major cities)
- Geolocation requires user permission in browser

## Support

For issues or questions:
1. Check API keys are set correctly
2. Verify location format is parseable
3. Check browser console for errors
4. Review backend logs for API errors
