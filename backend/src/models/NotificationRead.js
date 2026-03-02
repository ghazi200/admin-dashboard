module.exports = (sequelize, DataTypes) => {
  const NotificationRead = sequelize.define(
    "NotificationRead",
    {
      adminId: { type: DataTypes.INTEGER, allowNull: false },
      notificationId: { type: DataTypes.INTEGER, allowNull: false },
      readAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    },
    { timestamps: false }
  );

  return NotificationRead;
};
