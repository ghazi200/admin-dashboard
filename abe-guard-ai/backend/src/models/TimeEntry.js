// backend/src/models/TimeEntry.js
const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/db");

const TimeEntry = sequelize.define(
  "TimeEntry",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },

    tenant_id: {
      type: DataTypes.UUID,
      allowNull: true,
    },

    shift_id: {
      type: DataTypes.UUID,
      allowNull: false,
    },

    guard_id: {
      type: DataTypes.UUID,
      allowNull: false,
    },

    clock_in_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },

    clock_out_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },

    lunch_start_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },

    lunch_end_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },

    clock_in_lat: DataTypes.DOUBLE,
    clock_in_lng: DataTypes.DOUBLE,
    clock_in_accuracy_m: DataTypes.DOUBLE,

    clock_out_lat: DataTypes.DOUBLE,
    clock_out_lng: DataTypes.DOUBLE,
    clock_out_accuracy_m: DataTypes.DOUBLE,

    device_type: DataTypes.TEXT,
    device_os: DataTypes.TEXT,
    device_id: DataTypes.TEXT,
    ip_address: DataTypes.TEXT,

    spoofing_risk_score: {
      type: DataTypes.DECIMAL(3, 2),
      allowNull: true,
      comment: 'AI-calculated spoofing risk score (0.00 = safe, 1.00 = high risk)',
      validate: {
        min: 0.00,
        max: 1.00
      }
    },
    verification_notes: {
      type: DataTypes.JSONB,
      allowNull: true,
      comment: 'JSON object storing verification details, risk factors, and analysis results'
    },

    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    tableName: "time_entries",
    timestamps: false,
  }
);

module.exports = TimeEntry;
