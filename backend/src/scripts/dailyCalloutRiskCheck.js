/**
 * Daily Callout Risk Check Script
 * 
 * Runs daily to:
 * 1. Calculate risks for upcoming shifts (next 7 days)
 * 2. Send early warning notifications for high-risk shifts
 * 3. Generate daily risk report
 * 
 * Run via cron: 0 8 * * * (8 AM daily)
 * Or manually: node src/scripts/dailyCalloutRiskCheck.js
 */

require('dotenv').config();
const { sequelize } = require('../models');
const calloutRiskService = require('../services/calloutRiskPrediction.service');
const { notify } = require('../utils/notify');

// Mock app object for notify function
const mockApp = {
  locals: {
    models: { sequelize },
    io: null // No socket in batch job
  }
};

async function dailyRiskCheck() {
  try {
    await sequelize.authenticate();
    console.log('✅ Connected to database\n');

    console.log('📊 Starting daily callout risk check...\n');

    // Calculate risks for upcoming shifts (next 7 days)
    const risks = await calloutRiskService.batchCalculateRisks(
      { sequelize },
      7 // Next 7 days
    );

    console.log(`📈 Analyzed ${risks.length} upcoming shifts\n`);

    // Filter high-risk shifts (score >= 70)
    const highRiskShifts = risks.filter(item => item.risk.score >= 70);
    const mediumRiskShifts = risks.filter(item => 
      item.risk.score >= 40 && item.risk.score < 70
    );

    console.log(`⚠️  High-risk shifts (score >= 70): ${highRiskShifts.length}`);
    console.log(`⚡ Medium-risk shifts (score 40-69): ${mediumRiskShifts.length}`);
    console.log(`✅ Low-risk shifts (score < 40): ${risks.length - highRiskShifts.length - mediumRiskShifts.length}\n`);

    // Send notifications for high-risk shifts
    let notificationsSent = 0;
    for (const item of highRiskShifts) {
      try {
        // Get backup suggestions
        const backupSuggestions = await calloutRiskService.getBackupSuggestions(
          item.shift,
          { sequelize },
          3
        );

        // Create notification
        await notify(mockApp, {
          type: "CALLOUT_RISK_HIGH",
          title: "⚠️ High Callout Risk - Early Warning",
          message: item.risk.message,
          entityType: "shift",
          entityId: null,
          audience: "all",
          meta: {
            shiftId: item.shift.id,
            guardId: item.shift.guard_id,
            guardName: item.risk.guardName,
            riskScore: item.risk.score,
            shiftDate: item.shift.shift_date,
            shiftTime: `${item.shift.shift_start} - ${item.shift.shift_end}`,
            location: item.shift.location,
            factors: item.risk.factors,
            backupSuggestions: backupSuggestions.map(b => ({
              guardId: b.guardId,
              guardName: b.guardName,
              matchQuality: b.matchQuality
            }))
          },
        });

        notificationsSent++;
        console.log(`📤 Sent notification for high-risk shift: ${item.shift.id.substring(0, 8)}... (${item.risk.score}% risk)`);
      } catch (err) {
        console.error(`❌ Failed to send notification for shift ${item.shift.id}:`, err.message);
      }
    }

    // Summary
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 DAILY RISK CHECK SUMMARY');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`Total shifts analyzed: ${risks.length}`);
    console.log(`High-risk shifts: ${highRiskShifts.length}`);
    console.log(`Medium-risk shifts: ${mediumRiskShifts.length}`);
    console.log(`Notifications sent: ${notificationsSent}`);
    
    if (highRiskShifts.length > 0) {
      console.log('\n⚠️  HIGH-RISK SHIFTS:');
      highRiskShifts.slice(0, 5).forEach(item => {
        console.log(`   • ${item.risk.guardName} - ${item.shift.shift_date} ${item.shift.shift_start} (${item.risk.score}% risk)`);
      });
      if (highRiskShifts.length > 5) {
        console.log(`   ... and ${highRiskShifts.length - 5} more`);
      }
    }
    
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    await sequelize.close();
    process.exit(0);
  } catch (err) {
    console.error('❌ Daily risk check failed:', err.message);
    console.error(err.stack);
    await sequelize.close();
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  dailyRiskCheck();
}

module.exports = dailyRiskCheck;
