/**
 * Report Scheduler Cron Job
 * 
 * This script should be run periodically (e.g., every hour) to check for
 * scheduled reports that are due to run and process them.
 * 
 * Usage:
 * - Add to cron: `0 * * * * node backend/src/scripts/reportSchedulerCron.js`
 * - Or run manually: `node backend/src/scripts/reportSchedulerCron.js`
 * - Or integrate into your main server process
 */

require("dotenv").config();
const reportSchedulerService = require("../services/reportScheduler.service");
const models = require("../models");

async function runScheduler() {
  try {
    console.log("🕐 Starting report scheduler cron job...");
    const result = await reportSchedulerService.processScheduledReports(models);
    console.log(`✅ Report scheduler completed. Processed ${result.processed} reports.`);
    process.exit(0);
  } catch (error) {
    console.error("❌ Report scheduler error:", error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  runScheduler();
}

module.exports = runScheduler;
