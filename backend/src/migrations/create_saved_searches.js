"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("saved_searches", {
      id: {
        type: Sequelize.UUID,
        primaryKey: true,
        defaultValue: Sequelize.UUIDV4,
      },
      admin_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "Admins", key: "id" },
        onDelete: "CASCADE",
      },
      name: {
        type: Sequelize.STRING(255),
        allowNull: false,
      },
      query: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      filters: {
        type: Sequelize.JSONB,
        allowNull: true,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },
    });
    await queryInterface.addIndex("saved_searches", ["admin_id"]);
  },

  async down(queryInterface) {
    await queryInterface.dropTable("saved_searches");
  },
};
