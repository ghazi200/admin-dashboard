"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("tenants", "payroll_mode", {
      type: Sequelize.STRING,
      allowNull: false,
      defaultValue: "PAYSTUB_UPLOAD",
    });

    await queryInterface.addColumn("tenants", "ai_payroll_enabled", {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    });

    await queryInterface.sequelize.query(`
      ALTER TABLE tenants
      DROP CONSTRAINT IF EXISTS tenants_payroll_mode_check;
    `);

    await queryInterface.sequelize.query(`
      ALTER TABLE tenants
      ADD CONSTRAINT tenants_payroll_mode_check
      CHECK (payroll_mode IN ('PAYSTUB_UPLOAD','CALCULATED','HYBRID'));
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE tenants
      DROP CONSTRAINT IF EXISTS tenants_payroll_mode_check;
    `);

    await queryInterface.removeColumn("tenants", "ai_payroll_enabled");
    await queryInterface.removeColumn("tenants", "payroll_mode");
  },
};
