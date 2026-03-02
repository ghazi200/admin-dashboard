/**
 * Add Smart Notification Columns to notifications table
 * 
 * Adds: priority, category, urgency, smartMetadata, aiInsights, quickActions
 */

require("dotenv").config();
const models = require("../models");

async function addColumns() {
  try {
    console.log("🔄 Adding smart notification columns to notifications table...");
    
    const { Notification, sequelize } = models;
    
    // Get the query interface
    const queryInterface = sequelize.getQueryInterface();
    
    // Check if columns exist and add them if they don't
    const tableName = Notification.tableName;
    
    try {
      // Add priority column
      await queryInterface.addColumn(tableName, "priority", {
        type: sequelize.Sequelize.ENUM("CRITICAL", "HIGH", "MEDIUM", "LOW"),
        allowNull: true,
        defaultValue: null,
      });
      console.log("✅ Added priority column");
    } catch (err) {
      if (err.message.includes("already exists") || err.message.includes("duplicate")) {
        console.log("⚠️ priority column already exists");
      } else {
        console.warn("⚠️ Could not add priority column:", err.message);
      }
    }
    
    try {
      // Add category column
      await queryInterface.addColumn(tableName, "category", {
        type: sequelize.Sequelize.ENUM("COVERAGE", "INCIDENT", "PERSONNEL", "COMPLIANCE", "AI_INSIGHTS", "REPORTS", "GENERAL"),
        allowNull: true,
        defaultValue: null,
      });
      console.log("✅ Added category column");
    } catch (err) {
      if (err.message.includes("already exists") || err.message.includes("duplicate")) {
        console.log("⚠️ category column already exists");
      } else {
        console.warn("⚠️ Could not add category column:", err.message);
      }
    }
    
    try {
      // Add urgency column
      await queryInterface.addColumn(tableName, "urgency", {
        type: sequelize.Sequelize.ENUM("URGENT", "NORMAL", "LOW"),
        allowNull: true,
        defaultValue: null,
      });
      console.log("✅ Added urgency column");
    } catch (err) {
      if (err.message.includes("already exists") || err.message.includes("duplicate")) {
        console.log("⚠️ urgency column already exists");
      } else {
        console.warn("⚠️ Could not add urgency column:", err.message);
      }
    }
    
    try {
      // Add smartMetadata column (JSON)
      await queryInterface.addColumn(tableName, "smartMetadata", {
        type: sequelize.Sequelize.JSON,
        allowNull: true,
        defaultValue: null,
      });
      console.log("✅ Added smartMetadata column");
    } catch (err) {
      if (err.message.includes("already exists") || err.message.includes("duplicate")) {
        console.log("⚠️ smartMetadata column already exists");
      } else {
        console.warn("⚠️ Could not add smartMetadata column:", err.message);
      }
    }
    
    try {
      // Add aiInsights column (JSON)
      await queryInterface.addColumn(tableName, "aiInsights", {
        type: sequelize.Sequelize.JSON,
        allowNull: true,
        defaultValue: null,
      });
      console.log("✅ Added aiInsights column");
    } catch (err) {
      if (err.message.includes("already exists") || err.message.includes("duplicate")) {
        console.log("⚠️ aiInsights column already exists");
      } else {
        console.warn("⚠️ Could not add aiInsights column:", err.message);
      }
    }
    
    try {
      // Add quickActions column (JSON)
      await queryInterface.addColumn(tableName, "quickActions", {
        type: sequelize.Sequelize.JSON,
        allowNull: true,
        defaultValue: null,
      });
      console.log("✅ Added quickActions column");
    } catch (err) {
      if (err.message.includes("already exists") || err.message.includes("duplicate")) {
        console.log("⚠️ quickActions column already exists");
      } else {
        console.warn("⚠️ Could not add quickActions column:", err.message);
      }
    }
    
    console.log("✅ All smart notification columns added successfully");
    
    await sequelize.close();
    process.exit(0);
  } catch (error) {
    console.error("❌ Error adding smart notification columns:", error);
    console.error("❌ Error stack:", error.stack);
    process.exit(1);
  }
}

addColumns();
