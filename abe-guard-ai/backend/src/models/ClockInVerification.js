/**
 * ClockInVerification Model
 * 
 * Stores verification records for clock-in events, tracking geofence validation,
 * AI spoofing detection results, and admin review status.
 */

const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/db");
const Tenant = require("./Tenant");
const Guard = require("./Guard");
const Shift = require("./Shift");
const TimeEntry = require("./TimeEntry");

const ClockInVerification = sequelize.define(
  "ClockInVerification",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      allowNull: false
    },

    time_entry_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: TimeEntry, key: "id" },
      comment: "Reference to the time entry being verified"
    },

    tenant_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: Tenant, key: "id" },
      comment: "Tenant for multi-tenant isolation"
    },

    guard_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: Guard, key: "id" },
      comment: "Guard who clocked in"
    },

    shift_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: Shift, key: "id" },
      comment: "Shift associated with this clock-in"
    },

    verification_type: {
      type: DataTypes.STRING,
      allowNull: false,
      comment: "Type of verification: geofence, ai_analysis, etc."
    },

    verification_result: {
      type: DataTypes.STRING,
      allowNull: false,
      comment: "Result: passed, failed, flagged"
    },

    verification_data: {
      type: DataTypes.JSONB,
      allowNull: true,
      comment: "JSON object storing details like distance, risk score, device info, etc."
    },

    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    }
  },
  {
    tableName: "clock_in_verifications",
    timestamps: false
  }
);

// Associations
ClockInVerification.belongsTo(Tenant, { foreignKey: "tenant_id" });
ClockInVerification.belongsTo(Guard, { foreignKey: "guard_id" });
ClockInVerification.belongsTo(Shift, { foreignKey: "shift_id" });
ClockInVerification.belongsTo(TimeEntry, { foreignKey: "time_entry_id" });

module.exports = ClockInVerification;
