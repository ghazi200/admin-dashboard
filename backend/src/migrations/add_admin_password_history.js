"use strict";

/**
 * Password history for reuse check (password policy).
 * Keeps last N hashes per admin.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("admin_password_history", {
      id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      admin_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: "Admins", key: "id" },
        onDelete: "CASCADE",
      },
      password_hash: {
        type: Sequelize.STRING(255),
        allowNull: false,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },
    });
    await queryInterface.addIndex("admin_password_history", ["admin_id"]);
  },

  async down(queryInterface) {
    await queryInterface.dropTable("admin_password_history");
  },
};
