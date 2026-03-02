/**
 * Test script to trigger HIGH_RISK_SHIFT notification
 * 
 * This script:
 * 1. Finds an upcoming shift
 * 2. Calculates its callout risk
 * 3. If it's HIGH_RISK, triggers notification creation
 * 4. Verifies the notification was created
 */

require('dotenv').config();
const { sequelize } = require('../models');
const calloutRiskService = require('../services/calloutRiskPrediction.service');
const { notify } = require('../utils/notify');

// Mock app object for notify function
const mockApp = {
  locals: {
    models: require('../models'),
    io: {
      to: (room) => ({
        emit: (event, data) => {
          console.log(`📤 Would emit ${event} to ${room}:`, data?.title || data?.type);
        }
      })
    }
  }
};

async function testHighRiskShiftNotification() {
  try {
    await sequelize.authenticate();
    console.log('✅ Connected to database\n');

    const models = require('../models');
    const { Notification } = models;

    // Step 1: Find an upcoming shift with a guard assigned
    console.log('📋 Step 1: Finding upcoming shift with guard...');
    const [upcomingShifts] = await sequelize.query(`
      SELECT 
        s.id,
        s.guard_id,
        s.shift_date,
        s.shift_start,
        s.shift_end,
        s.location,
        s.tenant_id,
        s.status,
        g.name as guard_name,
        g.email as guard_email
      FROM shifts s
      LEFT JOIN guards g ON g.id = s.guard_id
      WHERE s.shift_date >= CURRENT_DATE
        AND s.status IN ('OPEN', 'CLOSED')
        AND s.guard_id IS NOT NULL
      ORDER BY s.shift_date ASC
      LIMIT 5
    `);

    if (upcomingShifts.length === 0) {
      console.error('❌ No upcoming shifts with guards found.');
      console.log('💡 Please create a shift with a guard assigned first.');
      return;
    }

    console.log(`✅ Found ${upcomingShifts.length} upcoming shift(s)\n`);

    // Step 2: Calculate risk for each shift and find HIGH_RISK ones
    console.log('🔍 Step 2: Calculating callout risks...\n');
    
    let highRiskShift = null;
    let highRiskData = null;

    for (const shift of upcomingShifts) {
      try {
        console.log(`   Calculating risk for shift ${shift.id}...`);
        console.log(`   Guard: ${shift.guard_name || shift.guard_email}`);
        console.log(`   Date: ${shift.shift_date}, Time: ${shift.shift_start} - ${shift.shift_end}`);
        console.log(`   Location: ${shift.location || 'N/A'}\n`);

        const risk = await calloutRiskService.calculateCalloutRisk(shift, models);
        
        console.log(`   Risk Score: ${Math.round(risk.score)}%`);
        console.log(`   Recommendation: ${risk.recommendation}`);
        console.log(`   External Risk: ${risk.externalRiskData?.riskLevel || 'N/A'}\n`);

        if (risk.recommendation === 'HIGH_RISK') {
          highRiskShift = shift;
          highRiskData = risk;
          console.log(`   ✅ Found HIGH_RISK shift!\n`);
          break;
        }
      } catch (err) {
        console.warn(`   ⚠️ Failed to calculate risk for shift ${shift.id}:`, err.message);
        console.log('');
      }
    }

    if (!highRiskShift) {
      console.log('⚠️ No HIGH_RISK shifts found in the upcoming shifts.');
      console.log('💡 This is normal if:');
      console.log('   - Guards have low callout history');
      console.log('   - No severe weather/transit issues');
      console.log('   - Shifts are on low-risk days\n');
      
      // Try to create a test notification anyway for demonstration
      console.log('📢 Step 3: Creating test notification anyway...\n');
      const testShift = upcomingShifts[0];
      const guardName = testShift.guard_name || testShift.guard_email || 'Test Guard';
      const location = testShift.location || 'Test Location';
      const shiftDate = new Date(testShift.shift_date).toLocaleDateString();
      const shiftTime = `${testShift.shift_start} - ${testShift.shift_end}`;

      await notify(mockApp, {
        type: 'HIGH_RISK_SHIFT',
        title: `🚨 High-Risk Shift Alert (Test)`,
        message: `${guardName} has a HIGH-RISK shift on ${shiftDate} at ${shiftTime} (${location}). Risk factors: Test notification.`,
        entityType: 'shift',
        entityId: null,
        audience: 'all',
        meta: {
          shiftId: testShift.id,
          guardId: testShift.guard_id,
          guardName: guardName,
          shiftDate: testShift.shift_date,
          shiftTime: shiftTime,
          location: location,
          riskScore: 85,
          riskFactors: { test: true },
          backupSuggestions: []
        }
      });

      console.log('✅ Test notification created!\n');
    } else {
      // Step 3: Create notification for HIGH_RISK shift
      console.log('📢 Step 3: Creating HIGH_RISK_SHIFT notification...\n');
      
      const guardName = highRiskShift.guard_name || highRiskShift.guard_email || 'Unknown Guard';
      const location = highRiskShift.location || 'Unknown Location';
      const shiftDate = new Date(highRiskShift.shift_date).toLocaleDateString();
      const shiftTime = `${highRiskShift.shift_start} - ${highRiskShift.shift_end}`;
      
      // Build risk factors summary
      const riskFactors = highRiskData.factors || {};
      const factorDetails = [];
      if (riskFactors.externalFactors > 0) {
        const externalRisk = highRiskData.externalRiskData;
        if (externalRisk?.riskLevel === 'HIGH') {
          factorDetails.push(`Severe weather/transit issues: ${externalRisk.summary || 'High external risk'}`);
        }
      }
      if (riskFactors.calloutFrequency > 0) {
        factorDetails.push(`${Math.round(riskFactors.calloutFrequency / 15)} callout(s) in last 30 days`);
      }
      if (riskFactors.recentAvailabilityChanges > 0) {
        factorDetails.push('Recent availability changes');
      }

      const riskSummary = factorDetails.length > 0 
        ? `Risk factors: ${factorDetails.join('; ')}`
        : `Risk score: ${Math.round(highRiskData.score)}%`;

      await notify(mockApp, {
        type: 'HIGH_RISK_SHIFT',
        title: `🚨 High-Risk Shift Alert`,
        message: `${guardName} has a HIGH-RISK shift on ${shiftDate} at ${shiftTime} (${location}). ${riskSummary}`,
        entityType: 'shift',
        entityId: null,
        audience: 'all',
        meta: {
          shiftId: highRiskShift.id,
          guardId: highRiskShift.guard_id,
          guardName: guardName,
          shiftDate: highRiskShift.shift_date,
          shiftTime: shiftTime,
          location: location,
          riskScore: Math.round(highRiskData.score),
          riskFactors: riskFactors,
          externalRiskData: highRiskData.externalRiskData || null,
          backupSuggestions: []
        }
      });

      console.log('✅ HIGH_RISK_SHIFT notification created!\n');
    }

    // Step 4: Verify notification was created
    console.log('🔍 Step 4: Verifying notification...\n');
    
    // Use Sequelize model to query (handles column name mapping)
    const recentNotifications = await Notification.findAll({
      where: {
        type: 'HIGH_RISK_SHIFT'
      },
      order: [['createdAt', 'DESC']],
      limit: 1,
      raw: false
    });

    if (recentNotifications.length > 0) {
      const notification = recentNotifications[0];
      const meta = notification.meta || {};
      console.log('✅ Notification found in database:');
      console.log(`   ID: ${notification.id}`);
      console.log(`   Type: ${notification.type}`);
      console.log(`   Title: ${notification.title}`);
      console.log(`   Message: ${notification.message.substring(0, 80)}...`);
      console.log(`   Priority: ${notification.priority || 'N/A'}`);
      console.log(`   Category: ${notification.category || 'N/A'}`);
      console.log(`   Urgency: ${notification.urgency || 'N/A'}`);
      console.log(`   Shift ID: ${meta.shiftId || 'N/A'}`);
      console.log(`   Created: ${notification.createdAt ? new Date(notification.createdAt).toLocaleString() : 'N/A'}\n`);
      
      console.log('✅ Test completed successfully!');
      console.log('💡 Check the notification bell (🔔) in the admin dashboard to see the notification.\n');
    } else {
      console.log('⚠️ Notification not found in database.');
      console.log('💡 This might be a timing issue. Check the notifications table manually.\n');
    }

  } catch (error) {
    console.error('❌ Test failed:', error);
    console.error(error.stack);
  } finally {
    await sequelize.close();
  }
}

// Run the test
testHighRiskShiftNotification();
