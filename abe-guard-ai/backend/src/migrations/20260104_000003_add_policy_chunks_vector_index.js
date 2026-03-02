"use strict";

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_policy_chunks_embedding_ivfflat
      ON policy_chunks USING ivfflat (embedding vector_cosine_ops)
      WITH (lists = 100);
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`DROP INDEX IF EXISTS idx_policy_chunks_embedding_ivfflat;`);
  },
};
