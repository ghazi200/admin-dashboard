const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/db");
const Timesheet = require("./Timesheet");
const Shift = require("./Shift");

const TimesheetLine = sequelize.define(
  "TimesheetLine",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },

    timesheet_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: Timesheet,
        key: "id",
      },
    },

    shift_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: Shift,
        key: "id",
      },
    },

    date: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },

    clock_in_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },

    clock_out_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },

    regular_hours: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0,
    },

    overtime_hours: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0,
    },

    double_time_hours: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0,
    },

    premium_hours: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0,
    },

    premium_type: {
      type: DataTypes.TEXT,
      allowNull: true,
    },

    has_exception: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },

    exception_type: {
      type: DataTypes.TEXT,
      allowNull: true,
    },

    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    tableName: "timesheet_lines",
    timestamps: false,
  }
);

module.exports = TimesheetLine;
