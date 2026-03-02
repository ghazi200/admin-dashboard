/**
 * Migration: Create guard_reputation table
 * 
 * Stores guard reputation scores and comments from admins/supervisors
 * Used for ranking, premium shift assignment, and supervisor review
 */

'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('guard_reputation', {
      id: {
        type: Sequelize.UUID,
        allowNull: false,
        primaryKey: true,
        defaultValue: Sequelize.UUIDV4,
      },

      tenant_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'tenants', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },

      guard_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'guards', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },

      // Trust score (0.0 to 1.0, aggregated from individual reviews)
      trust_score: {
        type: Sequelize.DECIMAL(3, 2),
        allowNull: false,
        defaultValue: 0.5,
        validate: {
          min: 0.0,
          max: 1.0,
        },
      },

      // Individual review/comment entry
      reviewed_by_admin_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'admins', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },

      // Individual score given by this reviewer (0.0 to 1.0)
      score: {
        type: Sequelize.DECIMAL(3, 2),
        allowNull: true,
        validate: {
          min: 0.0,
          max: 1.0,
        },
      },

      // Comment/notes from admin/supervisor
      comment: {
        type: Sequelize.TEXT,
        allowNull: true,
      },

      // Review context (e.g., "shift_performance", "general", "incident_followup")
      review_type: {
        type: Sequelize.STRING,
        allowNull: true,
        defaultValue: 'general',
      },

      // Related shift ID (if review is about specific shift)
      related_shift_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'shifts', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },

      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn('NOW'),
      },
    });

    // Indexes for performance
    await queryInterface.addIndex('guard_reputation', ['tenant_id']);
    await queryInterface.addIndex('guard_reputation', ['guard_id']);
    await queryInterface.addIndex('guard_reputation', ['reviewed_by_admin_id']);
    await queryInterface.addIndex('guard_reputation', ['trust_score']);
    await queryInterface.addIndex('guard_reputation', ['created_at']);
    await queryInterface.addIndex('guard_reputation', ['tenant_id', 'guard_id']);

    console.log('✅ Created guard_reputation table with indexes');
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('guard_reputation', ['tenant_id', 'guard_id']);
    await queryInterface.removeIndex('guard_reputation', ['created_at']);
    await queryInterface.removeIndex('guard_reputation', ['trust_score']);
    await queryInterface.removeIndex('guard_reputation', ['reviewed_by_admin_id']);
    await queryInterface.removeIndex('guard_reputation', ['guard_id']);
    await queryInterface.removeIndex('guard_reputation', ['tenant_id']);

    await queryInterface.dropTable('guard_reputation');
    console.log('✅ Dropped guard_reputation table');
  }
};
