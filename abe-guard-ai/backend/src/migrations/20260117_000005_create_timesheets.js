"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("timesheets", {
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

      regular_hours: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0,
      },

      overtime_hours: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0,
      },

      double_time_hours: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0,
      },

      total_hours: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0,
      },

      status: {
        type: Sequelize.STRING,
        allowNull: false,
        defaultValue: "DRAFT",
      },

      submitted_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },

      approved_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },

      approved_by_admin_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: "admins", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      },

      calculated_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },

      exceptions_count: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },

      exceptions_json: {
        type: Sequelize.JSONB,
        allowNull: true,
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

    // Add CHECK constraints
    await queryInterface.sequelize.query(`
      ALTER TABLE timesheets
      DROP CONSTRAINT IF EXISTS timesheets_status_check;
    `);

    await queryInterface.sequelize.query(`
      ALTER TABLE timesheets
      ADD CONSTRAINT timesheets_status_check
      CHECK (status IN ('DRAFT','SUBMITTED','APPROVED','REJECTED','PROCESSED'));
    `);

    // Add unique constraint (one timesheet per guard per pay period)
    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS timesheets_tenant_guard_period_unique
      ON timesheets (tenant_id, guard_id, pay_period_id);
    `);

    // Add indexes
    await queryInterface.addIndex("timesheets", ["tenant_id"]);
    await queryInterface.addIndex("timesheets", ["guard_id"]);
    await queryInterface.addIndex("timesheets", ["pay_period_id"]);
    await queryInterface.addIndex("timesheets", ["status"]);
    await queryInterface.addIndex("timesheets", ["guard_id", "pay_period_id"]);
  },

  async down(queryInterface) {
    await queryInterface.removeIndex("timesheets", ["guard_id", "pay_period_id"]);
    await queryInterface.removeIndex("timesheets", ["status"]);
    await queryInterface.removeIndex("timesheets", ["pay_period_id"]);
    await queryInterface.removeIndex("timesheets", ["guard_id"]);
    await queryInterface.removeIndex("timesheets", ["tenant_id"]);

    await queryInterface.sequelize.query(`
      DROP INDEX IF EXISTS timesheets_tenant_guard_period_unique;
    `);

    await queryInterface.sequelize.query(`
      ALTER TABLE timesheets
      DROP CONSTRAINT IF EXISTS timesheets_status_check;
    `);

    await queryInterface.dropTable("timesheets");
  },
};
