# 🧪 Testing Geofencing & Spoofing Detection

## Quick Start

### Prerequisites

1. **Backend server running** on port 4000
   ```bash
   cd abe-guard-ai/backend
   npm start
   ```

2. **Create a test shift with geofence** (or use existing shift):
   - Shift must have `location_lat`, `location_lng` set
   - Optional: Set `geofence_radius_m` (default: 100m)

3. **Get guard email and shift ID**

### Run Tests

```bash
cd abe-guard-ai/backend

# Basic test (uses default guard email)
node src/scripts/testGeofencingClockIn.js bob@abe.com SHIFT_ID

# Custom guard email
node src/scripts/testGeofencingClockIn.js guard@example.com SHIFT_ID
```

## What Gets Tested

### ✅ Test 1: Geofencing Validation
- **Test 1a**: Clock-in inside geofence (should succeed)
- **Test 1b**: Clock-in outside geofence (should fail with 400 error)

### ✅ Test 2: Spoofing Detection
- **Test 2a**: Normal clock-in with familiar device/location (low risk)
- **Test 2b**: Suspicious clock-in with new device/odd location (high risk flagged)

### ✅ Test 3: Verification Records
- Checks that `clock_in_verifications` records are created
- Validates geofence and AI analysis verification data

## Manual Testing with cURL

### 1. Get Guard Token

```bash
node src/scripts/createGuardToken.js guard@example.com
```

### 2. Test Clock-In (Inside Geofence)

```bash
curl -X POST http://localhost:4000/api/time/shifts/SHIFT_ID/clock-in \
  -H "Authorization: Bearer YOUR_GUARD_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "lat": 40.7128,
    "lng": -74.0060,
    "accuracyM": 10,
    "deviceId": "test-device-123",
    "deviceType": "iOS",
    "deviceOS": "iOS 17.0"
  }'
```

### 3. Test Clock-In (Outside Geofence - Should Fail)

```bash
# Use coordinates far from shift location
curl -X POST http://localhost:4000/api/time/shifts/SHIFT_ID/clock-in \
  -H "Authorization: Bearer YOUR_GUARD_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "lat": 40.7580,
    "lng": -73.9855,
    "accuracyM": 10,
    "deviceId": "test-device-123",
    "deviceType": "iOS",
    "deviceOS": "iOS 17.0"
  }'
```

Expected response (400):
```json
{
  "message": "Clock-in location is outside the allowed geofence area",
  "distance": 1234.56,
  "radius": 100
}
```

## Checking Results in Database

### View Time Entries with Risk Scores

```sql
SELECT 
  id,
  guard_id,
  shift_id,
  clock_in_at,
  clock_in_lat,
  clock_in_lng,
  spoofing_risk_score,
  verification_notes
FROM time_entries
WHERE shift_id = 'YOUR_SHIFT_ID'
ORDER BY clock_in_at DESC;
```

### View Verification Records

```sql
SELECT 
  id,
  verification_type,
  verification_result,
  verification_data,
  created_at
FROM clock_in_verifications
WHERE shift_id = 'YOUR_SHIFT_ID'
ORDER BY created_at DESC;
```

## Expected Behavior

### Geofencing
- ✅ **Inside geofence**: Clock-in succeeds
- ❌ **Outside geofence**: Clock-in blocked (400 error)
- ⏭️ **No geofence set**: Clock-in succeeds (backward compatible)

### Spoofing Detection
- ✅ **Low risk** (< 0.3): Clock-in succeeds, no flags
- 🟡 **Medium risk** (0.3-0.7): Clock-in succeeds, logged
- 🔴 **High risk** (> 0.7): Clock-in succeeds but flagged for review

### Verification Records
- Always created when geofence is checked
- Always created for AI analysis
- Stores detailed risk factors and analysis

## Troubleshooting

### "Shift not found"
- Verify shift ID is correct UUID
- Check shift exists in database

### "Guard is not assigned to this shift"
- Assign guard to shift in database
- Or test with guard who is assigned

### "Geofence not configured"
- Set `location_lat`, `location_lng` on shift
- Optional: Set `geofence_radius_m` (default: 100m)

### No verification records created
- Check if clock-in succeeded
- Verify `clock_in_verifications` table exists (migration ran)
- Check server logs for errors
