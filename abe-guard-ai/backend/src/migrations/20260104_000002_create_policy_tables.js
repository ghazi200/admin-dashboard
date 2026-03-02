"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    // =========================
    // policy_documents
    // =========================
    await queryInterface.createTable("policy_documents", {
      id: {
        type: Sequelize.UUID,
        primaryKey: true,
        allowNull: false,
        defaultValue: Sequelize.literal("uuid_generate_v4()"),
      },

      tenant_id: { type: Sequelize.UUID, allowNull: false },
      site_id: { type: Sequelize.UUID, allowNull: true },

      title: { type: Sequelize.STRING(255), allowNull: false },
      category: { type: Sequelize.STRING(80), allowNull: true },

      visibility: {
        type: Sequelize.ENUM("guard", "supervisor", "admin", "all"),
        allowNull: false,
        defaultValue: "all",
      },

      file_name: { type: Sequelize.STRING(255), allowNull: true },
      file_mime: { type: Sequelize.STRING(100), allowNull: true },
      file_path: { type: Sequelize.STRING(500), allowNull: true },

      raw_text: { type: Sequelize.TEXT, allowNull: true },

      is_active: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },

      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("NOW()"),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("NOW()"),
      },
    });

    // ✅ Idempotent indexes (won't fail if they already exist)
    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_policy_documents_tenant_id
      ON policy_documents (tenant_id);
    `);

    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_policy_documents_tenant_site
      ON policy_documents (tenant_id, site_id);
    `);

    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_policy_documents_is_active
      ON policy_documents (is_active);
    `);

    // =========================
    // policy_chunks
    // =========================
    await queryInterface.createTable("policy_chunks", {
      id: {
        type: Sequelize.UUID,
        primaryKey: true,
        allowNull: false,
        defaultValue: Sequelize.literal("uuid_generate_v4()"),
      },

      tenant_id: { type: Sequelize.UUID, allowNull: false },
      site_id: { type: Sequelize.UUID, allowNull: true },

      document_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "policy_documents", key: "id" },
        onDelete: "CASCADE",
        onUpdate: "CASCADE",
      },

      chunk_index: { type: Sequelize.INTEGER, allowNull: false },

      section_title: { type: Sequelize.STRING(255), allowNull: true },
      page_start: { type: Sequelize.INTEGER, allowNull: true },
      page_end: { type: Sequelize.INTEGER, allowNull: true },

      content: { type: Sequelize.TEXT, allowNull: false },

      // ✅ Do NOT declare pgvector in createTable() (causes "[object Object]" / "[" SQL errors)
      // embedding added via ALTER TABLE below

      meta_json: { type: Sequelize.JSONB, allowNull: true },

      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("NOW()"),
      },
    });

    // ✅ Add pgvector column AFTER table creation (safe)
    await queryInterface.sequelize.query(`
      ALTER TABLE policy_chunks
      ADD COLUMN IF NOT EXISTS embedding vector(1536);
    `);

    // ✅ Idempotent indexes (raw SQL so reruns never fail)
    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_policy_chunks_document_id
      ON policy_chunks (document_id);
    `);

    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_policy_chunks_tenant_site
      ON policy_chunks (tenant_id, site_id);
    `);

    // =========================
    // ai_policy_qas
    // =========================
    await queryInterface.createTable("ai_policy_qas", {
      id: {
        type: Sequelize.UUID,
        primaryKey: true,
        allowNull: false,
        defaultValue: Sequelize.literal("uuid_generate_v4()"),
      },

      tenant_id: { type: Sequelize.UUID, allowNull: false },
      site_id: { type: Sequelize.UUID, allowNull: true },
      shift_id: { type: Sequelize.UUID, allowNull: true },

      asked_by_user_id: { type: Sequelize.UUID, allowNull: false },
      asked_by_role: { type: Sequelize.STRING(30), allowNull: false },

      question: { type: Sequelize.TEXT, allowNull: false },
      answer: { type: Sequelize.TEXT, allowNull: false },

      // ✅ No "[]": use jsonb_build_array() to avoid '[' token in SQL
      sources_json: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: Sequelize.literal("jsonb_build_array()"),
      },

      escalate_recommended: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      confidence: { type: Sequelize.FLOAT, allowNull: true },

      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("NOW()"),
      },
    });

    // ✅ Idempotent indexes (raw SQL so reruns never fail)
    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_ai_policy_qas_tenant_id
      ON ai_policy_qas (tenant_id);
    `);

    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_ai_policy_qas_tenant_site
      ON ai_policy_qas (tenant_id, site_id);
    `);

    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_ai_policy_qas_created_at
      ON ai_policy_qas (created_at);
    `);
  },

  async down(queryInterface) {
    // Drop tables first (CASCADE will remove dependent indexes)
    await queryInterface.dropTable("ai_policy_qas");
    await queryInterface.dropTable("policy_chunks");
    await queryInterface.dropTable("policy_documents");

    // Drop enum type created by Sequelize for visibility
    await queryInterface.sequelize.query(
      `DROP TYPE IF EXISTS "enum_policy_documents_visibility";`
    );
  },
};
