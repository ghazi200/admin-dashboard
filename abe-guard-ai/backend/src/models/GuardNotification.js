/**
 * GuardNotification Model
 * 
 * Stores notifications for guards (shift changes, assignments, cancellations, etc.)
 */
const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');
const Guard = require('./Guard');
const Shift = require('./Shift');

const GuardNotification = sequelize.define(
  "GuardNotification",
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
      allowNull: false,
    },
    guard_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: Guard,
        key: "id",
      },
    },
    type: {
      type: DataTypes.STRING,
      allowNull: false,
      // Types: SHIFT_ASSIGNED, SHIFT_CANCELLED, SHIFT_TIME_CHANGED, SHIFT_LOCATION_CHANGED, SHIFT_DATE_CHANGED
    },
    title: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    message: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    shift_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: Shift,
        key: "id",
      },
    },
    read_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    meta: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {},
    },
  },
  {
    tableName: "guard_notifications",
    freezeTableName: true,
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
    underscored: true,
    indexes: [
      { fields: ["guard_id"] },
      { fields: ["shift_id"] },
      { fields: ["read_at"] },
      { fields: ["created_at"] },
    ],
  }
);

module.exports = GuardNotification;
