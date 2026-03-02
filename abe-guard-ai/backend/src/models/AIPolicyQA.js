// backend/src/models/AIPolicyQA.js
const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/db");

const AIPolicyQA = sequelize.define(
  "AIPolicyQA",
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },

    tenant_id: { type: DataTypes.UUID, allowNull: false },
    site_id: { type: DataTypes.UUID, allowNull: true },
    shift_id: { type: DataTypes.UUID, allowNull: true },

    asked_by_user_id: { type: DataTypes.UUID, allowNull: false },
    asked_by_role: { type: DataTypes.STRING(30), allowNull: false },

    question: { type: DataTypes.TEXT, allowNull: false },
    answer: { type: DataTypes.TEXT, allowNull: false },

    sources_json: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },

    escalate_recommended: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    confidence: { type: DataTypes.FLOAT, allowNull: true },

    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  {
    tableName: "ai_policy_qas",
    timestamps: false,
  }
);

module.exports = AIPolicyQA;
