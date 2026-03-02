# AI RAG Callout Risk Feature - Complete ✅

## Overview

Added AI RAG (Retrieval-Augmented Generation) functionality to the Callout Risk page that scans for weather, train delays, shutdowns, and other external factors that could affect guard lateness or callouts based on site location (city, state).

## What Was Added

### 1. External Risk Factors Service (`backend/src/services/externalRiskFactors.service.js`)

A new service that:
- **Parses location** - Extracts city and state from shift location strings
- **Uses AI RAG** - Leverages OpenAI to analyze external factors
- **Searches for**:
  - Weather conditions (storms, snow, extreme heat/cold)
  - Public transportation delays (trains, buses, subways)
  - Traffic conditions and road closures
  - Emergency situations and shutdowns
- **Returns structured data** with risk level, score, factors, and details

### 2. Integration with Callout Risk Prediction

Updated `calloutRiskPrediction.service.js` to:
- Call external risk factors service for each shift
- Add external risk score (0-30 points) to total risk calculation
- Include external risk data in risk response
- Update risk message to mention external factors

### 3. Frontend Display

Updated `CalloutRisk.jsx` to:
- Display external risk factors in risk cards
- Show weather/train/traffic/emergency indicators
- Display detailed information about external factors
- Color-code based on risk level (HIGH/MEDIUM)

## How It Works

### Location Parsing

The service parses location strings in multiple formats:
- `"New York, NY"` → `{ city: "New York", state: "NY" }`
- `"Los Angeles, California"` → `{ city: "Los Angeles", state: "California" }`
- `"123 Main St, Chicago IL"` → `{ city: "123 Main St, Chicago", state: "IL" }`

### AI Analysis

When `OPENAI_API_KEY` is configured:
1. Service builds a prompt with location and date
2. OpenAI analyzes weather, transit, traffic, and emergency factors
3. Returns structured JSON with:
   - Risk level (LOW/MEDIUM/HIGH)
   - Risk score (0-100)
   - List of factors (weather, transit, traffic, emergency)
   - Summary and detailed breakdown

### Risk Score Integration

External risk factors contribute up to 30 points (16% weight) to the total callout risk score:
- **0-30 points** based on external risk score (0-100) × 0.3
- **Weighted at 16%** of total risk calculation
- Other factors adjusted to accommodate new factor

### Fallback Behavior

If `OPENAI_API_KEY` is not configured:
- Returns LOW risk with message "External risk analysis unavailable"
- System continues to work with other risk factors
- No errors thrown

## API Response Structure

```json
{
  "risk": {
    "score": 75,
    "recommendation": "HIGH_RISK",
    "externalRiskFactors": {
      "location": "New York, NY",
      "date": "Monday, January 15, 2024",
      "riskLevel": "HIGH",
      "riskScore": 80,
      "factors": ["weather", "transit"],
      "summary": "Severe winter storm expected with 8-12 inches of snow. Public transit delays anticipated.",
      "details": {
        "weather": "Heavy snow expected, 8-12 inches accumulation",
        "transit": "Subway and bus delays expected due to weather",
        "traffic": "Road conditions deteriorating",
        "other": null
      },
      "source": "ai_analysis"
    },
    "factors": {
      "externalFactors": {
        "value": 24,
        "description": "Severe winter storm expected...",
        "weight": 0.16,
        "details": { ... }
      }
    }
  }
}
```

## Frontend Display

### High-Risk Shifts
- Shows external risk factors in a highlighted box
- Color-coded: Red for HIGH, Orange for MEDIUM
- Displays:
  - Risk level badge
  - Summary text
  - Factor icons (🌧️ weather, 🚇 transit, 🚗 traffic, 🚨 emergency)
  - Detailed breakdown (if available)

### Medium-Risk Shifts
- Compact display of external factors
- Same color-coding and information
- Slightly smaller format

## Configuration

### Required
- None (works with fallback if OpenAI not configured)

### Optional
- `OPENAI_API_KEY` - Enables AI analysis (recommended)
- `OPENAI_MODEL` - Model to use (default: "gpt-4o-mini")

## Example Usage

### Shift Location Format
For best results, use location format: `"City, State"` or `"City, ST"`

Examples:
- ✅ `"New York, NY"`
- ✅ `"Los Angeles, California"`
- ✅ `"Chicago, IL"`
- ⚠️ `"123 Main Street"` (will try to parse but may not extract state)

### Expected Behavior

1. **Shift with location** → External factors analyzed
2. **High external risk** → Adds up to 30 points to risk score
3. **Frontend displays** → Shows weather/train/shutdown info
4. **Risk message updated** → Mentions external factors

## Testing

To test the feature:

1. **Create a shift** with location including city and state
2. **View Callout Risk page** - Should show external factors if risk is HIGH/MEDIUM
3. **Check risk score** - Should include external risk contribution
4. **Verify display** - Should show weather/train/traffic indicators

## Files Modified

1. `backend/src/services/externalRiskFactors.service.js` - NEW
2. `backend/src/services/calloutRiskPrediction.service.js` - UPDATED
3. `frontend-admin-dashboard/admin-dashboard-frontend/src/pages/CalloutRisk.jsx` - UPDATED

## Future Enhancements

- Cache external risk data to reduce API calls
- Add more specific location parsing (addresses, ZIP codes)
- Integrate with real-time weather/transit APIs
- Add historical external risk tracking
- Support multiple locations per shift

## Summary

✅ **Complete** - AI RAG external risk factors feature is fully implemented and integrated into the Callout Risk prediction system. The system now analyzes weather, transit delays, traffic, and shutdowns to predict lateness and callout risks based on site location.
