/**
 * InspectionRequest Model
 * 
 * Stores inspection requests created by supervisors/admins,
 * with challenge codes, required items, and deadline tracking.
 */

const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/db");
const Tenant = require("./Tenant");
const Site = require("./Site");
const Shift = require("./Shift");
const Guard = require("./Guard");
const Admin = require("./Admin");

const InspectionRequest = sequelize.define(
  "InspectionRequest",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },

    tenant_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: Tenant, key: "id" },
    },

    site_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: Site, key: "id" },
    },

    shift_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: Shift, key: "id" },
    },

    guard_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: Guard, key: "id" },
      comment: "NULL = broadcast to all guards on site",
    },

    requested_by_admin_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: Admin, key: "id" },
    },

    challenge_code: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      comment: "Unique challenge code (e.g., 'ABE-4921')",
    },

    instructions: {
      type: DataTypes.TEXT,
      allowNull: true,
    },

    required_items_json: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {},
      comment: "{ selfie: true, badge: true, signage: false }",
    },

    due_at: {
      type: DataTypes.DATE,
      allowNull: false,
    },

    status: {
      type: DataTypes.ENUM(
        "PENDING",
        "SUBMITTED",
        "APPROVED",
        "REJECTED",
        "EXPIRED"
      ),
      allowNull: false,
      defaultValue: "PENDING",
    },
  },
  {
    tableName: "inspection_requests",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
  }
);

// Associations are defined in models/index.js

module.exports = InspectionRequest;
