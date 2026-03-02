// backend/src/models/AIDecision.js
const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/db");

const AIDecision = sequelize.define(
  "AIDecision",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    shift_id: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    decision_json: {
      type: DataTypes.JSONB,
      allowNull: false,
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    tableName: "ai_decisions",
    timestamps: false,
  }
);

module.exports = AIDecision;
