// backend/src/models/ShiftTimeEntry.js
const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/db");

const ShiftTimeEntry = sequelize.define(
  "ShiftTimeEntry",
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },

    shift_id: { type: DataTypes.UUID, allowNull: false },
    guard_id: { type: DataTypes.UUID, allowNull: false },

    event_type: { type: DataTypes.TEXT, allowNull: false },
    event_time: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },

    source: { type: DataTypes.TEXT, defaultValue: "MOBILE" },
    device_tz: { type: DataTypes.TEXT },

    lat: { type: DataTypes.DECIMAL },
    lng: { type: DataTypes.DECIMAL },
    accuracy_m: { type: DataTypes.DECIMAL },
    location_method: { type: DataTypes.TEXT },

    location_verified: { type: DataTypes.BOOLEAN, defaultValue: null },
    distance_m: { type: DataTypes.DECIMAL, defaultValue: null },

    ip_address: { type: DataTypes.TEXT },
    user_agent: { type: DataTypes.TEXT },

    meta: { type: DataTypes.JSONB, defaultValue: {} },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  { tableName: "shift_time_entries", timestamps: false }
);

module.exports = ShiftTimeEntry;
