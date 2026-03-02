# Public Transit API - Option A Implementation

## Overview

**Option A: Google Maps Directions API (Transit Mode)** ✅ **CURRENTLY IMPLEMENTED**

This is the primary transit API solution for buses, trains, subways, and other public transportation.

---

## What Option A Provides

### Supported Transit Types

1. **Buses** (`BUS`)
   - Local buses
   - Express buses
   - Bus rapid transit (BRT)

2. **Trains** (Multiple types)
   - **Subway** (`SUBWAY`) - Underground metro systems
   - **Heavy Rail** (`HEAVY_RAIL`) - Commuter trains, regional rail
   - **Light Rail** (`LIGHT_RAIL`) - Streetcars, trams
   - **Tram** (`TRAM`) - Trolleys, streetcars
   - **Commuter Train** (`COMMUTER_TRAIN`) - Regional commuter services
   - **Rail** (`RAIL`) - General rail services

3. **Other Transit**
   - Ferries
   - Cable cars
   - Funiculars

### Features Included

✅ **Route Finding**
- Multiple route options
- Alternative routes
- Best route recommendation

✅ **Schedule Information**
- Departure times
- Arrival times
- Duration estimates

✅ **Walking Directions**
- Time to walk to station
- Time to walk from station
- Total walking time

✅ **Transfer Information**
- Number of transfers
- Transfer locations
- Transfer times

✅ **Route Details**
- Line names (e.g., "M15", "Red Line", "LIRR")
- Station names
- Stop names

---

## API Configuration

### Required Environment Variable

```env
GOOGLE_MAPS_API_KEY=your_google_maps_api_key
```

### Required Google Cloud APIs

Enable these APIs in Google Cloud Console:

1. **Directions API** ✅ (Required)
   - Used for transit route planning
   - Cost: Pay per request

2. **Geocoding API** ✅ (Required)
   - Used to convert addresses to coordinates
   - Cost: Pay per request

3. **Maps JavaScript API** (Optional)
   - For future map visualization
   - Not currently used

### API Setup Steps

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create or select a project
3. Enable **Directions API** and **Geocoding API**
4. Create API key
5. Restrict API key to:
   - Directions API
   - Geocoding API
   - (Optional) Restrict by IP/HTTP referrer
6. Add key to `.env` file

---

## How It Works

### Request Flow

```
1. Guard requests transit options for shift
   ↓
2. System geocodes origin and destination addresses
   ↓
3. Calls Google Maps Directions API with mode=transit
   ↓
4. Processes response to extract:
   - Bus/train routes
   - Schedules
   - Walking times
   - Transfers
   ↓
5. Returns formatted transit options
```

### Example API Request

```javascript
GET https://maps.googleapis.com/maps/api/directions/json
  ?origin=Brooklyn,NY
  &destination=Manhattan,NY
  &mode=transit
  &alternatives=true
  &departure_time=1234567890
  &key=YOUR_API_KEY
```

### Example Response Processing

The service extracts:
- **Vehicle Type**: BUS, SUBWAY, HEAVY_RAIL, etc.
- **Route Name**: Line number/name (e.g., "M15", "Red Line")
- **Stops**: Departure and arrival stations
- **Times**: Departure, arrival, total duration
- **Walking**: Time to/from stations
- **Transfers**: Number of transfers required

---

## Current Implementation Status

### ✅ Implemented

- [x] Google Maps Directions API integration
- [x] Transit mode routing
- [x] Bus route detection
- [x] Train route detection (subway, heavy rail, light rail)
- [x] Walking time calculation
- [x] Transfer counting
- [x] Multiple route options
- [x] Best route selection
- [x] Comparison with driving

### ⚠️ Limitations (Option A)

1. **No Real-Time Delays**
   - Google Maps provides schedule-based times
   - Does not include real-time delays or service disruptions
   - Status is always "on-time" (schedule-based)

2. **Coverage Varies by Location**
   - Best coverage in major metropolitan areas
   - Limited coverage in rural areas
   - Some transit agencies not included

3. **Cost**
   - Pay per request
   - Can be expensive at scale
   - Free tier: $200/month credit

---

## Future Enhancements (Optional)

### Option B: City-Specific APIs (Real-Time Delays)

For real-time delay information, could integrate:

- **MTA API** (New York)
  - Real-time subway/bus delays
  - Service status
  - Alerts

- **BART API** (San Francisco Bay Area)
  - Real-time train delays
  - Elevator/escalator status

- **Other City APIs**
  - Each major city has its own API
  - Would need to integrate per city

### Option C: TransitLand API

- Unified API for multiple transit agencies
- Real-time data
- GTFS-RT feeds

### Option D: GTFS-RT Feeds

- Direct feeds from transit agencies
- Real-time vehicle positions
- Service alerts

---

## Usage Example

```javascript
// In guard-ui, when viewing shift alerts
const alerts = await getCombinedAlert(shiftId, {
  origin: "123 Main St, Brooklyn, NY",
  includeTransit: true
});

// Response includes:
{
  transit: {
    options: [
      {
        mode: "bus",
        routeName: "M15",
        totalTime: 35,
        walkingTime: 5,
        transitTime: 30,
        transfers: 0,
        status: "on-time",
        delays: 0
      },
      {
        mode: "train",
        routeName: "4",
        totalTime: 28,
        walkingTime: 8,
        transitTime: 20,
        transfers: 1,
        status: "on-time",
        delays: 0
      }
    ],
    bestOption: { /* fastest route */ }
  }
}
```

---

## Cost Considerations

### Google Maps API Pricing (as of 2024)

- **Directions API**: $5.00 per 1,000 requests
- **Geocoding API**: $5.00 per 1,000 requests
- **Free Tier**: $200/month credit

### Cost Example

- 1,000 transit requests/month = $5.00
- 10,000 transit requests/month = $50.00
- With free tier: First $200 free, then pay per use

### Optimization Tips

1. **Cache Results**: Cache transit routes for same origin/destination
2. **Batch Requests**: Request multiple shifts at once
3. **Limit Alternatives**: Only request 1-2 alternative routes
4. **Use Departure Time**: More accurate results, same cost

---

## Testing

To test Option A transit functionality:

```bash
# Test with a real shift
curl -H "Authorization: Bearer <guard_token>" \
  "http://localhost:5000/api/guard/alerts/transit/<shift_id>?origin=Brooklyn,NY"
```

---

## Summary

**Option A (Google Maps Directions API)** is:
- ✅ **Currently Implemented**
- ✅ **Supports buses and trains**
- ✅ **Works in most major cities**
- ✅ **Easy to set up** (just API key)
- ⚠️ **No real-time delays** (schedule-based only)
- ⚠️ **Cost per request**

**Status**: Ready to use once `GOOGLE_MAPS_API_KEY` is configured.

---

**Last Updated**: Implementation confirmed for Option A
**Next Steps**: Add API key to `.env` file to enable transit features
