/**
 * Migration: Add failed_login_attempts and locked_until to guards table
 * For account lock after 5 failed attempts; admin can unlock.
 */

'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const tableDescription = await queryInterface.describeTable('guards');
    if (!tableDescription.failed_login_attempts) {
      await queryInterface.addColumn('guards', 'failed_login_attempts', {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      });
      console.log('✅ Added failed_login_attempts to guards table');
    }
    if (!tableDescription.locked_until) {
      await queryInterface.addColumn('guards', 'locked_until', {
        type: Sequelize.DATE,
        allowNull: true,
      });
      console.log('✅ Added locked_until to guards table');
    }
  },

  async down(queryInterface) {
    const tableDescription = await queryInterface.describeTable('guards');
    if (tableDescription.failed_login_attempts) {
      await queryInterface.removeColumn('guards', 'failed_login_attempts');
    }
    if (tableDescription.locked_until) {
      await queryInterface.removeColumn('guards', 'locked_until');
    }
  },
};
