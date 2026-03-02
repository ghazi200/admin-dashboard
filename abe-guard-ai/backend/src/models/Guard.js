const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');
const Tenant = require('./Tenant');

const Guard = sequelize.define('Guard', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  tenant_id: {
    type: DataTypes.UUID,
    references: {
      model: Tenant,
      key: 'id'
    }
  },
  acceptance_rate: {
  type: DataTypes.FLOAT,
  defaultValue: 0.85,
},
reliability_score: {
  type: DataTypes.FLOAT,
  defaultValue: 0.8,
},
  name: { type: DataTypes.TEXT, allowNull: false },
  phone: DataTypes.TEXT,
  email: DataTypes.TEXT,
  profile_photo_url: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'URL to guard profile photo (for AI identity verification in inspections)'
  },
  is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
  weekly_hours: { type: DataTypes.INTEGER, defaultValue: 0 },
  created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, {
  tableName: 'guards',
  timestamps: false
});

Guard.belongsTo(Tenant, { foreignKey: 'tenant_id' });

module.exports = Guard;
