// backend/src/models/EmergencyEvent.js
const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/db");

const EmergencyEvent = sequelize.define(
  "EmergencyEvent",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
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
  },
  {
    tableName: "emergency_events",
    timestamps: false,
  }
);

module.exports = EmergencyEvent;
