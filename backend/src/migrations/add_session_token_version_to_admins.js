/**
 * Migration: Add session_token_version to admins table
 *
 * Used for single-session-per-user: new login or "log out other devices"
 * increments this; auth middleware rejects tokens with older version.
 */

'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const tableDescription = await queryInterface.describeTable('Admins');
    if (!tableDescription.session_token_version) {
      await queryInterface.addColumn('Admins', 'session_token_version', {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      });
      console.log('✅ Added session_token_version column to Admins table');
    } else {
      console.log('⚠️  session_token_version column already exists in Admins table');
    }
  },

  async down(queryInterface) {
    const tableDescription = await queryInterface.describeTable('Admins');
    if (tableDescription.session_token_version) {
      await queryInterface.removeColumn('Admins', 'session_token_version');
      console.log('✅ Removed session_token_version column from Admins table');
    } else {
      console.log('⚠️  session_token_version column does not exist in Admins table');
    }
  },
};
