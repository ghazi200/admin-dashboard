/** ContactPreference model for tests only. Production table is created by raw SQL in server.js (no FK). */
module.exports = (sequelize, DataTypes) => {
  const ContactPreference = sequelize.define('ContactPreference', {
    guardId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    contactType: {
      type: DataTypes.STRING(32),
      allowNull: false,
      validate: { isIn: [['SMS', 'Email', 'Phone']] },
    },
    active: { type: DataTypes.BOOLEAN, defaultValue: true }
  }, {
    tableName: 'ContactPreferences',
    underscored: false,
    indexes: [
      { fields: ['guardId'] },
    ],
  });
  return ContactPreference;
};
