/**
 * Test Script: Geofencing and Spoofing Detection for Clock-In
 * 
 * Tests the new geofencing and AI spoofing detection features.
 * 
 * Usage:
 *   node src/scripts/testGeofencingClockIn.js [guard-email] [shift-id]
 * 
 * Prerequisites:
 *   1. A shift must exist with location_lat, location_lng set (or without for backward compatibility)
 *   2. Guard must be assigned to the shift
 *   3. Guard token must be generated using createGuardToken.js
 */

require("dotenv").config();
const jwt = require("jsonwebtoken");
const { sequelize } = require("../config/db");
const { Shift, Guard, TimeEntry, ClockInVerification } = require("../models");
const geofencingService = require("../services/geofencing.service");

const BASE_URL = process.env.BACKEND_URL || "http://localhost:4000";
const API_URL = `${BASE_URL}/api/time`;

async function getGuardToken(email) {
  const guard = await Guard.findOne({ where: { email } });
  if (!guard) {
    throw new Error(`Guard not found: ${email}`);
  }

  return jwt.sign(
    {
      guardId: guard.id,
      tenant_id: guard.tenant_id || null,
      role: "guard",
    },
    process.env.JWT_SECRET,
    { expiresIn: "12h" }
  );
}

async function testClockIn(shiftId, guardToken, location, deviceInfo = {}) {
  try {
    const response = await fetch(
      `${API_URL}/shifts/${shiftId}/clock-in`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${guardToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          lat: location.lat,
          lng: location.lng,
          accuracyM: location.accuracy || 10,
          deviceId: deviceInfo.id || `test-device-${Date.now()}`,
          deviceType: deviceInfo.type || "iOS",
          deviceOS: deviceInfo.os || "iOS 17.0"
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error: data,
        status: response.status
      };
    }

    return { success: true, data };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      status: null
    };
  }
}

async function runTests() {
  try {
    await sequelize.authenticate();
    console.log("✅ Database connected\n");

    const guardEmail = process.argv[2] || "bob@abe.com";
    const shiftId = process.argv[3];

    if (!shiftId) {
      console.error("❌ Please provide a shift ID");
      console.log("Usage: node src/scripts/testGeofencingClockIn.js [guard-email] [shift-id]");
      process.exit(1);
    }

    // Get guard and token
    console.log(`📋 Getting guard token for: ${guardEmail}`);
    const guardToken = await getGuardToken(guardEmail);
    const guard = await Guard.findOne({ where: { email: guardEmail } });
    console.log(`   Guard ID: ${guard.id}`);
    console.log(`   Tenant ID: ${guard.tenant_id || "N/A"}\n`);

    // Get shift info
    console.log(`📋 Fetching shift: ${shiftId}`);
    const shift = await Shift.findByPk(shiftId);
    if (!shift) {
      console.error(`❌ Shift not found: ${shiftId}`);
      process.exit(1);
    }

    console.log(`   Shift Date: ${shift.shift_date}`);
    console.log(`   Location: ${shift.location || "N/A"}`);
    console.log(`   Geofence: ${shift.location_lat ? `Lat: ${shift.location_lat}, Lng: ${shift.location_lng}, Radius: ${shift.geofence_radius_m || 100}m` : "Not configured"}\n`);

    if (String(shift.guard_id) !== String(guard.id)) {
      console.warn(`⚠️  Warning: Guard ${guard.id} is not assigned to this shift (assigned: ${shift.guard_id})`);
      console.log(`   This test may fail with 403 Forbidden\n`);
    }

    // ========== TEST 1: Geofencing (if configured) ==========
    if (shift.location_lat && shift.location_lng) {
      console.log("=".repeat(60));
      console.log("TEST 1: Geofencing Validation");
      console.log("=".repeat(60));

      const radiusM = shift.geofence_radius_m || 100;
      const shiftLocation = { lat: shift.location_lat, lng: shift.location_lng };

      // Test 1a: Inside geofence (should succeed)
      console.log("\n📍 Test 1a: Clock-in INSIDE geofence");
      const insideLocation = { ...shiftLocation, accuracy: 5 }; // Same as shift location
      const result1a = await testClockIn(shiftId, guardToken, insideLocation);
      
      if (result1a.success) {
        console.log("   ✅ PASS: Clock-in allowed inside geofence");
        console.log(`   Time Entry ID: ${result1a.data.timeEntry?.id}`);
      } else {
        console.log("   ❌ FAIL: Clock-in blocked (should be allowed)");
        console.log(`   Error: ${JSON.stringify(result1a.error)}`);
      }

      // Test 1b: Outside geofence (should fail)
      console.log("\n📍 Test 1b: Clock-in OUTSIDE geofence");
      // Calculate a point 500m away (well outside 100m radius)
      const distanceKm = 0.5; // 500 meters
      const outsideLat = shiftLocation.lat + (distanceKm / 111.0); // Rough conversion
      const outsideLocation = { lat: outsideLat, lng: shiftLocation.lng, accuracy: 5 };
      
      const calculatedDistance = geofencingService.calculateDistance(
        outsideLocation.lat,
        outsideLocation.lng,
        shiftLocation.lat,
        shiftLocation.lng
      );
      console.log(`   Testing location ${calculatedDistance.toFixed(2)}m from shift location (radius: ${radiusM}m)`);

      const result1b = await testClockIn(shiftId, guardToken, outsideLocation);
      
      if (!result1b.success && result1b.status === 400) {
        console.log("   ✅ PASS: Clock-in blocked outside geofence");
        console.log(`   Distance: ${result1b.error?.distance || calculatedDistance}m`);
      } else {
        console.log("   ❌ FAIL: Clock-in should be blocked outside geofence");
        console.log(`   Response: ${JSON.stringify(result1b)}`);
      }
    } else {
      console.log("⏭️  Skipping geofencing tests (shift has no geofence configured)");
    }

    // ========== TEST 2: Spoofing Detection ==========
    console.log("\n" + "=".repeat(60));
    console.log("TEST 2: Spoofing Detection (AI Analysis)");
    console.log("=".repeat(60));

    // Test 2a: Normal clock-in (low risk)
    console.log("\n🔍 Test 2a: Normal clock-in (low risk expected)");
    const normalLocation = shift.location_lat 
      ? { lat: shift.location_lat, lng: shift.location_lng, accuracy: 10 }
      : { lat: 40.7128, lng: -74.0060, accuracy: 10 }; // Default NYC coordinates
    
    const normalDevice = {
      id: guard.device_id || `device-${guard.id}`,
      type: "iOS",
      os: "iOS 17.0"
    };

    const result2a = await testClockIn(shiftId, guardToken, normalLocation, normalDevice);
    
    if (result2a.success) {
      const timeEntry = await TimeEntry.findOne({
        where: { shift_id: shiftId, guard_id: guard.id },
        order: [['clock_in_at', 'DESC']]
      });

      if (timeEntry) {
        console.log("   ✅ PASS: Clock-in succeeded");
        console.log(`   Risk Score: ${timeEntry.spoofing_risk_score || 'N/A'}`);
        console.log(`   Verification Notes: ${timeEntry.verification_notes ? 'Present' : 'None'}`);
        
        if (timeEntry.verification_notes?.riskScore !== undefined) {
          const risk = timeEntry.verification_notes.riskScore;
          console.log(`   Risk Level: ${risk < 0.3 ? '🟢 Low' : risk < 0.7 ? '🟡 Medium' : '🔴 High'}`);
        }
      }
    } else {
      console.log("   ❌ FAIL: Clock-in failed");
      console.log(`   Error: ${JSON.stringify(result2a.error)}`);
    }

    // Test 2b: Suspicious clock-in (new device, unusual location)
    console.log("\n🔍 Test 2b: Suspicious clock-in (new device, different location)");
    const suspiciousLocation = shift.location_lat
      ? { 
          lat: shift.location_lat + (5 / 111.0), // 5km away
          lng: shift.location_lng,
          accuracy: 500 // Very low accuracy (suspicious)
        }
      : { lat: 40.7580, lng: -73.9855, accuracy: 500 }; // Different NYC location
    
    const suspiciousDevice = {
      id: `suspicious-device-${Date.now()}`,
      type: "Android", // Different from normal
      os: "Android 13.0"
    };

    // Note: This might succeed but should flag high risk
    const result2b = await testClockIn(shiftId, guardToken, suspiciousLocation, suspiciousDevice);
    
    if (result2b.success || result2b.status === 400) {
      // Even if blocked by geofence, check if verification records exist
      const timeEntry = await TimeEntry.findOne({
        where: { shift_id: shiftId, guard_id: guard.id },
        order: [['clock_in_at', 'DESC']]
      });

      if (timeEntry) {
        console.log(`   ⚠️  Clock-in result: ${result2b.success ? 'Succeeded' : 'Blocked'}`);
        console.log(`   Risk Score: ${timeEntry.spoofing_risk_score || 'N/A'}`);
        
        if (timeEntry.spoofing_risk_score && timeEntry.spoofing_risk_score > 0.7) {
          console.log("   ✅ PASS: High risk detected and flagged");
        } else {
          console.log("   ℹ️  Risk score calculated but below flag threshold");
        }
      }
    }

    // ========== TEST 3: Verification Records ==========
    console.log("\n" + "=".repeat(60));
    console.log("TEST 3: Verification Records Audit Trail");
    console.log("=".repeat(60));

    const timeEntry = await TimeEntry.findOne({
      where: { shift_id: shiftId, guard_id: guard.id },
      order: [['clock_in_at', 'DESC']]
    });

    if (timeEntry) {
      const verifications = await ClockInVerification.findAll({
        where: { time_entry_id: timeEntry.id },
        order: [['created_at', 'DESC']]
      });

      console.log(`\n📋 Found ${verifications.length} verification record(s) for Time Entry: ${timeEntry.id}`);

      verifications.forEach((v, i) => {
        console.log(`\n   Record ${i + 1}:`);
        console.log(`   Type: ${v.verification_type}`);
        console.log(`   Result: ${v.verification_result}`);
        console.log(`   Created: ${v.created_at}`);

        if (v.verification_data) {
          const data = v.verification_data;
          if (v.verification_type === 'geofence') {
            console.log(`   Distance: ${data.distance_m ? data.distance_m.toFixed(2) : 'N/A'}m`);
            console.log(`   Within: ${data.within ? 'Yes' : 'No'}`);
          } else if (v.verification_type === 'ai_analysis') {
            console.log(`   Risk Score: ${data.risk_score || 'N/A'}`);
            console.log(`   Flagged: ${data.should_flag ? 'Yes' : 'No'}`);
            if (data.factors) {
              console.log(`   Factors: Device=${data.factors.deviceFingerprint?.score || 'N/A'}, Location=${data.factors.locationPattern?.score || 'N/A'}`);
            }
          }
        }
      });

      if (verifications.length > 0) {
        console.log("\n   ✅ PASS: Verification records created successfully");
      } else {
        console.log("\n   ⚠️  WARNING: No verification records found");
      }
    } else {
      console.log("\n   ⚠️  No time entry found to check verification records");
    }

    console.log("\n" + "=".repeat(60));
    console.log("✅ Tests completed!");
    console.log("=".repeat(60));

    await sequelize.close();
    process.exit(0);
  } catch (error) {
    console.error("\n❌ Test error:", error.message);
    console.error(error.stack);
    if (sequelize) await sequelize.close();
    process.exit(1);
  }
}

runTests();
