/**
 * Migration: callout eligibility pool — AI may only rank/contact eligible guards.
 * Default true so existing beta guards stay in the pool until admin opts them out.
 */
"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    const tableDescription = await queryInterface.describeTable("guards");
    if (!tableDescription.callout_eligible) {
      await queryInterface.addColumn("guards", "callout_eligible", {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      });
      console.log("✅ Added callout_eligible to guards table");
    } else {
      console.log("ℹ️  callout_eligible already exists");
    }
  },

  async down(queryInterface) {
    const tableDescription = await queryInterface.describeTable("guards");
    if (tableDescription.callout_eligible) {
      await queryInterface.removeColumn("guards", "callout_eligible");
    }
  },
};
