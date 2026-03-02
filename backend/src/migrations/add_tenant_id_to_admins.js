/**
 * Migration: Add tenant_id to admins table
 * 
 * This migration adds tenant_id column to the admins table for multi-tenant support.
 * The column allows NULL initially for backward compatibility during migration.
 */

'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // Check if column already exists
    const tableDescription = await queryInterface.describeTable('Admins');
    
    if (!tableDescription.tenant_id) {
      await queryInterface.addColumn('Admins', 'tenant_id', {
        type: Sequelize.UUID,
        allowNull: true, // Allow NULL initially for backward compatibility
        // If you have a tenants table, uncomment below after creating it:
        // references: { model: 'tenants', key: 'id' },
        // onUpdate: 'CASCADE',
        // onDelete: 'SET NULL',
      });
      
      console.log('✅ Added tenant_id column to Admins table');
    } else {
      console.log('⚠️  tenant_id column already exists in Admins table');
    }
  },

  async down(queryInterface, Sequelize) {
    // Remove tenant_id column
    const tableDescription = await queryInterface.describeTable('Admins');
    
    if (tableDescription.tenant_id) {
      await queryInterface.removeColumn('Admins', 'tenant_id');
      console.log('✅ Removed tenant_id column from Admins table');
    } else {
      console.log('⚠️  tenant_id column does not exist in Admins table');
    }
  }
};
