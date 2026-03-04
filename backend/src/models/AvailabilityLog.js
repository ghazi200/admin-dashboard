// backend/src/models/AvailabilityLog.js
module.exports = (sequelize, DataTypes) => {
  const AvailabilityLog = sequelize.define(
    "AvailabilityLog",
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },

      guardId: {
        type: DataTypes.UUID,
        allowNull: false,
      },

      // previous value (optional)
      from: {
        type: DataTypes.BOOLEAN,
        allowNull: true,
      },

      // new value
      to: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
      },

      // admin that changed it (optional)
      actorAdminId: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },

      note: {
        type: DataTypes.STRING,
        allowNull: true,
      },
    },
    {
      tableName: "availability_logs",
      timestamps: true,
    }
  );

  return AvailabilityLog;
};
