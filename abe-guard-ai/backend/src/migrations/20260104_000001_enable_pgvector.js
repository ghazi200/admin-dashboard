"use strict";

/**
 * Migration 1:
 * - Enables pgvector for embeddings
 * - Enables uuid-ossp for UUID generation
 * - Enables pg_trgm for optional text indexing
 */

module.exports = {
  async up(queryInterface) {
    // pgvector extension (REQUIRED)
    await queryInterface.sequelize.query(
      `CREATE EXTENSION IF NOT EXISTS vector;`
    );

    // UUID helper
    await queryInterface.sequelize.query(
      `CREATE EXTENSION IF NOT EXISTS "uuid-ossp";`
    );

    // Optional text search helpers
    await queryInterface.sequelize.query(
      `CREATE EXTENSION IF NOT EXISTS pg_trgm;`
    );
  },

  async down(queryInterface) {
    // Usually extensions are not dropped, but included for completeness
    await queryInterface.sequelize.query(`DROP EXTENSION IF EXISTS pg_trgm;`);
    await queryInterface.sequelize.query(`DROP EXTENSION IF EXISTS "uuid-ossp";`);
    await queryInterface.sequelize.query(`DROP EXTENSION IF EXISTS vector;`);
  },
};
