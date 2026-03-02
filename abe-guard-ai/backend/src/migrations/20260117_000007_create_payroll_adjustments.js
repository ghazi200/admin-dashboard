"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("payroll_adjustments", {
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
        onDelete: "RESTRICT",
      },

      guard_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "guards", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "RESTRICT",
      },

      pay_period_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "pay_periods", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "RESTRICT",
      },

      timesheet_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: "timesheets", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      },

      adjustment_type: {
        type: Sequelize.STRING,
        allowNull: false,
      },

      amount: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false,
      },

      description: {
        type: Sequelize.TEXT,
        allowNull: false,
      },

      status: {
        type: Sequelize.STRING,
        allowNull: false,
        defaultValue: "DRAFT",
      },

      suggested_by_ai: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },

      ai_suggestion_reason: {
        type: Sequelize.TEXT,
        allowNull: true,
      },

      requested_by_admin_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "admins", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "RESTRICT",
      },

      approved_by_admin_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: "admins", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      },

      approved_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },

      applied_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },

      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn("NOW"),
      },
    });

    // Add CHECK constraints
    await queryInterface.sequelize.query(`
      ALTER TABLE payroll_adjustments
      DROP CONSTRAINT IF EXISTS payroll_adjustments_adjustment_type_check;
    `);

    await queryInterface.sequelize.query(`
      ALTER TABLE payroll_adjustments
      ADD CONSTRAINT payroll_adjustments_adjustment_type_check
      CHECK (adjustment_type IN ('BONUS','DEDUCTION','CORRECTION','AI_SUGGESTED'));
    `);

    await queryInterface.sequelize.query(`
      ALTER TABLE payroll_adjustments
      DROP CONSTRAINT IF EXISTS payroll_adjustments_status_check;
    `);

    await queryInterface.sequelize.query(`
      ALTER TABLE payroll_adjustments
      ADD CONSTRAINT payroll_adjustments_status_check
      CHECK (status IN ('DRAFT','PENDING_APPROVAL','APPROVED','REJECTED','APPLIED'));
    `);

    // Add indexes
    await queryInterface.addIndex("payroll_adjustments", ["tenant_id"]);
    await queryInterface.addIndex("payroll_adjustments", ["guard_id"]);
    await queryInterface.addIndex("payroll_adjustments", ["pay_period_id"]);
    await queryInterface.addIndex("payroll_adjustments", ["timesheet_id"]);
    await queryInterface.addIndex("payroll_adjustments", ["status"]);
    await queryInterface.addIndex("payroll_adjustments", ["suggested_by_ai"]);
    await queryInterface.addIndex("payroll_adjustments", ["guard_id", "pay_period_id"]);
  },

  async down(queryInterface) {
    await queryInterface.removeIndex("payroll_adjustments", ["guard_id", "pay_period_id"]);
    await queryInterface.removeIndex("payroll_adjustments", ["suggested_by_ai"]);
    await queryInterface.removeIndex("payroll_adjustments", ["status"]);
    await queryInterface.removeIndex("payroll_adjustments", ["timesheet_id"]);
    await queryInterface.removeIndex("payroll_adjustments", ["pay_period_id"]);
    await queryInterface.removeIndex("payroll_adjustments", ["guard_id"]);
    await queryInterface.removeIndex("payroll_adjustments", ["tenant_id"]);

    await queryInterface.sequelize.query(`
      ALTER TABLE payroll_adjustments
      DROP CONSTRAINT IF EXISTS payroll_adjustments_status_check;
    `);

    await queryInterface.sequelize.query(`
      ALTER TABLE payroll_adjustments
      DROP CONSTRAINT IF EXISTS payroll_adjustments_adjustment_type_check;
    `);

    await queryInterface.dropTable("payroll_adjustments");
  },
};
