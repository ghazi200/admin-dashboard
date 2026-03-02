const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const Tenant = sequelize.define('Tenant', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  name: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  payroll_mode: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: 'PAYSTUB_UPLOAD'
  },
  ai_payroll_enabled: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true
  },
  created_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  }
}, {
  tableName: 'tenants',
  timestamps: false
});

module.exports = Tenant;
