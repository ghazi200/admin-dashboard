const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');
const Tenant = require('./Tenant');

/**
 * Maps to public."Admins" (admin-dashboard schema): integer PK, password column, camelCase timestamps.
 */
const Admin = sequelize.define('Admin', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  tenant_id: {
    type: DataTypes.UUID,
    allowNull: true,
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  email: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
  },
  password_hash: {
    type: DataTypes.STRING,
    allowNull: false,
    field: 'password',
  },
  role: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: 'admin',
  },
  created_at: {
    type: DataTypes.DATE,
    field: 'createdAt',
  },
}, {
  tableName: 'Admins',
  freezeTableName: true,
  timestamps: false,
});

Admin.belongsTo(Tenant, { foreignKey: 'tenant_id' });

module.exports = Admin;
