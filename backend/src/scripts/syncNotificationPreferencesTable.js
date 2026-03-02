/**
 * Sync Notification Preferences Table
 * 
 * Creates the notification_preferences table if it doesn't exist
 */

require("dotenv").config();
const models = require("../models");

async function syncTable() {
  try {
    console.log("🔄 Syncing notification_preferences table...");
    
    const { NotificationPreference, sequelize } = models;
    
    // Sync the table (creates if doesn't exist, doesn't drop if exists)
    await NotificationPreference.sync({ force: false, alter: false });
    
    console.log("✅ notification_preferences table synced successfully");
    
    await sequelize.close();
    process.exit(0);
  } catch (error) {
    console.error("❌ Error syncing notification_preferences table:", error);
    process.exit(1);
  }
}

syncTable();
