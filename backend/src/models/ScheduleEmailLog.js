module.exports = (sequelize, DataTypes) => {
  const ScheduleEmailLog = sequelize.define(
    "ScheduleEmailLog",
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
      email_sent_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
      schedule_period_start: {
        type: DataTypes.DATEONLY,
        allowNull: false,
      },
      schedule_period_end: {
        type: DataTypes.DATEONLY,
        allowNull: false,
      },
      shifts_count: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      email_status: {
        type: DataTypes.ENUM("sent", "failed", "pending"),
        allowNull: false,
        defaultValue: "sent",
      },
      error_message: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      email_subject: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      email_to: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
    },
    {
      tableName: "schedule_email_logs",
      freezeTableName: true,
      timestamps: false,
      underscored: true,
    }
  );

  return ScheduleEmailLog;
};
