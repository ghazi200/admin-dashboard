# 📍 Geofenced + AI-Verified Clock-In Feature Review

## Current Implementation Status

### ✅ What Exists

1. **Basic Clock-In/Out System**
   - Location: `src/controllers/timeEntries.controller.js`
   - Endpoints: `POST /shifts/:shiftId/clock-in`, `POST /shifts/:shiftId/clock-out`
   - Location data capture:
     - `clock_in_lat`, `clock_in_lng`, `clock_in_accuracy_m` (stored in `time_entries` table)
     - `lat`, `lng`, `accuracy_m` (stored in `shift_time_entries` events)

2. **TimeEntry Model** (`src/models/TimeEntry.js`)
   - Already has location fields:
     ```javascript
     clock_in_lat: DataTypes.DOUBLE,
     clock_in_lng: DataTypes.DOUBLE,
     clock_in_accuracy_m: DataTypes.DOUBLE,
     clock_out_lat: DataTypes.DOUBLE,
     clock_out_lng: DataTypes.DOUBLE,
     clock_out_accuracy_m: DataTypes.DOUBLE,
     ```

3. **ShiftTimeEntry Events** (`createShiftEvent` function)
   - Captures location on every event (lines 63-66)
   - Stores device metadata (type, OS, ID)

### ❌ What's Missing for Geofencing + AI Verification

1. **Geofencing Logic**
   - ❌ No validation that guard is within radius of shift location
   - ❌ Shifts table only has `location` (string) - no lat/lng coordinates
   - ❌ No geofence radius configuration per shift/tenant
   - ❌ No distance calculation (Haversine formula)

2. **AI Spoofing Detection**
   - ❌ No behavior analysis patterns
   - ❌ No device fingerprinting validation
   - ❌ No location history analysis
   - ❌ No anomaly detection (unusual check-in patterns)

3. **Database Schema**
   - ❌ Shifts table needs `location_lat`, `location_lng`, `geofence_radius_m`
   - ❌ Time entries table needs `verification_photo_url`, `verification_status`
   - ❌ Need table for `clock_in_verifications` (audit trail)

## Required Changes

### 1. Database Migrations

**Migration: Add location coordinates to shifts**
```sql
ALTER TABLE shifts 
  ADD COLUMN location_lat DOUBLE PRECISION,
  ADD COLUMN location_lng DOUBLE PRECISION,
  ADD COLUMN geofence_radius_m INTEGER DEFAULT 100;

-- Index for geospatial queries
CREATE INDEX idx_shifts_location_coords ON shifts(location_lat, location_lng);
```

**Migration: Add verification fields to time_entries**
```sql
ALTER TABLE time_entries
  ADD COLUMN spoofing_risk_score DECIMAL(3,2),
  ADD COLUMN verification_notes JSONB;
```

**Migration: Create clock_in_verifications audit table**
```sql
CREATE TABLE clock_in_verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  time_entry_id UUID REFERENCES time_entries(id),
  tenant_id UUID REFERENCES tenants(id),
  guard_id UUID REFERENCES guards(id),
  shift_id UUID REFERENCES shifts(id),
  verification_type TEXT, -- 'geofence', 'ai_analysis'
  verification_result TEXT, -- 'passed', 'failed', 'flagged'
  verification_data JSONB, -- stores details like distance, risk score, etc.
  created_at TIMESTAMP DEFAULT NOW()
);
```

### 2. Backend Services

**New Service: `src/services/geofencing.service.js`**
- `calculateDistance(lat1, lng1, lat2, lng2)` - Haversine formula
- `isWithinGeofence(guardLat, guardLng, shiftLat, shiftLng, radiusM)` - validation
- `getGeofenceStatus(shiftId, guardLat, guardLng)` - check if within bounds

**New Service: `src/services/spoofingDetection.service.js`**
- `analyzeDeviceFingerprint(deviceId, deviceType, deviceOS, ip, history)` - device validation
- `analyzeLocationPatterns(guardId, currentLocation, recentCheckIns)` - pattern analysis
- `detectAnomalies(guardId, checkInData, historicalData)` - AI-powered anomaly detection
- `calculateRiskScore(checkInData, historicalData)` - returns 0.0-1.0 risk score

### 3. Controller Updates

**Update: `src/controllers/timeEntries.controller.js`**

Add to `clockIn` function (after line 112):

```javascript
// 1. Geofencing validation
const geofencingService = require("../services/geofencing.service");
if (shift.location_lat && shift.location_lng) {
  const isWithin = geofencingService.isWithinGeofence(
    req.body.lat,
    req.body.lng,
    shift.location_lat,
    shift.location_lng,
    shift.geofence_radius_m || 100
  );
  
  if (!isWithin) {
    return res.status(400).json({ 
      message: "Clock-in location is outside the allowed geofence area",
      distance: geofencingService.calculateDistance(
        req.body.lat,
        req.body.lng,
        shift.location_lat,
        shift.location_lng
      )
    });
  }
}

// 2. Spoofing detection (AI analysis)
const spoofingService = require("../services/spoofingDetection.service");
const riskScore = await spoofingService.calculateRiskScore({
  guardId,
  shiftId: shift.id,
  location: { lat: req.body.lat, lng: req.body.lng },
  device: {
    id: req.body.deviceId,
    type: req.body.deviceType,
    os: req.body.deviceOS,
    ip: getIp(req)
  },
  timestamp: new Date()
});

// Flag high-risk check-ins but don't block (admin review)
if (riskScore > 0.7) {
  // Create verification record for admin review
  await ClockInVerification.create({
    time_entry_id: te.id,
    tenant_id: shift.tenant_id,
    guard_id: guardId,
    shift_id: shift.id,
    verification_type: 'ai_analysis',
    verification_result: 'flagged',
    verification_data: { risk_score: riskScore, reason: 'High spoofing risk detected' }
  });
}
```

### 4. Shift Model Updates

**Update: `src/models/Shift.js`**
```javascript
location_lat: DataTypes.DOUBLE,
location_lng: DataTypes.DOUBLE,
geofence_radius_m: {
  type: DataTypes.INTEGER,
  allowNull: true,
  defaultValue: 100, // 100 meters default
},
```

### 5. API Endpoints

**New Endpoint: Admin verification review**
```javascript
// POST /api/admin/time-entries/:timeEntryId/verify
// Body: { action: 'approve' | 'reject', notes?: string }
```

**New Endpoint: Get verification status**
```javascript
// GET /api/time/shifts/:shiftId/verification-status
// Returns: { geofenceEnabled: boolean }
```

## Implementation Phases

### Phase 1: Basic Geofencing (Low Complexity)
- Add lat/lng to shifts table
- Implement distance calculation
- Validate geofence on clock-in
- **Estimated time**: 1-2 days

### Phase 2: Spoofing Detection (Medium-High Complexity)
- Device fingerprinting
- Location pattern analysis
- Risk score calculation
- Flag suspicious check-ins
- **Estimated time**: 3-5 days

## Frontend Changes Needed

1. **Guard UI Clock-In Flow**
   - Request location permissions
   - Show geofence status (inside/outside)
   - Display verification status

2. **Admin Dashboard**
   - Set shift location coordinates (map picker)
   - Configure geofence radius
   - Review flagged check-ins

## Dependencies

- **Geospatial calculations**: `geolib` or native Haversine implementation
- **Photo upload**: `multer` (already in use for pay stubs)
- **Face verification**: AWS Rekognition / Azure Face API / FaceIO
- **File storage**: AWS S3 / local storage (extend existing uploads config)

## Testing Considerations

1. **Geofencing**
   - Test inside/outside radius
   - Edge cases (boundary conditions)
   - Missing location data handling

2. **Spoofing Detection**
   - Normal check-in patterns
   - Suspicious patterns (different device, location jump)
   - Historical data availability

3. **Selfie Verification**
   - Photo upload success/failure
   - Liveness check accuracy
   - Optional vs required flows

## Notes

- Current code already captures location data - just needs validation logic
- Geofencing is straightforward - main work is adding coordinates to shifts
- Spoofing detection requires historical data - may need gradual rollout
- Selfie verification adds complexity but is optional - can be phased in
