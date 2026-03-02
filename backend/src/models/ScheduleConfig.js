/**
 * ScheduleConfig Model
 * Stores editable schedule templates and building information
 */

module.exports = (sequelize, DataTypes) => {
  const ScheduleConfig = sequelize.define(
    "ScheduleConfig",
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
      buildingId: {
        type: DataTypes.STRING(50),
        field: "building_id",
        defaultValue: "BLD-001",
      },
      buildingName: {
        type: DataTypes.STRING(255),
        field: "building_name",
        defaultValue: "Main Office Building",
      },
      buildingLocation: {
        type: DataTypes.TEXT,
        field: "building_location",
        defaultValue: "123 Main Street, City, State 12345",
      },
      scheduleTemplate: {
        type: DataTypes.JSONB,
        field: "schedule_template",
        defaultValue: [],
      },
    },
    {
      tableName: "schedule_config",
      timestamps: true,
      underscored: true,
    }
  );

  return ScheduleConfig;
};
