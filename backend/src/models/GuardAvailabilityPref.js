// backend/src/models/GuardAvailabilityPref.js
module.exports = (sequelize, DataTypes) => {
  const GuardAvailabilityPref = sequelize.define(
    "GuardAvailabilityPref",
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
      },
      guard_id: {
        type: DataTypes.UUID,
        allowNull: false,
        unique: true,
      },
      preferred_days: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: [],
      },
      preferred_times: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: [],
      },
      blocked_dates: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: [],
      },
      min_hours_per_week: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      max_hours_per_week: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 40,
      },
      location_preferences: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: [],
      },
      tenant_id: {
        type: DataTypes.UUID,
        allowNull: true,
      },
    },
    {
      tableName: "guard_availability_prefs",
      freezeTableName: true,
      underscored: true,
      timestamps: true,
      createdAt: "created_at",
      updatedAt: "updated_at",
    }
  );

  return GuardAvailabilityPref;
};
