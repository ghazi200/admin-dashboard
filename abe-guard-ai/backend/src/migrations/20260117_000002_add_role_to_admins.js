"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    // Add role column with default 'admin' for existing records
    await queryInterface.addColumn("admins", "role", {
      type: Sequelize.STRING,
      allowNull: false,
      defaultValue: "admin",
    });

    // Add CHECK constraint to validate role values
    await queryInterface.sequelize.query(`
      ALTER TABLE admins
      DROP CONSTRAINT IF EXISTS admins_role_check;
    `);

    await queryInterface.sequelize.query(`
      ALTER TABLE admins
      ADD CONSTRAINT admins_role_check
      CHECK (role IN ('admin', 'super_admin'));
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE admins
      DROP CONSTRAINT IF EXISTS admins_role_check;
    `);

    await queryInterface.removeColumn("admins", "role");
  },
};
