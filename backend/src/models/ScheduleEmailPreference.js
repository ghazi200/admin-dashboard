module.exports = (sequelize, DataTypes) => {
  const ScheduleEmailPreference = sequelize.define(
    "ScheduleEmailPreference",
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
        allowNull: false,
      },
      guard_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: "guards",
          key: "id",
        },
      },
      tenant_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: "tenants",
          key: "id",
        },
      },
      frequency: {
        type: DataTypes.ENUM("weekly", "bi-weekly", "monthly", "never"),
        allowNull: false,
        defaultValue: "weekly",
      },
      day_of_week: {
        type: DataTypes.INTEGER,
        allowNull: true,
        validate: {
          min: 0,
          max: 6,
        },
      },
      day_of_month: {
        type: DataTypes.INTEGER,
        allowNull: true,
        validate: {
          min: 1,
          max: 28,
        },
      },
      preferred_time: {
        type: DataTypes.TIME,
        allowNull: true,
        defaultValue: "09:00:00",
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      last_sent_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
      updated_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
    },
    {
      tableName: "schedule_email_preferences",
      freezeTableName: true,
      timestamps: false,
      underscored: true,
    }
  );

  return ScheduleEmailPreference;
};
