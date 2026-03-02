"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("timesheet_lines", {
      id: {
        type: Sequelize.UUID,
        allowNull: false,
        primaryKey: true,
        defaultValue: Sequelize.UUIDV4,
      },

      timesheet_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "timesheets", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },

      shift_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: "shifts", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      },

      date: {
        type: Sequelize.DATEONLY,
        allowNull: false,
      },

      clock_in_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },

      clock_out_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },

      regular_hours: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0,
      },

      overtime_hours: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0,
      },

      double_time_hours: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0,
      },

      premium_hours: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0,
      },

      premium_type: {
        type: Sequelize.TEXT,
        allowNull: true,
      },

      has_exception: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },

      exception_type: {
        type: Sequelize.TEXT,
        allowNull: true,
      },

      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn("NOW"),
      },
    });

    // Add indexes
    await queryInterface.addIndex("timesheet_lines", ["timesheet_id"]);
    await queryInterface.addIndex("timesheet_lines", ["shift_id"]);
    await queryInterface.addIndex("timesheet_lines", ["date"]);
    await queryInterface.addIndex("timesheet_lines", ["timesheet_id", "date"]);
    await queryInterface.addIndex("timesheet_lines", ["has_exception"]);
  },

  async down(queryInterface) {
    await queryInterface.removeIndex("timesheet_lines", ["has_exception"]);
    await queryInterface.removeIndex("timesheet_lines", ["timesheet_id", "date"]);
    await queryInterface.removeIndex("timesheet_lines", ["date"]);
    await queryInterface.removeIndex("timesheet_lines", ["shift_id"]);
    await queryInterface.removeIndex("timesheet_lines", ["timesheet_id"]);

    await queryInterface.dropTable("timesheet_lines");
  },
};
