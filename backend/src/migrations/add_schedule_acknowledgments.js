/**
 * Ensure schedule_acknowledgments exists (idempotent).
 * Usage: node scripts/run-schedule-acknowledgments-migration.js
 */
"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = await queryInterface.showAllTables();
    const names = (tables || []).map((t) => (typeof t === "string" ? t : t.tableName || t));
    if (names.includes("schedule_acknowledgments")) {
      console.log("ℹ️  schedule_acknowledgments already exists");
      return;
    }
    await queryInterface.createTable("schedule_acknowledgments", {
      id: {
        type: Sequelize.UUID,
        primaryKey: true,
        allowNull: false,
      },
      tenant_id: { type: Sequelize.UUID, allowNull: true },
      guard_id: { type: Sequelize.UUID, allowNull: false },
      period_start: { type: Sequelize.DATEONLY, allowNull: false },
      period_end: { type: Sequelize.DATEONLY, allowNull: false },
      note: { type: Sequelize.STRING(500), allowNull: true },
      acknowledged_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("NOW()"),
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
    await queryInterface.sequelize
      .query(
        `ALTER TABLE schedule_acknowledgments ALTER COLUMN id SET DEFAULT gen_random_uuid()`
      )
      .catch(() => {
        /* extension may be missing — app supplies id */
      });
    await queryInterface.addIndex(
      "schedule_acknowledgments",
      ["guard_id", "period_start", "period_end"],
      { unique: true, name: "schedule_acks_guard_period_uidx" }
    );
    await queryInterface.addIndex("schedule_acknowledgments", ["tenant_id", "period_start"], {
      name: "schedule_acks_tenant_period_idx",
    });
    console.log("✅ Created schedule_acknowledgments");
  },

  async down(queryInterface) {
    await queryInterface.dropTable("schedule_acknowledgments");
  },
};
