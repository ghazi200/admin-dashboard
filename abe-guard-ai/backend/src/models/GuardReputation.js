/**
 * Guard Reputation Model
 * 
 * Stores reputation scores and comments from admins/supervisors
 * Used for guard ranking and premium shift assignment
 */

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');
const Tenant = require('./Tenant');
const Guard = require('./Guard');
const Admin = require('./Admin');
const Shift = require('./Shift');

const GuardReputation = sequelize.define('GuardReputation', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },

  tenant_id: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: Tenant,
      key: 'id',
    },
  },

  guard_id: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: Guard,
      key: 'id',
    },
  },

  // Trust score (aggregated from all reviews, 0.0 to 1.0)
  trust_score: {
    type: DataTypes.DECIMAL(3, 2),
    allowNull: false,
    defaultValue: 0.5,
    validate: {
      min: 0.0,
      max: 1.0,
    },
  },

  // Individual review/comment entry
  reviewed_by_admin_id: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: Admin,
      key: 'id',
    },
  },

  // Individual score given by this reviewer (0.0 to 1.0)
  score: {
    type: DataTypes.DECIMAL(3, 2),
    allowNull: true,
    validate: {
      min: 0.0,
      max: 1.0,
    },
  },

  // Comment/notes from admin/supervisor
  comment: {
    type: DataTypes.TEXT,
    allowNull: true,
  },

  // Review context
  review_type: {
    type: DataTypes.STRING,
    allowNull: true,
    defaultValue: 'general',
    validate: {
      isIn: [['general', 'shift_performance', 'incident_followup', 'premium_shift', 'training']],
    },
  },

  // Related shift ID (if review is about specific shift)
  related_shift_id: {
    type: DataTypes.UUID,
    allowNull: true,
    references: {
      model: Shift,
      key: 'id',
    },
  },

  created_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
}, {
  tableName: 'guard_reputation',
  timestamps: false,
});

module.exports = GuardReputation;
