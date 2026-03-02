/**
 * Migration: Add site_id to shifts table (Optional)
 * 
 * Links shifts to specific sites/buildings.
 * Enables auto-selection of site when guards report incidents from active shifts.
 */

"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    const tableDescription = await queryInterface.describeTable("shifts");
    
    if (!tableDescription.site_id) {
      await queryInterface.addColumn("shifts", "site_id", {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'sites', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      });
      console.log('✅ Added site_id column to shifts table');
    } else {
      console.log('⚠️  site_id column already exists in shifts table');
    }
  },

  async down(queryInterface) {
    const tableDescription = await queryInterface.describeTable("shifts");
    if (tableDescription.site_id) {
      await queryInterface.removeColumn("shifts", "site_id");
      console.log('✅ Removed site_id column from shifts table');
    }
  },
};
