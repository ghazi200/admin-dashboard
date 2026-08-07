/**
 * Migration: pending accept override window on shifts.
 * When a guard accepts an OPEN shift, assignment stays pending until
 * admin/supervisor overrides or the window expires (then CLOSED).
 */
"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable("shifts");

    if (!table.pending_guard_id) {
      await queryInterface.addColumn("shifts", "pending_guard_id", {
        type: Sequelize.UUID,
        allowNull: true,
      });
      console.log("✅ Added pending_guard_id to shifts");
    }
    if (!table.accept_pending_until) {
      await queryInterface.addColumn("shifts", "accept_pending_until", {
        type: Sequelize.DATE,
        allowNull: true,
      });
      console.log("✅ Added accept_pending_until to shifts");
    }
    if (!table.accepted_at) {
      await queryInterface.addColumn("shifts", "accepted_at", {
        type: Sequelize.DATE,
        allowNull: true,
      });
      console.log("✅ Added accepted_at to shifts");
    }
    if (!table.accept_source) {
      await queryInterface.addColumn("shifts", "accept_source", {
        type: Sequelize.STRING,
        allowNull: true,
      });
      console.log("✅ Added accept_source to shifts");
    }
  },

  async down(queryInterface) {
    const table = await queryInterface.describeTable("shifts");
    for (const col of [
      "accept_source",
      "accepted_at",
      "accept_pending_until",
      "pending_guard_id",
    ]) {
      if (table[col]) await queryInterface.removeColumn("shifts", col);
    }
  },
};
