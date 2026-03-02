/**
 * Migration: Add site_id to incidents table
 * 
 * Links incidents to specific sites/buildings.
 * Allows filtering and grouping by location.
 */

"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    const tableDescription = await queryInterface.describeTable("incidents");
    
    if (!tableDescription.site_id) {
      await queryInterface.addColumn("incidents", "site_id", {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'sites', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      });
      console.log('✅ Added site_id column to incidents table');
    } else {
      console.log('⚠️  site_id column already exists in incidents table');
    }

    // Composite index for site-based queries
    try {
      await queryInterface.addIndex("incidents", ["tenant_id", "site_id", "reported_at"], {
        name: "idx_incidents_tenant_site_reported"
      });
      console.log('✅ Created index idx_incidents_tenant_site_reported');
    } catch (error) {
      if (error.name !== 'SequelizeDatabaseError' || !error.message.includes('already exists')) {
        throw error;
      }
      console.log('⚠️  Index idx_incidents_tenant_site_reported already exists');
    }
  },

  async down(queryInterface) {
    try {
      await queryInterface.removeIndex("incidents", "idx_incidents_tenant_site_reported");
      console.log('✅ Removed index idx_incidents_tenant_site_reported');
    } catch (error) {
      console.log('⚠️  Index idx_incidents_tenant_site_reported does not exist');
    }
    
    const tableDescription = await queryInterface.describeTable("incidents");
    if (tableDescription.site_id) {
      await queryInterface.removeColumn("incidents", "site_id");
      console.log('✅ Removed site_id column from incidents table');
    }
  },
};
