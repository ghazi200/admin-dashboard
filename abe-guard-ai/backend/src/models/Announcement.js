const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/db");

const Announcement = sequelize.define(
  "Announcement",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    title: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    message: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    category: {
      type: DataTypes.ENUM(
        "COMPANY_WIDE",
        "SITE_SPECIFIC",
        "POLICY_UPDATE",
        "SHIFT_CHANGE",
        "EMERGENCY_ALERT",
        "TRAINING_NOTICE",
        "SYSTEM_UPDATE"
      ),
      allowNull: false,
      defaultValue: "COMPANY_WIDE",
    },
    priority: {
      type: DataTypes.ENUM("CRITICAL", "HIGH", "MEDIUM", "LOW"),
      allowNull: false,
      defaultValue: "MEDIUM",
    },
    // Targeting
    tenant_id: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    site_id: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    // Visibility
    is_active: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    expires_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    // Metadata
    created_by_admin_id: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    meta: {
      type: DataTypes.JSON,
      allowNull: true,
    },
  },
  {
    tableName: "announcements",
    underscored: true,
    timestamps: true,
  }
);

module.exports = Announcement;
