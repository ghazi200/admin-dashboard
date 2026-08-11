/**
 * Guard confirms they have seen the weekly schedule (Mon–Sun period).
 */
module.exports = (sequelize, DataTypes) => {
  const ScheduleAcknowledgment = sequelize.define(
    "ScheduleAcknowledgment",
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
        allowNull: false,
      },
      tenant_id: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      guard_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      period_start: {
        type: DataTypes.DATEONLY,
        allowNull: false,
      },
      period_end: {
        type: DataTypes.DATEONLY,
        allowNull: false,
      },
      note: {
        type: DataTypes.STRING(500),
        allowNull: true,
      },
      acknowledged_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
    },
    {
      tableName: "schedule_acknowledgments",
      freezeTableName: true,
      underscored: true,
      timestamps: true,
      createdAt: "created_at",
      updatedAt: "updated_at",
      indexes: [
        { unique: true, fields: ["guard_id", "period_start", "period_end"] },
        { fields: ["tenant_id", "period_start"] },
      ],
    }
  );
  return ScheduleAcknowledgment;
};
