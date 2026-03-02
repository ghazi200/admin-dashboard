"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("pay_periods", {
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

      period_start: {
        type: Sequelize.DATEONLY,
        allowNull: false,
      },

      period_end: {
        type: Sequelize.DATEONLY,
        allowNull: false,
      },

      period_type: {
        type: Sequelize.STRING,
        allowNull: false,
        defaultValue: "BIWEEKLY",
      },

      status: {
        type: Sequelize.STRING,
        allowNull: false,
        defaultValue: "OPEN",
      },

      locked_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },

      locked_by_admin_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: "admins", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      },

      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn("NOW"),
      },
    });

    // Add CHECK constraints
    await queryInterface.sequelize.query(`
      ALTER TABLE pay_periods
      DROP CONSTRAINT IF EXISTS pay_periods_period_type_check;
    `);

    await queryInterface.sequelize.query(`
      ALTER TABLE pay_periods
      ADD CONSTRAINT pay_periods_period_type_check
      CHECK (period_type IN ('WEEKLY','BIWEEKLY','MONTHLY','SEMIMONTHLY'));
    `);

    await queryInterface.sequelize.query(`
      ALTER TABLE pay_periods
      DROP CONSTRAINT IF EXISTS pay_periods_status_check;
    `);

    await queryInterface.sequelize.query(`
      ALTER TABLE pay_periods
      ADD CONSTRAINT pay_periods_status_check
      CHECK (status IN ('OPEN','LOCKED','CLOSED','PAID'));
    `);

    // Add indexes
    await queryInterface.addIndex("pay_periods", ["tenant_id"]);
    await queryInterface.addIndex("pay_periods", ["period_start", "period_end"]);
    await queryInterface.addIndex("pay_periods", ["status"]);
    await queryInterface.addIndex("pay_periods", ["tenant_id", "status"]);
  },

  async down(queryInterface) {
    await queryInterface.removeIndex("pay_periods", ["tenant_id", "status"]);
    await queryInterface.removeIndex("pay_periods", ["status"]);
    await queryInterface.removeIndex("pay_periods", ["period_start", "period_end"]);
    await queryInterface.removeIndex("pay_periods", ["tenant_id"]);

    await queryInterface.sequelize.query(`
      ALTER TABLE pay_periods
      DROP CONSTRAINT IF EXISTS pay_periods_status_check;
    `);

    await queryInterface.sequelize.query(`
      ALTER TABLE pay_periods
      DROP CONSTRAINT IF EXISTS pay_periods_period_type_check;
    `);

    await queryInterface.dropTable("pay_periods");
  },
};
