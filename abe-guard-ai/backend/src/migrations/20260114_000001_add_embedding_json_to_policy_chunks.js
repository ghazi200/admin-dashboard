"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    // Add embedding_json column if it doesn't exist
    await queryInterface.sequelize.query(`
      ALTER TABLE policy_chunks
      ADD COLUMN IF NOT EXISTS embedding_json JSONB;
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE policy_chunks
      DROP COLUMN IF EXISTS embedding_json;
    `);
  },
};
