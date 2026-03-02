/**
 * Migration: Add profile_photo_url to guards table
 * 
 * Enables storing guard profile photos for AI identity verification
 * in inspection submissions.
 */

"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    const tableDescription = await queryInterface.describeTable('guards');
    
    if (!tableDescription.profile_photo_url) {
      await queryInterface.addColumn('guards', 'profile_photo_url', {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'URL to guard profile photo (for AI identity verification in inspections)'
      });
      console.log('✅ Added profile_photo_url column to guards table');
    } else {
      console.log('⚠️  profile_photo_url column already exists in guards table');
    }
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('guards', 'profile_photo_url');
    console.log('✅ Removed profile_photo_url column from guards table');
  }
};
