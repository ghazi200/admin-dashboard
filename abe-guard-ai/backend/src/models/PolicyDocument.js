// backend/src/models/PolicyDocument.js
const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/db");

const PolicyDocument = sequelize.define(
  "PolicyDocument",
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    tenant_id: { type: DataTypes.UUID, allowNull: false },
    site_id: { type: DataTypes.UUID, allowNull: true },

    title: { type: DataTypes.STRING(255), allowNull: false },
    category: { type: DataTypes.STRING(80), allowNull: true },

    visibility: {
      type: DataTypes.ENUM("guard", "supervisor", "admin", "all"),
      allowNull: false,
      defaultValue: "all",
    },

    file_name: { type: DataTypes.STRING(255), allowNull: true },
    file_mime: { type: DataTypes.STRING(100), allowNull: true },
    file_path: { type: DataTypes.STRING(500), allowNull: true },

    raw_text: { type: DataTypes.TEXT, allowNull: true },
    is_active: { type: DataTypes.BOOLEAN, defaultValue: true },

    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  {
    tableName: "policy_documents",
    timestamps: false,
  }
);

module.exports = PolicyDocument;
