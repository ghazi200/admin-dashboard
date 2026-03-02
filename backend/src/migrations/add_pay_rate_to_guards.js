"use strict";

/**
 * Add optional pay_rate to guards (for full report).
 * Run: npx sequelize-cli db:migrate
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const table = "guards";
    try {
      const desc = await queryInterface.describeTable(table);
      if (!desc.pay_rate) {
        await queryInterface.addColumn(table, "pay_rate", {
          type: Sequelize.STRING(50),
          allowNull: true,
        });
        console.log("✅ Added pay_rate to guards");
      }
    } catch (e) {
      console.warn("add_pay_rate_to_guards:", e.message);
    }
  },

  async down(queryInterface) {
    try {
      await queryInterface.removeColumn("guards", "pay_rate");
    } catch (e) {
      console.warn("add_pay_rate_to_guards down:", e.message);
    }
  },
};
