/**
 * Migration: SMS/voice communications consent on guards (Twilio / TCPA).
 */
'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const tableDescription = await queryInterface.describeTable('guards');
    if (!tableDescription.communications_consent) {
      await queryInterface.addColumn('guards', 'communications_consent', {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      });
      console.log('✅ Added communications_consent to guards table');
    }
    if (!tableDescription.consent_at) {
      await queryInterface.addColumn('guards', 'consent_at', {
        type: Sequelize.DATE,
        allowNull: true,
      });
      console.log('✅ Added consent_at to guards table');
    }
    if (!tableDescription.consent_source) {
      await queryInterface.addColumn('guards', 'consent_source', {
        type: Sequelize.STRING,
        allowNull: true,
      });
      console.log('✅ Added consent_source to guards table');
    }
  },

  async down(queryInterface) {
    const tableDescription = await queryInterface.describeTable('guards');
    if (tableDescription.consent_source) {
      await queryInterface.removeColumn('guards', 'consent_source');
    }
    if (tableDescription.consent_at) {
      await queryInterface.removeColumn('guards', 'consent_at');
    }
    if (tableDescription.communications_consent) {
      await queryInterface.removeColumn('guards', 'communications_consent');
    }
  },
};
