// backend/src/models/EmergencyContact.js
const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/db");

const EmergencyContact = sequelize.define(
  "EmergencyContact",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
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
  },
  {
    tableName: "emergency_contacts",
    timestamps: false,
  }
);

module.exports = EmergencyContact;
