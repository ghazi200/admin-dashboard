/**
 * EmailSchedulerSettings Model
 * Stores configuration for automated email scheduling
 */

module.exports = (sequelize, DataTypes) => {
  const EmailSchedulerSettings = sequelize.define(
    "EmailSchedulerSettings",
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
      },
      tenantId: {
        type: DataTypes.UUID,
        field: "tenant_id",
        allowNull: true,
      },
      settingType: {
        type: DataTypes.STRING(50),
        field: "setting_type",
        allowNull: false,
      },
      enabled: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
      },
      intervalMinutes: {
        type: DataTypes.INTEGER,
        field: "interval_minutes",
        defaultValue: 60,
      },
      runTimes: {
        type: DataTypes.JSONB,
        field: "run_times",
        defaultValue: [],
      },
      timezone: {
        type: DataTypes.STRING(50),
        defaultValue: "America/New_York",
      },
    },
    {
      tableName: "email_scheduler_settings",
      timestamps: true,
      underscored: true,
    }
  );

  return EmailSchedulerSettings;
};
