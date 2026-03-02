/**
 * Migration: Create inspection_requests table
 * 
 * Stores inspection requests created by supervisors/admins,
 * with challenge codes, required items, and deadline tracking.
 */

"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("inspection_requests", {
      id: {
        type: Sequelize.UUID,
        allowNull: false,
        primaryKey: true,
        defaultValue: Sequelize.UUIDV4,
      },

      tenant_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "tenants", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
        comment: "Tenant for multi-tenant isolation",
      },

      site_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: "sites", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
        comment: "Site where inspection should occur",
      },

      shift_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: "shifts", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
        comment: "Optional: Specific shift to inspect",
      },

      guard_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: "guards", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
        comment: "Optional: Specific guard. NULL = broadcast to all guards on site",
      },

      requested_by_admin_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "admins", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "RESTRICT",
        comment: "Admin/supervisor who created the request",
      },

      challenge_code: {
        type: Sequelize.STRING,
        allowNull: false,
        comment: "Unique challenge code (e.g., 'ABE-4921') that guard must show in photo",
      },

      instructions: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: "Free-text instructions for the guard",
      },

      required_items_json: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: {},
        comment: "JSON object: { selfie: true, badge: true, signage: false, etc. }",
      },

      due_at: {
        type: Sequelize.DATE,
        allowNull: false,
        comment: "Deadline for submission (e.g., 10 minutes from request)",
      },

      status: {
        type: Sequelize.ENUM(
          "PENDING",
          "SUBMITTED",
          "APPROVED",
          "REJECTED",
          "EXPIRED"
        ),
        allowNull: false,
        defaultValue: "PENDING",
        comment: "Request status lifecycle",
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
    await queryInterface.addIndex("inspection_requests", ["tenant_id", "status"], {
      name: "idx_inspection_requests_tenant_status",
    });

    await queryInterface.addIndex("inspection_requests", ["tenant_id", "site_id"], {
      name: "idx_inspection_requests_tenant_site",
    });

    await queryInterface.addIndex("inspection_requests", ["guard_id"], {
      name: "idx_inspection_requests_guard_id",
    });

    await queryInterface.addIndex("inspection_requests", ["requested_by_admin_id"], {
      name: "idx_inspection_requests_admin_id",
    });

    await queryInterface.addIndex("inspection_requests", ["due_at"], {
      name: "idx_inspection_requests_due_at",
    });

    await queryInterface.addIndex("inspection_requests", ["challenge_code"], {
      name: "idx_inspection_requests_challenge_code",
      unique: true,
    });

    console.log("✅ Created inspection_requests table with indexes");
  },

  async down(queryInterface) {
    await queryInterface.removeIndex("inspection_requests", "idx_inspection_requests_challenge_code");
    await queryInterface.removeIndex("inspection_requests", "idx_inspection_requests_due_at");
    await queryInterface.removeIndex("inspection_requests", "idx_inspection_requests_admin_id");
    await queryInterface.removeIndex("inspection_requests", "idx_inspection_requests_guard_id");
    await queryInterface.removeIndex("inspection_requests", "idx_inspection_requests_tenant_site");
    await queryInterface.removeIndex("inspection_requests", "idx_inspection_requests_tenant_status");
    await queryInterface.dropTable("inspection_requests");
    console.log("✅ Dropped inspection_requests table");
  },
};
