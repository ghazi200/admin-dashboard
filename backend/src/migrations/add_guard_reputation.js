/**
 * Migration: create guard_reputation for admin reputation page.
 */
"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = await queryInterface.showAllTables();
    const names = (tables || []).map((t) =>
      typeof t === "string" ? t.toLowerCase() : String(t.tableName || t).toLowerCase()
    );
    if (names.includes("guard_reputation")) {
      console.log("ℹ️ guard_reputation already exists");
      return;
    }

    await queryInterface.createTable("guard_reputation", {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal("gen_random_uuid()"),
        primaryKey: true,
      },
      tenant_id: { type: Sequelize.UUID, allowNull: true },
      guard_id: { type: Sequelize.UUID, allowNull: false },
      trust_score: {
        type: Sequelize.DECIMAL(3, 2),
        allowNull: false,
        defaultValue: 0.5,
      },
      reviewed_by_admin_id: { type: Sequelize.INTEGER, allowNull: true },
      score: { type: Sequelize.DECIMAL(3, 2), allowNull: true },
      comment: { type: Sequelize.TEXT, allowNull: true },
      review_type: {
        type: Sequelize.STRING(50),
        allowNull: true,
        defaultValue: "general",
      },
      related_shift_id: { type: Sequelize.UUID, allowNull: true },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("NOW()"),
      },
    });

    await queryInterface.addIndex("guard_reputation", ["guard_id"]);
    await queryInterface.addIndex("guard_reputation", ["tenant_id"]);
    await queryInterface.addIndex("guard_reputation", ["tenant_id", "guard_id"]);
    console.log("✅ Created guard_reputation table");
  },

  async down(queryInterface) {
    await queryInterface.dropTable("guard_reputation");
  },
};
