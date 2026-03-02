const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');
const Tenant = require('./Tenant');
const Guard = require('./Guard');

const Shift = sequelize.define('Shift', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  tenant_id: {
    type: DataTypes.UUID,
    references: { model: Tenant, key: 'id' }
  },
  guard_id: {
    type: DataTypes.UUID,
    references: { model: Guard, key: 'id' },
    allowNull: true
  },
  shift_date: { type: DataTypes.DATEONLY, allowNull: false },
  shift_start: { type: DataTypes.TIME, allowNull: false },
  shift_end: { type: DataTypes.TIME, allowNull: false },
  status: { 
    type: DataTypes.ENUM('SCHEDULED', 'OPEN', 'CLOSED'), 
    defaultValue: 'OPEN' 
  },
  ai_decision: {
    type: DataTypes.JSONB,
    allowNull: true,
    defaultValue: null
  },
  location_lat: {
    type: DataTypes.DOUBLE,
    allowNull: true,
    comment: 'Latitude of shift location for geofencing'
  },
  location_lng: {
    type: DataTypes.DOUBLE,
    allowNull: true,
    comment: 'Longitude of shift location for geofencing'
  },
  geofence_radius_m: {
    type: DataTypes.INTEGER,
    allowNull: true,
    defaultValue: 100,
    comment: 'Geofence radius in meters (default: 100m)'
  },
  site_id: {
    type: DataTypes.UUID,
    allowNull: true,
    comment: 'Reference to site/building location'
  },
  created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, {
  tableName: 'shifts',
  timestamps: false
});

Shift.belongsTo(Tenant, { foreignKey: 'tenant_id' });
Shift.belongsTo(Guard, { foreignKey: 'guard_id' });
// Site association is set up in models/index.js to avoid circular dependency

module.exports = Shift;
