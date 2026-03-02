/**
 * Migration: Add verification fields to time_entries table
 * 
 * Adds spoofing_risk_score and verification_notes columns to track
 * AI verification and risk analysis for clock-in entries.
 */

'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const tableDescription = await queryInterface.describeTable('time_entries');

    // Add spoofing_risk_score column (0.0 to 1.0)
    if (!tableDescription.spoofing_risk_score) {
      await queryInterface.addColumn('time_entries', 'spoofing_risk_score', {
        type: Sequelize.DECIMAL(3, 2),
        allowNull: true,
        comment: 'AI-calculated spoofing risk score (0.00 = safe, 1.00 = high risk)',
        validate: {
          min: 0.00,
          max: 1.00
        }
      });
      console.log('✅ Added spoofing_risk_score column to time_entries table');
    } else {
      console.log('⚠️  spoofing_risk_score column already exists in time_entries table');
    }

    // Add verification_notes column (JSONB for flexible data storage)
    if (!tableDescription.verification_notes) {
      await queryInterface.addColumn('time_entries', 'verification_notes', {
        type: Sequelize.JSONB,
        allowNull: true,
        comment: 'JSON object storing verification details, risk factors, and analysis results'
      });
      console.log('✅ Added verification_notes column to time_entries table');
    } else {
      console.log('⚠️  verification_notes column already exists in time_entries table');
    }
  },

  async down(queryInterface) {
    const tableDescription = await queryInterface.describeTable('time_entries');

    if (tableDescription.verification_notes) {
      await queryInterface.removeColumn('time_entries', 'verification_notes');
      console.log('✅ Removed verification_notes column from time_entries table');
    }

    if (tableDescription.spoofing_risk_score) {
      await queryInterface.removeColumn('time_entries', 'spoofing_risk_score');
      console.log('✅ Removed spoofing_risk_score column from time_entries table');
    }
  }
};
