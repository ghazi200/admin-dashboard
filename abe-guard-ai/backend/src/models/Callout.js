// backend/src/models/Callout.js
const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/db");
const Shift = require("./Shift");
const Guard = require("./Guard");

const Callout = sequelize.define(
  "Callout",
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
      allowNull: true,
      references: { model: Shift, key: "id" },
    },

    guard_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: Guard, key: "id" },
    },

    // DB enforces allowed values with a CHECK constraint
    reason: {
      type: DataTypes.TEXT,
      allowNull: true,
    },

    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    tableName: "callouts",
    timestamps: false,
  }
);

Callout.belongsTo(Shift, { foreignKey: "shift_id" });
Callout.belongsTo(Guard, { foreignKey: "guard_id" });

module.exports = Callout;
