module.exports = (sequelize, DataTypes) => {
  const CallOut = sequelize.define('CallOut', {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      allowNull: false,
      defaultValue: DataTypes.UUIDV4,
    },
    tenant_id: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    shift_id: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    guard_id: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    reason: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  }, {
    tableName: 'callouts', // ✅ Use lowercase table name
    freezeTableName: true,
    timestamps: false, // Use created_at instead
    underscored: true,
  });
  return CallOut;
};
