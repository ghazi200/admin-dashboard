// backend/src/models/ShiftSwap.js
module.exports = (sequelize, DataTypes) => {
  const ShiftSwap = sequelize.define(
    "ShiftSwap",
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
      },
      shift_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      requester_guard_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      target_guard_id: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      target_shift_id: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      status: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: "pending",
        validate: {
          isIn: [["pending", "approved", "rejected", "cancelled"]],
        },
      },
      reason: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      admin_notes: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      approved_by: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      tenant_id: {
        type: DataTypes.UUID,
        allowNull: true,
      },
    },
    {
      tableName: "shift_swaps",
      freezeTableName: true,
      underscored: true,
      timestamps: true,
      createdAt: "created_at",
      updatedAt: "updated_at",
    }
  );

  return ShiftSwap;
};
