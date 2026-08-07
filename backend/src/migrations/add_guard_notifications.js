/**
 * Create guard_notifications table for Guard app shift alerts.
 */
"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = await queryInterface.showAllTables();
    const names = (tables || []).map((t) =>
      typeof t === "string" ? t.toLowerCase() : String(t.tableName || t).toLowerCase()
    );
    if (names.includes("guard_notifications")) {
      console.log("ℹ️ guard_notifications already exists");
      return;
    }

    await queryInterface.createTable("guard_notifications", {
      id: {
        type: Sequelize.UUID,
        primaryKey: true,
        allowNull: false,
        defaultValue: Sequelize.literal("gen_random_uuid()"),
      },
      guard_id: {
        type: Sequelize.UUID,
        allowNull: false,
      },
      type: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      title: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      message: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      shift_id: {
        type: Sequelize.UUID,
        allowNull: true,
      },
      read_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      meta: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: {},
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

    await queryInterface.addIndex("guard_notifications", ["guard_id"]);
    await queryInterface.addIndex("guard_notifications", ["shift_id"]);
    await queryInterface.addIndex("guard_notifications", ["read_at"]);
    await queryInterface.addIndex("guard_notifications", ["created_at"]);
    console.log("✅ Created guard_notifications table");
  },

  async down(queryInterface) {
    await queryInterface.dropTable("guard_notifications");
  },
};
