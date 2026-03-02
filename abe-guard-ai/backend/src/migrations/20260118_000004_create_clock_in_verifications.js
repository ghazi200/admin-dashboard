/**
 * Migration: Create clock_in_verifications audit table
 * 
 * Stores verification records for clock-in events, tracking geofence validation,
 * AI spoofing detection results, and admin review status.
 */

'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // Check if table already exists
    const tableExists = await queryInterface.sequelize.query(
      `SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'clock_in_verifications'
      );`,
      { type: Sequelize.QueryTypes.SELECT }
    );

    if (tableExists[0].exists) {
      console.log('⚠️  clock_in_verifications table already exists');
      return;
    }

    await queryInterface.createTable('clock_in_verifications', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
        allowNull: false
      },

      time_entry_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'time_entries', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
        comment: 'Reference to the time entry being verified'
      },

      tenant_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'tenants', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
        comment: 'Tenant for multi-tenant isolation'
      },

      guard_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'guards', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
        comment: 'Guard who clocked in'
      },

      shift_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'shifts', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
        comment: 'Shift associated with this clock-in'
      },

      verification_type: {
        type: Sequelize.STRING,
        allowNull: false,
        comment: 'Type of verification: geofence, ai_analysis, etc.'
      },

      verification_result: {
        type: Sequelize.STRING,
        allowNull: false,
        comment: 'Result: passed, failed, flagged'
      },

      verification_data: {
        type: Sequelize.JSONB,
        allowNull: true,
        comment: 'JSON object storing details like distance, risk score, device info, etc.'
      },

      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn('NOW')
      }
    });

    // Create indexes for performance
    await queryInterface.addIndex('clock_in_verifications', ['time_entry_id'], {
      name: 'idx_clock_in_verifications_time_entry_id'
    });

    await queryInterface.addIndex('clock_in_verifications', ['tenant_id'], {
      name: 'idx_clock_in_verifications_tenant_id'
    });

    await queryInterface.addIndex('clock_in_verifications', ['guard_id'], {
      name: 'idx_clock_in_verifications_guard_id'
    });

    await queryInterface.addIndex('clock_in_verifications', ['shift_id'], {
      name: 'idx_clock_in_verifications_shift_id'
    });

    await queryInterface.addIndex('clock_in_verifications', ['verification_result'], {
      name: 'idx_clock_in_verifications_result'
    });

    await queryInterface.addIndex('clock_in_verifications', ['created_at'], {
      name: 'idx_clock_in_verifications_created_at'
    });

    // Composite index for common queries
    await queryInterface.addIndex('clock_in_verifications', ['tenant_id', 'guard_id'], {
      name: 'idx_clock_in_verifications_tenant_guard'
    });

    console.log('✅ Created clock_in_verifications table with indexes');
  },

  async down(queryInterface) {
    // Remove indexes
    const indexes = [
      'idx_clock_in_verifications_tenant_guard',
      'idx_clock_in_verifications_created_at',
      'idx_clock_in_verifications_result',
      'idx_clock_in_verifications_shift_id',
      'idx_clock_in_verifications_guard_id',
      'idx_clock_in_verifications_tenant_id',
      'idx_clock_in_verifications_time_entry_id'
    ];

    for (const indexName of indexes) {
      try {
        await queryInterface.removeIndex('clock_in_verifications', indexName);
      } catch (error) {
        // Index might not exist, continue
        console.log(`⚠️  Index ${indexName} does not exist, skipping`);
      }
    }

    await queryInterface.dropTable('clock_in_verifications');
    console.log('✅ Dropped clock_in_verifications table');
  }
};
