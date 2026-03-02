/**
 * Spoofing Detection Service
 * 
 * Provides AI-powered spoofing detection and risk analysis for clock-in events.
 * Analyzes device fingerprints, location patterns, and historical data to detect anomalies.
 */

const { Op } = require('sequelize');

/**
 * Analyze device fingerprint for consistency
 * @param {string} deviceId - Current device ID
 * @param {string} deviceType - Current device type (iOS, Android, etc.)
 * @param {string} deviceOS - Current device OS version
 * @param {string} ip - Current IP address
 * @param {Array} history - Array of historical time entries with device info
 * @returns {Object} { consistent: boolean, riskFactors: Array, score: number }
 */
function analyzeDeviceFingerprint(deviceId, deviceType, deviceOS, ip, history = []) {
  const riskFactors = [];
  let riskScore = 0;

  if (!history || history.length === 0) {
    // No history available - first time check-in, slightly higher risk
    return {
      consistent: true,
      riskFactors: ['No historical data available'],
      score: 0.15 // Low risk for first-time check-in
    };
  }

  // Get most common device from history (last 30 entries)
  const recentHistory = history.slice(0, 30);
  const deviceCounts = {};
  const ipCounts = {};
  const deviceTypeCounts = {};

  recentHistory.forEach(entry => {
    if (entry.device_id) deviceCounts[entry.device_id] = (deviceCounts[entry.device_id] || 0) + 1;
    if (entry.ip_address) ipCounts[entry.ip_address] = (ipCounts[entry.ip_address] || 0) + 1;
    if (entry.device_type) deviceTypeCounts[entry.device_type] = (deviceTypeCounts[entry.device_type] || 0) + 1;
  });

  // Check device ID consistency
  const mostCommonDeviceId = Object.keys(deviceCounts).sort((a, b) => deviceCounts[b] - deviceCounts[a])[0];
  if (deviceId && mostCommonDeviceId && deviceId !== mostCommonDeviceId) {
    riskFactors.push(`Device ID changed (was: ${mostCommonDeviceId}, now: ${deviceId})`);
    riskScore += 0.25;
  }

  // Check device type consistency
  const mostCommonDeviceType = Object.keys(deviceTypeCounts).sort((a, b) => deviceTypeCounts[b] - deviceTypeCounts[a])[0];
  if (deviceType && mostCommonDeviceType && deviceType !== mostCommonDeviceType) {
    riskFactors.push(`Device type changed (was: ${mostCommonDeviceType}, now: ${deviceType})`);
    riskScore += 0.15;
  }

  // Check IP address consistency (more lenient - IPs can change)
  const mostCommonIp = Object.keys(ipCounts).sort((a, b) => ipCounts[b] - ipCounts[a])[0];
  if (ip && mostCommonIp && ip !== mostCommonIp) {
    // IP change is less risky (can happen with mobile networks, VPNs, etc.)
    riskFactors.push(`IP address changed (was: ${mostCommonIp}, now: ${ip})`);
    riskScore += 0.05; // Lower weight for IP changes
  }

  // Check for new device (never seen before)
  const isNewDevice = deviceId && !deviceCounts[deviceId];
  if (isNewDevice) {
    riskFactors.push('New device detected (not in recent history)');
    riskScore += 0.10;
  }

  return {
    consistent: riskScore < 0.3,
    riskFactors,
    score: Math.min(1.0, riskScore),
    deviceStats: {
      mostCommonDeviceId,
      mostCommonDeviceType,
      mostCommonIp,
      isNewDevice
    }
  };
}

/**
 * Analyze location patterns for suspicious jumps
 * @param {string} guardId - Guard ID
 * @param {Object} currentLocation - { lat: number, lng: number }
 * @param {Array} recentCheckIns - Array of recent time entries with locations
 * @returns {Object} { suspicious: boolean, riskFactors: Array, score: number }
 */
function analyzeLocationPatterns(guardId, currentLocation, recentCheckIns = []) {
  const riskFactors = [];
  let riskScore = 0;

  if (!currentLocation || !currentLocation.lat || !currentLocation.lng) {
    return {
      suspicious: false,
      riskFactors: ['Location data not available'],
      score: 0.0
    };
  }

  if (!recentCheckIns || recentCheckIns.length === 0) {
    // No location history - can't detect patterns
    return {
      suspicious: false,
      riskFactors: ['No location history available'],
      score: 0.0
    };
  }

  // Get last 10 check-ins with valid locations
  const validCheckIns = recentCheckIns
    .filter(entry => entry.clock_in_lat && entry.clock_in_lng)
    .slice(0, 10);

  if (validCheckIns.length === 0) {
    return {
      suspicious: false,
      riskFactors: ['No valid location history'],
      score: 0.0
    };
  }

  // Calculate average location from history
  const avgLat = validCheckIns.reduce((sum, e) => sum + parseFloat(e.clock_in_lat), 0) / validCheckIns.length;
  const avgLng = validCheckIns.reduce((sum, e) => sum + parseFloat(e.clock_in_lng), 0) / validCheckIns.length;

  // Calculate distance using Haversine formula (simplified)
  const geofencingService = require('./geofencing.service');
  const distanceFromAvg = geofencingService.calculateDistance(
    currentLocation.lat,
    currentLocation.lng,
    avgLat,
    avgLng
  );

  // Flag if more than 10km from average location
  if (distanceFromAvg > 10000) {
    riskFactors.push(`Location is ${Math.round(distanceFromAvg / 1000)}km from average check-in location`);
    riskScore += 0.30;
  } else if (distanceFromAvg > 5000) {
    riskFactors.push(`Location is ${Math.round(distanceFromAvg / 1000)}km from average check-in location`);
    riskScore += 0.15;
  }

  // Check for rapid location changes (if we have multiple recent check-ins)
  if (validCheckIns.length >= 2) {
    const lastCheckIn = validCheckIns[0];
    const previousCheckIn = validCheckIns[1];
    
    if (lastCheckIn.clock_in_at && previousCheckIn.clock_in_at) {
      const lastCheckInTime = new Date(lastCheckIn.clock_in_at);
      const previousCheckInTime = new Date(previousCheckIn.clock_in_at);
      const hoursBetween = (lastCheckInTime - previousCheckInTime) / (1000 * 60 * 60);

      // Calculate distance between last two check-ins
      const distanceBetween = geofencingService.calculateDistance(
        lastCheckIn.clock_in_lat,
        lastCheckIn.clock_in_lng,
        previousCheckIn.clock_in_lat,
        previousCheckIn.clock_in_lng
      );

      // If large distance change in short time (possible location spoofing)
      if (hoursBetween < 24 && distanceBetween > 50000) { // 50km in less than 24 hours
        riskFactors.push(`Rapid location change detected: ${Math.round(distanceBetween / 1000)}km in ${Math.round(hoursBetween)} hours`);
        riskScore += 0.25;
      }
    }
  }

  return {
    suspicious: riskScore > 0.3,
    riskFactors,
    score: Math.min(1.0, riskScore),
    distanceFromAvg: Math.round(distanceFromAvg)
  };
}

/**
 * Detect anomalies in check-in patterns
 * @param {string} guardId - Guard ID
 * @param {Object} checkInData - Current check-in data
 * @param {Object} historicalData - Historical time entries and patterns
 * @returns {Object} { anomalies: Array, riskScore: number }
 */
function detectAnomalies(guardId, checkInData, historicalData = {}) {
  const anomalies = [];
  let riskScore = 0;

  // Check-in time patterns
  if (historicalData.averageCheckInTime) {
    const currentTime = checkInData.timestamp ? new Date(checkInData.timestamp) : new Date();
    const avgTime = new Date(historicalData.averageCheckInTime);

    // Calculate time difference in hours
    const timeDiff = Math.abs(currentTime.getHours() - avgTime.getHours());

    // Flag if checking in at very different time than usual
    if (timeDiff > 4) {
      anomalies.push(`Unusual check-in time (${currentTime.getHours()}:00 vs typical ${avgTime.getHours()}:00)`);
      riskScore += 0.10;
    }
  }

  // Frequency patterns (too many check-ins in short period)
  if (historicalData.recentCheckInCount && historicalData.recentCheckInCount > 5) {
    anomalies.push(`High check-in frequency: ${historicalData.recentCheckInCount} check-ins recently`);
    riskScore += 0.05;
  }

  // Device accuracy issues (very low GPS accuracy might indicate spoofing)
  if (checkInData.location && checkInData.location.accuracy) {
    const accuracy = parseFloat(checkInData.location.accuracy);
    if (accuracy > 100) { // More than 100m accuracy
      anomalies.push(`Low GPS accuracy: ${Math.round(accuracy)}m`);
      riskScore += 0.05;
    }
    if (accuracy > 500) { // Very high accuracy error
      anomalies.push(`Very low GPS accuracy: ${Math.round(accuracy)}m`);
      riskScore += 0.15;
    }
  }

  return {
    anomalies,
    riskScore: Math.min(1.0, riskScore)
  };
}

/**
 * Calculate overall risk score for a check-in
 * @param {Object} checkInData - { guardId, shiftId, location: {lat, lng, accuracy}, device: {id, type, os, ip}, timestamp }
 * @param {Object} historicalData - { timeEntries: Array, patterns: Object }
 * @param {Object} models - Sequelize models
 * @returns {Promise<Object>} { riskScore: number (0.0-1.0), factors: Object, shouldFlag: boolean }
 */
async function calculateRiskScore(checkInData, historicalData = {}, models = {}) {
  const { TimeEntry } = models;
  let riskScore = 0;
  const factors = {};

  // Get historical time entries if not provided
  let timeEntries = historicalData.timeEntries || [];
  
  if (!timeEntries.length && checkInData.guardId && TimeEntry) {
    try {
      timeEntries = await TimeEntry.findAll({
        where: {
          guard_id: checkInData.guardId,
          clock_in_at: { [Op.not]: null }
        },
        order: [['clock_in_at', 'DESC']],
        limit: 30,
        attributes: ['device_id', 'device_type', 'device_os', 'ip_address', 'clock_in_lat', 'clock_in_lng', 'clock_in_accuracy_m', 'clock_in_at']
      });
    } catch (error) {
      console.error('❌ Error fetching historical time entries:', error);
    }
  }

  // 1. Device fingerprint analysis (40% weight)
  if (checkInData.device) {
    const deviceAnalysis = analyzeDeviceFingerprint(
      checkInData.device.id,
      checkInData.device.type,
      checkInData.device.os,
      checkInData.device.ip,
      timeEntries
    );
    riskScore += deviceAnalysis.score * 0.40;
    factors.deviceFingerprint = {
      score: deviceAnalysis.score,
      riskFactors: deviceAnalysis.riskFactors,
      consistent: deviceAnalysis.consistent
    };
  }

  // 2. Location pattern analysis (35% weight)
  if (checkInData.location) {
    const locationAnalysis = analyzeLocationPatterns(
      checkInData.guardId,
      checkInData.location,
      timeEntries
    );
    riskScore += locationAnalysis.score * 0.35;
    factors.locationPattern = {
      score: locationAnalysis.score,
      riskFactors: locationAnalysis.riskFactors,
      suspicious: locationAnalysis.suspicious
    };
  }

  // 3. Anomaly detection (25% weight)
  const anomalyAnalysis = detectAnomalies(
    checkInData.guardId,
    checkInData,
    historicalData.patterns || {}
  );
  riskScore += anomalyAnalysis.riskScore * 0.25;
  factors.anomalies = {
    score: anomalyAnalysis.riskScore,
    anomalies: anomalyAnalysis.anomalies
  };

  // Normalize final score to 0.0-1.0
  const finalRiskScore = Math.min(1.0, Math.max(0.0, riskScore));

  return {
    riskScore: Math.round(finalRiskScore * 100) / 100, // Round to 2 decimals
    factors,
    shouldFlag: finalRiskScore > 0.7, // Flag if risk > 70%
    timestamp: checkInData.timestamp || new Date()
  };
}

module.exports = {
  analyzeDeviceFingerprint,
  analyzeLocationPatterns,
  detectAnomalies,
  calculateRiskScore
};
