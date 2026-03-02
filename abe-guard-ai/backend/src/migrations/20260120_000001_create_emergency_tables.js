/**
 * Migration: Create Emergency SOS Tables
 * 
 * Creates:
 * - emergency_events: Stores emergency SOS activations
 * - emergency_contacts: Stores guard's emergency contacts
 */

require("dotenv").config();
const { sequelize } = require("../config/db");
const { DataTypes } = require("sequelize");

async function up() {
  const queryInterface = sequelize.getQueryInterface();

  // Create emergency_events table
  await queryInterface.createTable("emergency_events", {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      allowNull: false,
    },
    guard_id: {
      type: DataTypes.UUID,
      allowNull: false,
      comment: "Guard who activated the emergency",
    },
    tenant_id: {
      type: DataTypes.UUID,
      allowNull: true,
      comment: "Tenant for multi-tenant isolation",
    },
    supervisor_id: {
      type: DataTypes.UUID,
      allowNull: true,
      comment: "On-call supervisor who was notified",
    },
    latitude: {
      type: DataTypes.DOUBLE,
      allowNull: true,
      comment: "Guard's GPS latitude at time of activation",
    },
    longitude: {
      type: DataTypes.DOUBLE,
      allowNull: true,
      comment: "Guard's GPS longitude at time of activation",
    },
    accuracy: {
      type: DataTypes.DOUBLE,
      allowNull: true,
      comment: "GPS accuracy in meters",
    },
    status: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "active",
      comment: "Status: active, resolved, cancelled",
    },
    resolved_at: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: "When the emergency was resolved",
    },
    resolved_by: {
      type: DataTypes.UUID,
      allowNull: true,
      comment: "Admin/supervisor who resolved the emergency",
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: "Additional notes about the emergency",
    },
    activated_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  });

  // Create emergency_contacts table
  await queryInterface.createTable("emergency_contacts", {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      allowNull: false,
    },
    guard_id: {
      type: DataTypes.UUID,
      allowNull: false,
      comment: "Guard who owns this contact",
    },
    tenant_id: {
      type: DataTypes.UUID,
      allowNull: true,
      comment: "Tenant for multi-tenant isolation",
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
      comment: "Contact name",
    },
    phone: {
      type: DataTypes.STRING,
      allowNull: false,
      comment: "Contact phone number",
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  });

  // Add indexes for better query performance
  await queryInterface.addIndex("emergency_events", ["guard_id"]);
  await queryInterface.addIndex("emergency_events", ["tenant_id"]);
  await queryInterface.addIndex("emergency_events", ["supervisor_id"]);
  await queryInterface.addIndex("emergency_events", ["status"]);
  await queryInterface.addIndex("emergency_events", ["activated_at"]);

  await queryInterface.addIndex("emergency_contacts", ["guard_id"]);
  await queryInterface.addIndex("emergency_contacts", ["tenant_id"]);

  console.log("✅ Created emergency_events and emergency_contacts tables");
}

async function down() {
  const queryInterface = sequelize.getQueryInterface();
  
  await queryInterface.dropTable("emergency_contacts");
  await queryInterface.dropTable("emergency_events");
  
  console.log("✅ Dropped emergency_events and emergency_contacts tables");
}

// Run migration
if (require.main === module) {
  (async () => {
    try {
      console.log("🔄 Running emergency tables migration...");
      await up();
      console.log("✅ Migration completed!");
      await sequelize.close();
      process.exit(0);
    } catch (error) {
      console.error("❌ Migration failed:", error);
      await sequelize.close();
      process.exit(1);
    }
  })();
}

module.exports = { up, down };
