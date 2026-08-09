/**
 * Ensure audit_events exists (idempotent).
 * Usage: node scripts/run-audit-events-migration.js
 */
"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = await queryInterface.showAllTables();
    const names = (tables || []).map((t) => (typeof t === "string" ? t : t.tableName || t));
    if (names.includes("audit_events")) {
      console.log("ℹ️  audit_events already exists");
      return;
    }
    await queryInterface.createTable("audit_events", {
      id: {
        type: Sequelize.UUID,
        primaryKey: true,
        allowNull: false,
      },
      tenant_id: { type: Sequelize.UUID, allowNull: true },
      actor_type: { type: Sequelize.STRING(32), allowNull: false, defaultValue: "system" },
      actor_id: { type: Sequelize.STRING(64), allowNull: true },
      action: { type: Sequelize.STRING(128), allowNull: false },
      entity_type: { type: Sequelize.STRING(64), allowNull: true },
      entity_id: { type: Sequelize.UUID, allowNull: true },
      summary: { type: Sequelize.TEXT, allowNull: true },
      before_json: { type: Sequelize.JSONB, allowNull: true },
      after_json: { type: Sequelize.JSONB, allowNull: true },
      meta: { type: Sequelize.JSONB, allowNull: true },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("NOW()"),
      },
    });
    // id default applied by app (UUIDV4); avoid requiring pgcrypto extension
    await queryInterface.sequelize.query(
      `ALTER TABLE audit_events ALTER COLUMN id SET DEFAULT gen_random_uuid()`
    ).catch(() => {
      /* extension may be missing — app always supplies id */
    });
    await queryInterface.addIndex("audit_events", ["tenant_id", "created_at"]);
    await queryInterface.addIndex("audit_events", ["action"]);
    await queryInterface.addIndex("audit_events", ["entity_type", "entity_id"]);
    console.log("✅ Created audit_events");
  },

  async down(queryInterface) {
    await queryInterface.dropTable("audit_events");
  },
};
