module.exports = (sequelize, DataTypes) => {
  const ContactPreference = sequelize.define('ContactPreference', {
    guardId: { type: DataTypes.INTEGER, allowNull: false },
    contactType: { type: DataTypes.ENUM('SMS', 'Email', 'Phone'), allowNull: false },
    active: { type: DataTypes.BOOLEAN, defaultValue: true }
  });
  return ContactPreference;
};
