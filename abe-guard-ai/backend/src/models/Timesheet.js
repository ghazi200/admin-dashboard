const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/db");
const Tenant = require("./Tenant");
const Guard = require("./Guard");
const PayPeriod = require("./PayPeriod");
const Admin = require("./Admin");

const Timesheet = sequelize.define(
  "Timesheet",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },

    tenant_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: Tenant,
        key: "id",
      },
    },

    guard_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: Guard,
        key: "id",
      },
    },

    pay_period_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: PayPeriod,
        key: "id",
      },
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

    total_hours: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0,
    },

    status: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "DRAFT",
      validate: {
        isIn: [["DRAFT", "SUBMITTED", "APPROVED", "REJECTED", "PROCESSED"]],
      },
    },

    submitted_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },

    approved_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },

    approved_by_admin_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: Admin,
        key: "id",
      },
    },

    calculated_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },

    exceptions_count: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },

    exceptions_json: {
      type: DataTypes.JSONB,
      allowNull: true,
    },

    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },

    updated_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    tableName: "timesheets",
    timestamps: false,
    hooks: {
      beforeUpdate: (timesheet) => {
        timesheet.updated_at = new Date();
      },
    },
  }
);

module.exports = Timesheet;
