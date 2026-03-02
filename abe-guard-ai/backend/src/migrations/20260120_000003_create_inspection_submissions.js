/**
 * Migration: Create inspection_submissions table
 * 
 * Stores guard submissions for inspection requests,
 * including photos, metadata, and optional AI verification results.
 */

"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("inspection_submissions", {
      id: {
        type: Sequelize.UUID,
        allowNull: false,
        primaryKey: true,
        defaultValue: Sequelize.UUIDV4,
      },

      request_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "inspection_requests", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
        comment: "Reference to the inspection request",
      },

      tenant_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "tenants", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
        comment: "Tenant for multi-tenant isolation",
      },

      guard_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "guards", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
        comment: "Guard who submitted the inspection",
      },

      submitted_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn("NOW"),
        comment: "When the guard submitted the inspection",
      },

      photos_json: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: [],
        comment: "Array of photo objects: [{ url, hash_sha256, filename, size, mime }]",
      },

      comment: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: "Optional comment from guard",
      },

      meta_json: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: {},
        comment: "Metadata: { device, ip, location: { lat, lng } }",
      },

      // Optional AI verification fields (Phase 3)
      ai_verdict: {
        type: Sequelize.STRING,
        allowNull: true,
        comment: "AI verdict: 'VALID', 'SUSPICIOUS', 'POOR_QUALITY'",
      },

      ai_confidence: {
        type: Sequelize.DECIMAL(3, 2),
        allowNull: true,
        comment: "AI confidence score (0.00-1.00)",
        validate: {
          min: 0.00,
          max: 1.00,
        },
      },

      ai_notes: {
        type: Sequelize.JSONB,
        allowNull: true,
        comment: "AI analysis details: { faceDetected, qualityScore, challengeCodeFound, etc. }",
      },

      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn("NOW"),
      },

      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn("NOW"),
      },
    });

    // Indexes for performance
    await queryInterface.addIndex("inspection_submissions", ["request_id"], {
      name: "idx_inspection_submissions_request_id",
    });

    await queryInterface.addIndex("inspection_submissions", ["tenant_id", "submitted_at"], {
      name: "idx_inspection_submissions_tenant_submitted",
    });

    await queryInterface.addIndex("inspection_submissions", ["guard_id", "submitted_at"], {
      name: "idx_inspection_submissions_guard_submitted",
    });

    // Index for duplicate hash detection
    // Note: We'll need to query by hash from photos_json array
    // For now, this is handled in application logic
    // PostgreSQL can index JSONB fields, but for hash detection we'll query manually

    console.log("✅ Created inspection_submissions table with indexes");
  },

  async down(queryInterface) {
    await queryInterface.removeIndex("inspection_submissions", "idx_inspection_submissions_guard_submitted");
    await queryInterface.removeIndex("inspection_submissions", "idx_inspection_submissions_tenant_submitted");
    await queryInterface.removeIndex("inspection_submissions", "idx_inspection_submissions_request_id");
    await queryInterface.dropTable("inspection_submissions");
    console.log("✅ Dropped inspection_submissions table");
  },
};
